"use server";

import { audit, fint, fstr, requireSuperAdmin, uniqueOrgSlug } from "@/lib/admin";
import { ADMIN_ORG_COOKIE } from "@/lib/auth";
import { ORG_TYPES } from "@/lib/brand";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ORG_TYPE_VALUES = ORG_TYPES.map((t) => t.value) as readonly string[];
const MEMBER_ROLES = ["owner", "admin", "teacher", "organizer", "supervisor", "corrector", "participant", "candidate", "parent", "student"];

async function uploadLogo(orgId: string, file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > 2 * 1024 * 1024 || !file.type.startsWith("image/")) return null;
  const admin = createAdminClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${orgId}/logo-${Date.now()}.${ext}`;
  const { error } = await admin.storage.from("org-logos").upload(path, file, { upsert: true });
  if (error) return null;
  return admin.storage.from("org-logos").getPublicUrl(path).data.publicUrl;
}

/** Find or create the auth user who will own / administer an organization. */
async function resolveUserByEmail(
  email: string,
  fullName: string | null,
  mode: "invite" | "create",
): Promise<{ id: string } | { error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return { id: existing.id };
  if (mode === "invite") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName ?? "" },
    });
    if (error || !data?.user) return { error: error?.message ?? "Could not invite that user." };
    return { id: data.user.id };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? "" },
    password: `Ev-${crypto.randomUUID()}!a9`,
  });
  if (error || !data?.user) return { error: error?.message ?? "Could not create that user." };
  // The random password above is a placeholder — send a set-password email.
  await admin.auth.resetPasswordForEmail(email);
  return { id: data.user.id };
}

export async function createOrganization(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();

  const name = fstr(formData, "name", 160);
  if (!name) redirect("/admin/organizations/new?e=name");
  const typeRaw = String(formData.get("type") ?? "school");
  const type = ORG_TYPE_VALUES.includes(typeRaw) ? typeRaw : "school";
  const status = String(formData.get("status")) === "suspended" ? "suspended" : "active";
  const notes = fstr(formData, "notes", 2000);

  // Ownership: the Super Admin, an existing user, or a newly invited/created user.
  const ownerMode = String(formData.get("owner_mode") ?? "me");
  let ownerId = ctx.user.id;
  if (ownerMode !== "me") {
    const email = fstr(formData, "owner_email", 200)?.toLowerCase();
    if (!email) redirect("/admin/organizations/new?e=owner");
    const resolved = await resolveUserByEmail(email!, fstr(formData, "owner_name", 160), ownerMode === "invite" ? "invite" : "create");
    if ("error" in resolved) redirect(`/admin/organizations/new?e=owner_failed`);
    ownerId = (resolved as { id: string }).id;
  }

  const slug = await uniqueOrgSlug(name!);
  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name,
      slug,
      type,
      owner_id: ownerId,
      status,
      description: fstr(formData, "description", 1000),
      country: fstr(formData, "country", 120),
      city: fstr(formData, "city", 120),
      address: fstr(formData, "address", 300),
      contact_email: fstr(formData, "contact_email", 200)?.toLowerCase() ?? null,
      contact_phone: fstr(formData, "contact_phone", 60),
      settings: notes ? { notes } : {},
    })
    .select("id")
    .single();
  if (error || !org) redirect("/admin/organizations/new?e=failed");

  await admin.from("organization_members").upsert(
    { organization_id: org.id, user_id: ownerId, role: "owner", status: "active" },
    { onConflict: "organization_id,user_id" },
  );

  // Optional logo upload.
  const logoUrl = await uploadLogo(org.id, formData.get("logo") as File | null);
  if (logoUrl) await admin.from("organizations").update({ logo_url: logoUrl }).eq("id", org.id);

  // Optional additional administrator (existing user by email, else invitation).
  const adminEmail = fstr(formData, "admin_email", 200)?.toLowerCase();
  if (adminEmail) {
    const { data: prof } = await admin.from("profiles").select("id").eq("email", adminEmail).maybeSingle();
    if (prof && prof.id !== ownerId) {
      await admin.from("organization_members").upsert(
        { organization_id: org.id, user_id: prof.id, role: "admin", status: "active" },
        { onConflict: "organization_id,user_id" },
      );
    } else if (!prof) {
      await admin.from("invitations").insert({
        organization_id: org.id, email: adminEmail, role: "admin", invited_by: ctx.user.id,
      });
    }
  }

  // Optional subscription arrangement — never a payment wall for the owner.
  const subMode = String(formData.get("sub_mode") ?? "none");
  const planId = fstr(formData, "plan_id", 60);
  if (subMode !== "none" && planId) {
    const { data: plan } = await admin.from("plans").select("trial_days").eq("id", planId).maybeSingle();
    if (plan) {
      if (subMode === "trial") {
        const days = Math.max(1, fint(formData, "trial_days") ?? plan.trial_days ?? 14);
        const end = new Date(Date.now() + days * 86400000);
        await admin.from("subscriptions").insert({
          organization_id: org.id, plan_id: planId, status: "trialing", source: "trial",
          granted_by: ctx.user.id, trial_ends_at: end.toISOString(),
          notes: "Trial arranged by Super Admin at organization creation.",
        });
      } else {
        const months = Math.max(1, fint(formData, "grant_months") ?? 12);
        const end = new Date();
        end.setMonth(end.getMonth() + months);
        await admin.from("subscriptions").insert({
          organization_id: org.id, plan_id: planId, status: "active", source: "admin_grant",
          granted_by: ctx.user.id, billing_period: months >= 12 ? "yearly" : "one_time",
          current_period_start: new Date().toISOString(), current_period_end: end.toISOString(),
          notes: "Complimentary access granted by Super Admin — no payment recorded.",
        });
      }
    }
  }

  await audit(ctx, "organization.created", "organizations", org.id, org.id, { name, type, ownerMode, subMode });
  revalidatePath("/admin/organizations");
  redirect(`/admin/organizations/${org.id}?ok=created`);
}

export async function updateOrganization(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const { data: org } = await admin.from("organizations").select("settings").eq("id", id).maybeSingle();
  if (!org) redirect("/admin/organizations");

  const typeRaw = String(formData.get("type") ?? "school");
  const notes = fstr(formData, "notes", 2000);
  const settings = { ...((org!.settings as Record<string, unknown>) ?? {}), notes: notes ?? undefined };
  if (!notes) delete settings.notes;

  const patch: Record<string, unknown> = {
    name: fstr(formData, "name", 160),
    type: ORG_TYPE_VALUES.includes(typeRaw) ? typeRaw : "school",
    description: fstr(formData, "description", 1000),
    country: fstr(formData, "country", 120),
    city: fstr(formData, "city", 120),
    address: fstr(formData, "address", 300),
    contact_email: fstr(formData, "contact_email", 200)?.toLowerCase() ?? null,
    contact_phone: fstr(formData, "contact_phone", 60),
    settings,
  };
  const logoUrl = await uploadLogo(id, formData.get("logo") as File | null);
  if (logoUrl) patch.logo_url = logoUrl;
  if (formData.get("remove_logo") === "on") patch.logo_url = null;

  await admin.from("organizations").update(patch).eq("id", id);
  await audit(ctx, "organization.updated", "organizations", id, id);
  revalidatePath(`/admin/organizations/${id}`);
  redirect(`/admin/organizations/${id}?ok=saved`);
}

export async function deleteOrganization(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") redirect(`/admin/organizations/${id}?e=confirm`);
  const { data: org } = await admin.from("organizations").select("name, status").eq("id", id).maybeSingle();
  if (!org) redirect("/admin/organizations");
  if (org!.status !== "archived") redirect(`/admin/organizations/${id}?e=archive_first`);
  await audit(ctx, "organization.deleted", "organizations", id, null, { name: org!.name });
  await admin.from("organizations").delete().eq("id", id);
  revalidatePath("/admin/organizations");
  redirect("/admin/organizations?ok=deleted");
}

export async function transferOwnership(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const email = fstr(formData, "owner_email", 200)?.toLowerCase();
  if (!email) redirect(`/admin/organizations/${orgId}?tab=members&e=owner`);
  const resolved = await resolveUserByEmail(email!, fstr(formData, "owner_name", 160), "invite");
  if ("error" in resolved) redirect(`/admin/organizations/${orgId}?tab=members&e=owner_failed`);
  const newOwnerId = (resolved as { id: string }).id;

  const { data: org } = await admin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
  if (!org) redirect("/admin/organizations");
  await admin.from("organizations").update({ owner_id: newOwnerId }).eq("id", orgId);
  await admin.from("organization_members").upsert(
    { organization_id: orgId, user_id: newOwnerId, role: "owner", status: "active" },
    { onConflict: "organization_id,user_id" },
  );
  if (org!.owner_id !== newOwnerId) {
    await admin
      .from("organization_members")
      .update({ role: "admin" })
      .eq("organization_id", orgId)
      .eq("user_id", org!.owner_id)
      .eq("role", "owner");
  }
  await audit(ctx, "organization.ownership_transferred", "organizations", orgId, orgId, { to: email });
  revalidatePath(`/admin/organizations/${orgId}`);
  redirect(`/admin/organizations/${orgId}?tab=members&ok=owner_changed`);
}

export async function addOrgMember(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const email = fstr(formData, "email", 200)?.toLowerCase();
  const roleRaw = String(formData.get("role") ?? "teacher");
  const role = MEMBER_ROLES.includes(roleRaw) && roleRaw !== "owner" ? roleRaw : "teacher";
  if (!email) redirect(`/admin/organizations/${orgId}?tab=members&e=email`);

  const { data: prof } = await admin.from("profiles").select("id").eq("email", email!).maybeSingle();
  if (prof) {
    await admin.from("organization_members").upsert(
      { organization_id: orgId, user_id: prof.id, role, status: "active" },
      { onConflict: "organization_id,user_id" },
    );
    await admin.from("notifications").insert({
      user_id: prof.id, type: "info",
      title: "You were added to an organization",
      body: `An EVALORA administrator added you as ${role}. Open your dashboard to get started.`,
      link: "/dashboard",
    });
    await audit(ctx, "organization.member_added", "organization_members", prof.id, orgId, { role });
    redirect(`/admin/organizations/${orgId}?tab=members&ok=member_added`);
  }
  await admin.from("invitations").insert({
    organization_id: orgId, email: email!, role, invited_by: ctx.user.id,
  });
  await audit(ctx, "organization.member_invited", "invitations", orgId, orgId, { email, role });
  redirect(`/admin/organizations/${orgId}?tab=members&ok=invited`);
}

export async function updateOrgMember(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const memberId = String(formData.get("member_id"));
  const op = String(formData.get("op"));
  const { data: member } = await admin
    .from("organization_members")
    .select("id, user_id, role")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!member) redirect(`/admin/organizations/${orgId}?tab=members`);

  if (op === "role") {
    const roleRaw = String(formData.get("role") ?? "");
    if (!MEMBER_ROLES.includes(roleRaw) || roleRaw === "owner" || member!.role === "owner") {
      redirect(`/admin/organizations/${orgId}?tab=members&e=role`);
    }
    await admin.from("organization_members").update({ role: roleRaw }).eq("id", memberId);
    await audit(ctx, "organization.member_role_changed", "organization_members", memberId, orgId, { role: roleRaw });
  } else if (op === "suspend" || op === "activate") {
    await admin.from("organization_members").update({ status: op === "suspend" ? "suspended" : "active" }).eq("id", memberId);
    await audit(ctx, `organization.member_${op}d`, "organization_members", memberId, orgId);
  } else if (op === "remove") {
    if (member!.role === "owner") redirect(`/admin/organizations/${orgId}?tab=members&e=owner_remove`);
    await admin.from("organization_members").delete().eq("id", memberId);
    await audit(ctx, "organization.member_removed", "organization_members", memberId, orgId);
  }
  revalidatePath(`/admin/organizations/${orgId}`);
  redirect(`/admin/organizations/${orgId}?tab=members&ok=member_updated`);
}

export async function revokeOrgInvitation(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const id = String(formData.get("id"));
  await admin.from("invitations").update({ status: "revoked" }).eq("id", id).eq("organization_id", orgId);
  await audit(ctx, "organization.invitation_revoked", "invitations", id, orgId);
  redirect(`/admin/organizations/${orgId}?tab=members&ok=invitation_revoked`);
}

/** Enter an organization workspace (administrative access mode). */
export async function enterOrgWorkspace(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const orgId = String(formData.get("organization_id"));
  const { data: org } = await admin.from("organizations").select("id, name").eq("id", orgId).maybeSingle();
  if (!org) redirect("/admin/organizations");
  const nextRaw = String(formData.get("next") ?? "/dashboard");
  const next = nextRaw.startsWith("/dashboard") ? nextRaw : "/dashboard";
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_ORG_COOKIE, org!.id, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12,
  });
  await audit(ctx, "organization.admin_access_started", "organizations", org!.id, org!.id, { next });
  redirect(next);
}

export async function exitOrgWorkspace() {
  const ctx = await requireSuperAdmin();
  const cookieStore = await cookies();
  const orgId = cookieStore.get(ADMIN_ORG_COOKIE)?.value;
  cookieStore.delete(ADMIN_ORG_COOKIE);
  if (orgId) await audit(ctx, "organization.admin_access_ended", "organizations", orgId, orgId);
  redirect(orgId ? `/admin/organizations/${orgId}` : "/admin/organizations");
}
