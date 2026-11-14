import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Card, EmptyState, PageTitle, StatCard } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { Bell, CheckCircle2, MailOpen } from "lucide-react";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

async function markAllRead() {
  "use server";
  const ctx = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user.id).is("read_at", null);
  revalidatePath("/dashboard/notifications");
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const ctx = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const supabase = await createClient();

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (sp.view === "unread") query = query.is("read_at", null);

  const [{ data, count: totalShown }, { count: totalAll }, { count: unreadCount }] = await Promise.all([
    query,
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id).is("read_at", null),
  ]);

  return (
    <>
      <PageTitle
        eyebrow="Workspace Inbox · Alerts & Decisions"
        title="Notifications"
        subtitle="Payment decisions, retake resolutions, invitations and platform events."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={sp.view === "unread" ? "/dashboard/notifications" : "/dashboard/notifications?view=unread"} variant="outline">
              {sp.view === "unread" ? "Show all" : "Unread only"}
            </ButtonLink>
            <form action={markAllRead}><Button variant="outline" type="submit">Mark all as read</Button></form>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Unread notifications" value={unreadCount ?? 0} icon={<Bell className="h-5 w-5" />} />
        <StatCard label="Read" value={Math.max(0, (totalAll ?? 0) - (unreadCount ?? 0))} icon={<MailOpen className="h-5 w-5" />} />
        <StatCard label="Total received" value={totalAll ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      {(data ?? []).length === 0 ? (
        <EmptyState
          title={sp.view === "unread" ? "No unread notifications" : "All caught up"}
          body={sp.view === "unread" ? "Every notification in your inbox has been read." : "Notifications about payments, invitations and results will appear here."}
        />
      ) : (
        <>
          <div className="space-y-3">
            {(data ?? []).map((n) => (
              <Card key={n.id} className={`p-4 ${n.read_at ? "opacity-75" : "border-l-4 border-l-gold-500"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-evergreen-950">{n.title}</p>
                      {!n.read_at && <Badge tone="gold">Unread</Badge>}
                    </div>
                    {n.body && <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>}
                    {n.link && (
                      <Link href={n.link} className="mt-1 inline-block text-sm font-medium text-evergreen-700 underline underline-offset-2">Open →</Link>
                    )}
                  </div>
                  <span className="text-xs text-ink-soft">{fmtDateTime(n.created_at)}</span>
                </div>
              </Card>
            ))}
          </div>
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={totalShown ?? 0}
            pathname="/dashboard/notifications"
            query={{ view: sp.view }}
            label="notifications"
          />
        </>
      )}
    </>
  );
}
