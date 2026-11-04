import { StaticPage } from "@/components/site/StaticPage";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

function lim(v: number | boolean | undefined, suffix = "") {
  if (typeof v === "boolean") return v ? "Included" : "—";
  if (v === undefined) return "—";
  return v === -1 ? "Unlimited" : `${v}${suffix}`;
}

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: plans } = await supabase.from("plans").select("*").eq("is_active", true).order("sort");

  const rows: { label: string; key: string; suffix?: string }[] = [
    { label: "Quizzes", key: "max_quizzes" },
    { label: "Question bank size", key: "max_questions" },
    { label: "Participants per live session", key: "max_participants_per_session" },
    { label: "Examinations", key: "max_exams" },
    { label: "Team members", key: "max_members" },
    { label: "Video proctoring (LiveKit)", key: "proctoring" },
    { label: "Advanced reports", key: "advanced_reports" },
    { label: "Storage", key: "storage_mb", suffix: " MB" },
  ];

  return (
    <StaticPage
      eyebrow="Pricing"
      title="Freemium that respects your budget"
      intro="Start free, trial Premium for 14 days, and pay by bank transfer or Mobile Money. A person on our team verifies every payment before your subscription activates — no surprise charges, ever."
      wide
    >
      <div className="grid gap-5 md:grid-cols-3">
        {(plans ?? []).map((p) => (
          <Card key={p.id} className={p.slug === "premium" ? "relative border-2 border-gold-500 p-7" : "p-7"}>
            {p.slug === "premium" && <Badge tone="gold" className="absolute -top-3 left-6">Most popular</Badge>}
            <h2 className="font-display text-xl font-semibold text-evergreen-950">{p.name}</h2>
            <p className="mt-1 text-sm text-ink-soft">{p.description}</p>
            <p className="mt-4">
              <span className="font-display text-4xl font-bold text-evergreen-900">{money(p.price_monthly_cents, p.currency)}</span>
              <span className="text-sm text-ink-soft"> / month</span>
            </p>
            <p className="text-sm text-ink-soft">
              or {money(p.price_yearly_cents, p.currency)} / year
              {p.trial_days > 0 && ` · ${p.trial_days}-day free trial`}
            </p>
            <ul className="mt-5 space-y-2">
              {((p.features as string[]) ?? []).map((f) => (
                <li key={f} className="flex gap-2 text-sm text-ink">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-600" /> {f}
                </li>
              ))}
            </ul>
            <ButtonLink href="/register" variant={p.slug === "premium" ? "gold" : "primary"} className="mt-6 w-full">
              {p.price_monthly_cents === 0 ? "Start free" : "Start free trial"}
            </ButtonLink>
          </Card>
        ))}
      </div>

      <Card className="mt-10 overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-evergreen-900/10 bg-evergreen-50 text-left">
              <th className="px-5 py-3 font-semibold text-evergreen-950">Limit</th>
              {(plans ?? []).map((p) => (
                <th key={p.id} className="px-5 py-3 font-semibold text-evergreen-950">{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-evergreen-900/5 last:border-0">
                <td className="px-5 py-3 text-ink-soft">{r.label}</td>
                {(plans ?? []).map((p) => (
                  <td key={p.id} className="px-5 py-3 font-medium text-ink">
                    {lim((p.limits as Record<string, number | boolean>)[r.key], r.suffix)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-8 border-evergreen-700/30 bg-evergreen-50 p-7">
        <h2 className="font-display text-xl font-semibold text-evergreen-950">How payment works</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink">
          <li>Choose a plan inside your dashboard and read the payment instructions.</li>
          <li>Pay externally (bank transfer or Mobile Money) and keep your transaction reference.</li>
          <li>Submit the reference and, optionally, a screenshot as proof.</li>
          <li>Our team verifies it. Your subscription activates only after approval — you are notified either way.</li>
        </ol>
        <ButtonLink href="/register" variant="gold" className="mt-5">Create your free account</ButtonLink>
      </Card>
    </StaticPage>
  );
}
