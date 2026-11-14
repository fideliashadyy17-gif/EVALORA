import { CollectionToolbar, type CollectionParams } from "@/components/dashboard/CollectionToolbar";
import { pageNumber } from "@/lib/pagination";
import { redirect } from "next/navigation";
import { Button, Card, EmptyState, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

async function markAllRead() {
  "use server";
  const ctx = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user.id).is("read_at", null);
  if (error) redirect("/dashboard/notifications?e=save");
  revalidatePath("/dashboard/notifications");
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<CollectionParams & { e?: string }> }) {
  const ctx = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const page = pageNumber(sp.page);
  const pageSize = 20;
  const statuses = ["unread", "read"];
  let query = supabase.from("notifications").select("*", { count: "exact" }).eq("user_id", ctx.user.id);
  if (sp.q?.trim()) query = query.ilike("title", `%${sp.q.trim().slice(0, 160).replace(/[%_\\]/g, " ")}%`);
  if (sp.status === "unread") query = query.is("read_at", null);
  if (sp.status === "read") query = query.not("read_at", "is", null);
  query = sp.sort === "title" ? query.order("title") : query.order("created_at", { ascending: sp.sort === "oldest" });
  const { data, count, error } = await query.order("id").range((page - 1) * pageSize, page * pageSize - 1);

  return (
    <>
      <PageTitle
        title="Notifications"
        subtitle="Payment decisions, invitations and platform events."
        action={<form action={markAllRead}><Button variant="outline" type="submit">Mark all as read</Button></form>}
      />
      {sp.e === "save" && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">Notifications could not be marked as read. Please try again.</p>}
      <CollectionToolbar path="/dashboard/notifications" params={{ q: sp.q, status: sp.status, sort: sp.sort }} statuses={statuses} page={page} pageSize={pageSize} total={count ?? 0} noun="notifications" failed={Boolean(error)} />
      {error ? null : (data ?? []).length === 0 ? (
        <EmptyState title="All caught up" body="Notifications about payments, invitations and results will appear here." />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((n) => (
            <Card key={n.id} className={`p-4 ${n.read_at ? "border-evergreen-900/10" : "border-l-4 border-l-gold-500"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-evergreen-950">{n.title}</p>
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
      )}
    </>
  );
}
