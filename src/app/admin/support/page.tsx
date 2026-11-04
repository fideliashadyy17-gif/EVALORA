import { Badge, Card, PageTitle } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import type { Metadata } from "next";
import { setTicketStatus } from "../actions";

export const metadata: Metadata = { title: "Support tickets" };
export const dynamic = "force-dynamic";

export default async function AdminSupport() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(50);

  return (
    <>
      <PageTitle title="Support tickets" subtitle="Messages from the public contact form. Reply by email, then update the status here." />
      <div className="space-y-4">
        {(data ?? []).map((t) => (
          <Card key={t.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{t.subject}</p>
                <p className="text-sm text-ink-soft">{t.name} · {t.email} · {fmtDateTime(t.created_at)}</p>
              </div>
              <Badge tone={t.status === "open" ? "amber" : t.status === "closed" ? "gray" : "green"}>{t.status.replace(/_/g, " ")}</Badge>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{t.message}</p>
            <div className="mt-3 flex gap-3">
              {(["open", "in_progress", "closed"] as const).filter((s) => s !== t.status).map((s) => (
                <form key={s} action={setTicketStatus}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="status" value={s} />
                  <button className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Mark {s.replace(/_/g, " ")}</button>
                </form>
              ))}
              {t.email && (
                <a href={`mailto:${t.email}?subject=Re: ${encodeURIComponent(t.subject)}`} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Reply by email</a>
              )}
            </div>
          </Card>
        ))}
        {(data ?? []).length === 0 && <p className="text-sm text-ink-soft">No tickets yet.</p>}
      </div>
    </>
  );
}
