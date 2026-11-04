import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";
import { AdminShell, type ShellCounts } from "./AdminShell";

async function count(query: PromiseLike<{ count: number | null }>) {
  try {
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireSuperAdmin();
  const admin = createAdminClient();

  const head = { count: "exact" as const, head: true };
  const [payments, tickets, incidents, unread, platformOrg] = await Promise.all([
    count(admin.from("payment_requests").select("id", head).eq("status", "pending")),
    count(admin.from("support_tickets").select("id", head).eq("status", "open")),
    count(admin.from("proctoring_incidents").select("id", head).eq("status", "open")),
    count(admin.from("notifications").select("id", head).eq("user_id", ctx.user.id).is("read_at", null)),
    admin.from("organizations").select("id").eq("slug", "evalora-platform").maybeSingle(),
  ]);

  const counts: ShellCounts = { payments, tickets, incidents, unread };

  return (
    <AdminShell
      email={ctx.profile.email}
      isPrimary={Boolean(ctx.profile.is_primary)}
      counts={counts}
      platformOrgId={platformOrg.data?.id ?? null}
      adminContextName={ctx.adminOrgContext?.name ?? null}
    >
      {children}
    </AdminShell>
  );
}
