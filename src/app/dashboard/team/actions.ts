"use server";

import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/brand";
import { getEntitlement, withinLimit } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function inviteMember(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/team");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "teacher");
  if (!email.includes("@") || !ORG_ROLES.some((r) => r.value === role) || role === "owner")
    redirect("/dashboard/team?e=invalid");

  const supabase = await createClient();
  const ent = await getEntitlement(supabase, org.id);
  const { count } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  if (!withinLimit(ent.limits.max_members, count ?? 0)) redirect("/dashboard/team?e=limit");

  await supabase.from("invitations").insert({
    organization_id: org.id,
    email,
    role,
    invited_by: ctx.user.id,
  });
  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?invited=1");
}

export async function revokeInvitation(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/team");
  const supabase = await createClient();
  await supabase.from("invitations").update({ status: "revoked" }).eq("id", String(formData.get("id"))).eq("organization_id", org.id);
  revalidatePath("/dashboard/team");
}

export async function updateMemberRole(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/team");
  const memberId = String(formData.get("id"));
  const role = String(formData.get("role"));
  const supabase = await createClient();
  const { data: member } = await supabase.from("organization_members").select("*").eq("id", memberId).eq("organization_id", org.id).single();
  if (!member || member.role === "owner") redirect("/dashboard/team?e=owner");
  await supabase.from("organization_members").update({ role }).eq("id", memberId);
  revalidatePath("/dashboard/team");
}

export async function removeMember(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx)!;
  if (!can(ctx, org.id, MANAGER_ROLES)) redirect("/dashboard/team");
  const memberId = String(formData.get("id"));
  const supabase = await createClient();
  const { data: member } = await supabase.from("organization_members").select("*").eq("id", memberId).eq("organization_id", org.id).single();
  if (!member || member.role === "owner") redirect("/dashboard/team?e=owner");
  await supabase.from("organization_members").delete().eq("id", memberId);
  revalidatePath("/dashboard/team");
}
