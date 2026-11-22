"use server";

import { audit } from "@/lib/admin";
import { activeOrg, can, MANAGER_ROLES, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Server actions for teacher faculty management.
 * All mutations verify manager permissions (owner/admin) in the caller's active organization.
 */

async function verifyTeacherMembership(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  memberId: string,
) {
  const { data: member } = await admin
    .from("organization_members")
    .select("id, user_id, role, status, organization_id")
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!member) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, platform_role, status")
    .eq("id", member.user_id)
    .maybeSingle();

  return { member, profile };
}

/** Update teacher display name. */
export async function updateTeacherName(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/teachers?e=forbidden");
  }

  const memberId = String(formData.get("member_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 160);
  if (!fullName) redirect("/dashboard/teachers?e=name");

  const admin = createAdminClient();
  const target = await verifyTeacherMembership(admin, org.id, memberId);
  if (!target?.profile) redirect("/dashboard/teachers?e=missing");

  // Prevent touching platform super admin accounts
  if (target.profile.platform_role === "super_admin") {
    redirect("/dashboard/teachers?e=protected");
  }

  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", target.profile.id);

  if (error) redirect("/dashboard/teachers?e=failed");

  await audit(ctx, "teacher.name_updated", "profiles", target.profile.id, org.id, {
    old_name: target.profile.full_name,
    new_name: fullName,
  });

  revalidatePath("/dashboard/teachers");
  revalidatePath("/dashboard/academics/classes");
  redirect("/dashboard/teachers?ok=teacher_updated");
}

/** Toggle teacher account status (active / suspended). */
export async function setTeacherStatus(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/teachers?e=forbidden");
  }

  const memberId = String(formData.get("member_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["active", "suspended"].includes(status)) {
    redirect("/dashboard/teachers?e=status");
  }

  const admin = createAdminClient();
  const target = await verifyTeacherMembership(admin, org.id, memberId);
  if (!target?.member) redirect("/dashboard/teachers?e=missing");

  // Prevent modifying owner membership
  if (target.member.role === "owner") {
    redirect("/dashboard/teachers?e=owner");
  }

  const { error } = await admin
    .from("organization_members")
    .update({ status })
    .eq("id", target.member.id)
    .eq("organization_id", org.id);

  if (error) redirect("/dashboard/teachers?e=failed");

  await audit(ctx, `teacher.status_${status}`, "organization_members", target.member.id, org.id, {
    email: target.profile?.email,
    user_id: target.member.user_id,
  });

  revalidatePath("/dashboard/teachers");
  revalidatePath("/dashboard/team");
  redirect(`/dashboard/teachers?ok=${status === "active" ? "teacher_reactivated" : "teacher_suspended"}`);
}

/** Assign teacher to specific classes within this organization. */
export async function assignTeacherClasses(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/teachers?e=forbidden");
  }

  const teacherUserId = String(formData.get("teacher_user_id") ?? "");
  if (!teacherUserId) redirect("/dashboard/teachers?e=missing");

  const admin = createAdminClient();

  // Verify the target user is indeed a member of this organization
  const { data: member } = await admin
    .from("organization_members")
    .select("id, user_id, role")
    .eq("organization_id", org.id)
    .eq("user_id", teacherUserId)
    .maybeSingle();

  if (!member) redirect("/dashboard/teachers?e=missing");

  // Selected class IDs
  const rawClassIds = formData.getAll("class_ids").map((v) => String(v).trim()).filter(Boolean);

  // Unassign all classes in this org currently assigned to this teacher that are not in the new selection
  let unassignQuery = admin
    .from("classes")
    .update({ teacher_id: null })
    .eq("organization_id", org.id)
    .eq("teacher_id", teacherUserId);

  if (rawClassIds.length > 0) {
    unassignQuery = unassignQuery.not("id", "in", `(${rawClassIds.join(",")})`);
  }
  await unassignQuery;

  // Assign the selected classes to this teacher
  if (rawClassIds.length > 0) {
    const { error: assignError } = await admin
      .from("classes")
      .update({ teacher_id: teacherUserId })
      .eq("organization_id", org.id)
      .in("id", rawClassIds);

    if (assignError) redirect("/dashboard/teachers?e=failed");
  }

  await audit(ctx, "teacher.classes_assigned", "classes", teacherUserId, org.id, {
    assigned_classes: rawClassIds,
  });

  revalidatePath("/dashboard/teachers");
  revalidatePath("/dashboard/academics/classes");
  redirect("/dashboard/teachers?ok=classes_assigned");
}

/** Send password setup / reset email for a teacher. */
export async function sendTeacherPasswordReset(formData: FormData) {
  const ctx = await requireUser();
  const org = activeOrg(ctx);
  if (!org || !can(ctx, org.id, MANAGER_ROLES)) {
    redirect("/dashboard/teachers?e=forbidden");
  }

  const memberId = String(formData.get("member_id") ?? "");
  const admin = createAdminClient();
  const target = await verifyTeacherMembership(admin, org.id, memberId);
  if (!target?.profile?.email) redirect("/dashboard/teachers?e=no_email");

  const { error: resetError } = await admin.auth.resetPasswordForEmail(target.profile.email);
  if (resetError) {
    // If SMTP is not configured, generate link verification
    const { error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: target.profile.email,
    });
    if (linkError) redirect("/dashboard/teachers?e=reset_failed");

    await audit(ctx, "teacher.password_reset_blocked", "organization_members", target.member.id, org.id, {
      email: target.profile.email,
      reason: "mail_delivery_unavailable",
    });
    revalidatePath("/dashboard/teachers");
    redirect("/dashboard/teachers?ok=reset_link");
  }

  await audit(ctx, "teacher.password_reset_sent", "organization_members", target.member.id, org.id, {
    email: target.profile.email,
  });

  revalidatePath("/dashboard/teachers");
  redirect("/dashboard/teachers?ok=reset_sent");
}
