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
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user.id).is("read_at", null);
  revalidatePath("/dashboard/notifications");
}

export default async function NotificationsPage() {
  const ctx = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <PageTitle
        title="Notifications"
        subtitle="Payment decisions, invitations and platform events."
        action={<form action={markAllRead}><Button variant="outline" type="submit">Mark all as read</Button></form>}
      />
      {(data ?? []).length === 0 ? (
        <EmptyState title="All caught up" body="Notifications about payments, invitations and results will appear here." />
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((n) => (
            <Card key={n.id} className={`p-4 ${n.read_at ? "opacity-70" : "border-l-4 border-l-gold-500"}`}>
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
