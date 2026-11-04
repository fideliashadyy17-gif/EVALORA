"use server";

import { audit, FLASH_COOKIE, fstr, requireSuperAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const MEMBER_ROLES = ["owner", "admin", "teacher", "organizer", "supervisor", "corrector", "participant", "candidate", "parent", "student"];

/** One-time, httpOnly flash (e.g. a generated temporary password shown once). */
async function setFlash(message: string) {
  const store = await cookies();
  store.set(FLASH_COOKIE, encodeURIComponent(message), {
    httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 120,
  });
}

export async function createUserAccount(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const email = fstr(formData, "email", 200)?.toLowerCase();
  const fullName = fstr(formData, "full_name", 160);
  const mode = String(formData.get("mode") ?? "invite");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/admin/users/new?e=email");

  const { data: existing } = await admin.from("profiles").select("id").eq("email", email!).maybeSingle();
  if (existing) redirect(`/admin/users/${existing.id}?e=exists`);

  let userId: string | null = null;
  let tempPassword: string | null = null;
  if (mode === "password") {
    tempPassword = `Ev!${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}a9`;
    const { data, error } = await admin.auth.admin.createUser({
      email: email!, password: tempPassword, email_confirm: true,
      user_metadata: { full_name: fullName ?? "" },
    });
    if (error || !data?.user) redirect("/admin/users/new?e=failed");
    userId = data!.user.id;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email!, {
      data: { full_name: fullName ?? "" },
    });
    if (error || !data?.user) redirect("/admin/users/new?e=failed");
    userId = data!.user.id;
  }

  // Optional organization membership on creation.
  const orgId = fstr(formData, "organization_id", 60);
  const roleRaw = String(formData.get("role") ?? "teacher");
  if (orgId) {
    const role = MEMBER_ROLES.includes(roleRaw) ? roleRaw : "teacher";
    await admin.from("organization_members").upsert(
      { organization_id: orgId, user_id: userId, role, status: "active" },
      { onConflict: "organization_id,user_id" },
    );
    await admin.from("notifications").insert({
      user_id: userId, type: "info",
      title: "Welcome to EVALORA",
      body: `Your account was created by an administrator with the role ${role}.`,
      link: "/dashboard",
    });
  }

  await audit(ctx, "user.created", "profiles", userId!, orgId ?? null, { email, mode });
  if (tempPassword) {
    await setFlash(
      `Temporary password for ${email}: ${tempPassword} — share it privately; the user should change it in Settings after first sign-in. This is shown once.`,
    );
  }
  revalidatePath("/admin/users");
  redirect(`/admin/users/${userId}?ok=created`);
}

export async function updateUserAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  await admin.from("profiles").update({ full_name: fstr(formData, "full_name", 160) }).eq("id", id);
  await audit(ctx, "user.updated", "profiles", id);
  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?ok=saved`);
}

export async function sendPasswordResetAdmin(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const back = String(formData.get("back") ?? `/admin/users/${id}`);
  const { data: profile } = await admin.from("profiles").select("email").eq("id", id).maybeSingle();
  if (!profile) redirect(back);
  const { error } = await admin.auth.resetPasswordForEmail(profile!.email);
  await audit(ctx, "user.password_reset_sent", "profiles", id, null, { delivered: !error });
  redirect(`${back}${back.includes("?") ? "&" : "?"}${error ? "e=reset_failed" : "ok=reset_sent"}`);
}

export async function setSuperAdminRole(formData: FormData) {
  const ctx = await requireSuperAdmin();
  // Only the Primary Super Admin may create or remove administrators.
  if (!ctx.profile.is_primary) redirect("/admin/users?e=primary_only");
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  const grant = String(formData.get("grant")) === "1";
  if (formData.get("confirm") !== "on") redirect(`/admin/users/${id}?e=confirm`);

  const { data: target } = await admin
    .from("profiles")
    .select("id, email, platform_role, is_primary")
    .eq("id", id)
    .maybeSingle();
  if (!target) redirect("/admin/users");
  if (target!.is_primary) redirect(`/admin/users/${id}?e=primary_protected`);
  if (id === ctx.user.id) redirect(`/admin/users/${id}?e=self`);

  await admin.from("profiles").update({ platform_role: grant ? "super_admin" : "user" }).eq("id", id);
  await admin.from("notifications").insert({
    user_id: id, type: "security",
    title: grant ? "You are now a platform administrator" : "Administrator access removed",
    body: grant
      ? "The platform owner granted you Super Admin access. Handle it with care — actions are audit-logged."
      : "Your Super Admin access was removed by the platform owner.",
    link: grant ? "/admin" : "/dashboard",
  });
  await audit(ctx, grant ? "user.super_admin_granted" : "user.super_admin_revoked", "profiles", id, null, { email: target!.email });
  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?ok=${grant ? "admin_granted" : "admin_revoked"}`);
}

export async function userMembershipOp(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const userId = String(formData.get("user_id"));
  const op = String(formData.get("op"));

  if (op === "add") {
    const orgId = fstr(formData, "organization_id", 60);
    const roleRaw = String(formData.get("role") ?? "teacher");
    const role = MEMBER_ROLES.includes(roleRaw) && roleRaw !== "owner" ? roleRaw : "teacher";
    if (!orgId) redirect(`/admin/users/${userId}?e=org`);
    await admin.from("organization_members").upsert(
      { organization_id: orgId, user_id: userId, role, status: "active" },
      { onConflict: "organization_id,user_id" },
    );
    await audit(ctx, "user.membership_added", "organization_members", userId, orgId, { role });
  } else if (op === "role") {
    const memberId = String(formData.get("member_id"));
    const roleRaw = String(formData.get("role") ?? "");
    if (!MEMBER_ROLES.includes(roleRaw) || roleRaw === "owner") redirect(`/admin/users/${userId}?e=role`);
    await admin.from("organization_members").update({ role: roleRaw }).eq("id", memberId).eq("user_id", userId).neq("role", "owner");
    await audit(ctx, "user.membership_role_changed", "organization_members", memberId, null, { role: roleRaw });
  } else if (op === "remove") {
    const memberId = String(formData.get("member_id"));
    await admin.from("organization_members").delete().eq("id", memberId).eq("user_id", userId).neq("role", "owner");
    await audit(ctx, "user.membership_removed", "organization_members", memberId);
  }
  revalidatePath(`/admin/users/${userId}`);
  redirect(`/admin/users/${userId}?ok=membership_updated`);
}

export async function deleteUserAccount(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();
  const id = String(formData.get("id"));
  if (formData.get("confirm") !== "on") redirect(`/admin/users/${id}?e=confirm`);
  const { data: target } = await admin
    .from("profiles")
    .select("email, platform_role, is_primary")
    .eq("id", id)
    .maybeSingle();
  if (!target) redirect("/admin/users");
  if (target!.is_primary || id === ctx.user.id) redirect(`/admin/users/${id}?e=primary_protected`);
  if (target!.platform_role === "super_admin" && !ctx.profile.is_primary) redirect(`/admin/users/${id}?e=primary_only`);

  await audit(ctx, "user.deleted", "profiles", id, null, { email: target!.email });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) redirect(`/admin/users/${id}?e=delete_failed`);
  revalidatePath("/admin/users");
  redirect("/admin/users?ok=user_deleted");
}

/** Clear the one-time flash after it has been displayed (client-called). */
export async function clearFlash() {
  await requireSuperAdmin();
  const store = await cookies();
  store.delete(FLASH_COOKIE);
}
