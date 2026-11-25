"use server";

import { activeOrg, requireUser } from "@/lib/auth";
import { OPERATIONAL_STAFF_MEMBER_ROLES } from "@/lib/accountCreationPolicy";
import { resolveAuthorizedAccountCreationRole } from "@/lib/accountCreationRoles";
import { canOperate } from "@/lib/operationalAccess";
import { getEntitlementFor, withinLimit } from "@/lib/entitlements";
import { normalizeAccountEmail } from "@/lib/organizationAccounts";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function inviteMember(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "organizations.manage_members", "team"))) redirect("/dashboard/team");

  const email = normalizeAccountEmail(String(formData.get("email") ?? ""));
  const requestedRole = String(formData.get("role") ?? "teacher");
  if (!email) redirect("/dashboard/team?e=invalid");

  const selectedRole = await resolveAuthorizedAccountCreationRole(ctx, org.id, requestedRole);
  if (!selectedRole) redirect("/dashboard/team?e=invalid");

  const supabase = await createClient();
  const ent = await getEntitlementFor(supabase, ctx, org.id);
  const { count } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  if (!withinLimit(ent.limits.max_members, count ?? 0)) redirect("/dashboard/team?e=limit");

  const admin = createAdminClient();
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, platform_role")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    if (existingProfile.platform_role === "super_admin") redirect("/dashboard/team?e=owner");
    const { data: existingMember } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", org.id)
      .eq("user_id", existingProfile.id)
      .maybeSingle();
    if (existingMember) redirect("/dashboard/team?e=exists");

    if (selectedRole.slug === "school_founder") {
      const { data: activeStaff } = await admin
        .from("organization_members")
        .select("role")
        .eq("user_id", existingProfile.id)
        .eq("status", "active");
      if ((activeStaff ?? []).some((m) => OPERATIONAL_STAFF_MEMBER_ROLES.has(m.role))) {
        redirect("/dashboard/team?e=founder_conflict");
      }
    }
  }

  // Avoid duplicate pending invitations for the same email in this organization.
  const { data: existingPending } = await admin
    .from("invitations")
    .select("id")
    .eq("organization_id", org.id)
    .ilike("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) redirect("/dashboard/team?e=exists");

  await supabase.from("invitations").insert({
    organization_id: org.id,
    email,
    role: selectedRole.memberRole,
    invited_by: ctx.user.id,
  });
  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?invited=1");
}

export async function revokeInvitation(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "organizations.manage_members", "team"))) redirect("/dashboard/team");
  const supabase = await createClient();
  await supabase.from("invitations").update({ status: "revoked" }).eq("id", String(formData.get("id"))).eq("organization_id", org.id);
  revalidatePath("/dashboard/team");
}

export async function updateMemberRole(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "organizations.manage_members", "team"))) redirect("/dashboard/team");
  const memberId = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!["admin", "teacher", "organizer", "supervisor", "corrector", "student", "candidate"].includes(role)) redirect("/dashboard/team?e=role");
  const supabase = await createClient();
  const { data: member } = await supabase.from("organization_members").select("*").eq("id", memberId).eq("organization_id", org.id).single();
  if (!member || member.role === "owner" || member.role === "school_founder") redirect("/dashboard/team?e=owner");
  await supabase.from("organization_members").update({ role }).eq("id", memberId);
  revalidatePath("/dashboard/team");
}

export async function removeMember(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !(await canOperate(ctx, org.id, "organizations.manage_members", "team"))) redirect("/dashboard/team");
  const memberId = String(formData.get("id"));
  const supabase = await createClient();
  const { data: member } = await supabase.from("organization_members").select("*").eq("id", memberId).eq("organization_id", org.id).single();
  if (!member || member.role === "owner") redirect("/dashboard/team?e=owner");
  await supabase.from("organization_members").delete().eq("id", memberId);
  revalidatePath("/dashboard/team");
}
