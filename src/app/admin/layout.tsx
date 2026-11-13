import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";
import { AdminShell, type ShellCounts } from "./AdminShell";

const SHELL_QUERY_TIMEOUT_MS = 4_000;

async function withShellTimeout<T>(query: PromiseLike<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      Promise.resolve(query),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), SHELL_QUERY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function count(query: PromiseLike<{ count: number | null }>) {
  const result = await withShellTimeout(query, { count: 0 });
  return result.count ?? 0;
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
    withShellTimeout<{ data: { id: string } | null }>(
      admin.from("organizations").select("id").eq("slug", "evalora-platform").maybeSingle(),
      { data: null },
    ),
  ]);

  const counts: ShellCounts = { payments, tickets, incidents, unread };

  return (
    <AdminShell
      email={ctx.profile.email}
      isPrimary={Boolean(ctx.profile.is_primary)}
      counts={counts}
      platformOrgId={platformOrg.data?.id ?? null}
    >
      {children}
    </AdminShell>
  );
}
