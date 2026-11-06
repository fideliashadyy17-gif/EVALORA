import { Badge, Button, Card, Field, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { getCapabilities } from "@/lib/capabilities";
import {
  CAPABILITY_KEYS,
  CAPABILITY_LABELS,
  resolveCapabilities,
  type CapabilityKey,
} from "@/lib/capability-rules";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { enterOrgWorkspace } from "../actions/orgs";

export const metadata: Metadata = { title: "Operational Workspace Access" };
export const dynamic = "force-dynamic";

interface ModuleDefinition {
  title: string;
  next: string;
  capability: CapabilityKey;
  description: string;
  consoleHref?: string;
}

const MODULES: ModuleDefinition[] = [
  {
    title: "Class Management",
    next: "/dashboard/academics/classes",
    capability: "class_management",
    description: "Full class, roster, transfer and withdrawal lifecycle in the audited tenant workspace.",
    consoleHref: "/admin/classes",
  },
  {
    title: "Student Management",
    next: "/dashboard/students",
    capability: "student_management",
    description: "Institutional student records, enrollment and bulk import / export operations.",
    consoleHref: "/admin/students",
  },
  {
    title: "Question Bank",
    next: "/dashboard/questions",
    capability: "question_bank",
    description: "Create, publish, categorize and reuse questions with full RLS-scoped access.",
    consoleHref: "/admin/questions",
  },
  {
    title: "Quiz Management",
    next: "/dashboard/quizzes",
    capability: "quiz_management",
    description: "Quiz creation, publishing, assignment and live-session workflows.",
    consoleHref: "/admin/quizzes",
  },
  {
    title: "Examination Management",
    next: "/dashboard/exams",
    capability: "examinations",
    description: "Create examinations, candidates, schedules, marking, results and access links.",
    consoleHref: "/admin/examinations",
  },
  {
    title: "Live Competitions",
    next: "/dashboard/sessions",
    capability: "live_competitions",
    description: "Live sessions, event phases, pools, qualification and admission operations.",
    consoleHref: "/admin/competitions/live",
  },
  {
    title: "Reports & Analytics",
    next: "/dashboard/reports",
    capability: "reports_analytics",
    description: "Exam, quiz and competition analytics and exports.",
    consoleHref: "/admin/statistics",
  },
  {
    title: "Proctoring",
    next: "/dashboard/exams",
    capability: "proctoring",
    description: "Proctoring rooms, incidents and oversight for enabled examinations.",
    consoleHref: "/admin/proctoring",
  },
  {
    title: "Team, Billing & Settings",
    next: "/dashboard/team",
    capability: "institutional_administration",
    description: "Members, roles, billing, subscription and organization settings.",
    consoleHref: "/admin/subscriptions",
  },
];

const INSTITUTIONAL_KEYS: CapabilityKey[] = [
  "institutional_administration",
  "multi_class_operations",
  "central_asset_management",
  "configurable_limits",
  "imports_exports",
  "reports_analytics",
  "proctoring",
  "future_modules",
];

export default async function OperationsWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; entered?: string }>;
}) {
  const ctx = await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();
  const { data: orgRows } = await admin
    .from("organizations")
    .select("id,name,slug,status")
    .order("name")
    .limit(500);
  const orgs = (orgRows ?? []) as { id: string; name: string; slug: string; status: string }[];
  const selected = orgs.find((o) => o.id === sp.org) ?? orgs[0] ?? null;

  const result = selected ? await getCapabilities(admin, ctx, selected.id) : null;
  const customerCapabilities = result
    ? resolveCapabilities({
        isSuperAdmin: false,
        planSlug: result.entitlement.planSlug,
        limits: result.entitlement.limits,
        featureFlags: result.featureFlags,
      })
    : null;

  return (
    <>
      <PageTitle
        title="Full operational workspace access"
        subtitle="Enter any customer organization in audited Super Admin workspace mode. Backend permissions, RLS, plan logic and audit logging remain enforced server-side; this is not a visual-only bypass."
      />

      {sp.entered && (
        <p className="mb-4 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">
          Workspace access started. Entry is recorded in the audit log; use the console link below to exit.
        </p>
      )}

      <Card className="p-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Field label="Organization" className="min-w-[300px] flex-1">
            <Select name="org" defaultValue={selected?.id ?? ""}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="outline">Inspect organization</Button>
        </form>
      </Card>

      {!selected || !result || !customerCapabilities ? (
        <p className="mt-6 rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">
          No organizations are available yet.
        </p>
      ) : (
        <>
          <Card className="mt-6 border-evergreen-700/30 bg-evergreen-50 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="gold">Super Admin unrestricted</Badge>
              <span className="font-medium text-evergreen-950">{selected.name}</span>
              <span className="text-sm text-ink-soft">
                Customer entitlement: <strong>{result.entitlement.planName}</strong> ({result.entitlement.planSlug})
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              Owner access does not require a purchase, quota or plan activation and is not granted to ordinary customers. All modules below open through the same server-validated workspace mode; customer plan restrictions remain visible for comparison.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {INSTITUTIONAL_KEYS.map((key) => (
                <div key={key} className="rounded-xl border border-evergreen-900/10 bg-paper p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{CAPABILITY_LABELS[key]}</p>
                  <p className="mt-0.5 text-sm font-semibold text-evergreen-900">
                    Customer: {customerCapabilities[key] ? "Included" : "Restricted"}
                  </p>
                  <p className="text-xs text-ink-soft">Super Admin: {result.capabilities[key] ? "Unrestricted" : "Restricted"}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODULES.map((module) => (
              <Card key={module.title} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold text-evergreen-950">{module.title}</h2>
                  <Badge tone={result.capabilities[module.capability] ? "green" : "gray"}>
                    {result.capabilities[module.capability] ? "Owner: full" : "Owner: blocked"}
                  </Badge>
                </div>
                <p className="mt-1 flex-1 text-sm text-ink-soft">{module.description}</p>
                <p className="mt-2 text-xs text-ink-soft">
                  Customer plan: <strong>{customerCapabilities[module.capability] ? "allowed" : "restricted"}</strong>
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-evergreen-900/10 pt-4">
                  <form action={enterOrgWorkspace}>
                    <input type="hidden" name="organization_id" value={selected.id} />
                    <input type="hidden" name="next" value={module.next} />
                    <Button type="submit" variant="gold">Open in workspace</Button>
                  </form>
                  {module.consoleHref && (
                    <Link href={module.consoleHref} className="text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">
                      Console module
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <Card className="mt-6 p-6">
            <h2 className="font-display text-lg font-semibold text-evergreen-950">Centralized authorization coverage</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Every capability below is resolved once from the verified session, the single plans/subscriptions entitlement source and platform feature flags. Future modules inherit the same owner rule without a second entitlement system.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {CAPABILITY_KEYS.map((key) => (
                <Badge key={key} tone={result.capabilities[key] ? "green" : "gray"}>{CAPABILITY_LABELS[key]}</Badge>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
