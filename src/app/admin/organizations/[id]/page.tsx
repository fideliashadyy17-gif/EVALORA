import { PlatformUrlActions } from "@/components/platform/PlatformUrlActions";
import { Badge, Button, Card } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { organizationPlatformAccess } from "@/lib/tenant";
import { fmtDate } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setOrgStatus } from "../../actions";
import { enterOrgWorkspace } from "../../actions/orgs";
import { StudentsPanel, type StudentsSearchParams } from "../../students/StudentsPanel";
import { StatusBadge } from "../../ui";
import { AcademicsTab } from "./tabs/AcademicsTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { MembersTab } from "./tabs/MembersTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { PlatformTab } from "./tabs/PlatformTab";
import { SubscriptionTab } from "./tabs/SubscriptionTab";

export const metadata: Metadata = { title: "Organization" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview & settings" },
  { key: "platform", label: "Platform URL" },
  { key: "members", label: "Members & admins" },
  { key: "academics", label: "Academics & classes" },
  { key: "students", label: "Students" },
  { key: "subscription", label: "Subscription" },
  { key: "activity", label: "Activity & audit" },
] as const;

export default async function OrganizationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<StudentsSearchParams & { tab?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "overview";
  const admin = createAdminClient();

  const head = { count: "exact" as const, head: true };
  const [{ data: org }, ownerRes, memberCount, studentCount, classCount, quizCount, examCount, compCount, liveCount, subRes] = await Promise.all([
    admin.from("organizations").select("*").eq("id", id).maybeSingle(),
    admin.from("organization_members").select("user_id").eq("organization_id", id).eq("role", "owner").maybeSingle(),
    admin.from("organization_members").select("id", head).eq("organization_id", id).eq("status", "active").then((r) => r.count ?? 0),
    admin.from("students").select("id", head).eq("organization_id", id).eq("status", "active").then((r) => r.count ?? 0),
    admin.from("classes").select("id", head).eq("organization_id", id).then((r) => r.count ?? 0),
    admin.from("quizzes").select("id", head).eq("organization_id", id).then((r) => r.count ?? 0),
    admin.from("exams").select("id", head).eq("organization_id", id).then((r) => r.count ?? 0),
    admin.from("competitions").select("id", head).eq("organization_id", id).then((r) => r.count ?? 0),
    admin.from("quiz_sessions").select("id", head).eq("organization_id", id).in("status", ["lobby", "live", "paused"]).then((r) => r.count ?? 0),
    admin.from("subscriptions").select("status, source, plans(name), trial_ends_at, current_period_end").eq("organization_id", id).in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!org) notFound();

  const ownerProfile = ownerRes.data?.user_id
    ? (await admin.from("profiles").select("id, full_name, email").eq("id", ownerRes.data.user_id).maybeSingle()).data
    : null;
  const sub = subRes.data;
  const base = `/admin/organizations/${id}`;
  const platform = organizationPlatformAccess(org);

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href="/admin/organizations" className="font-medium text-evergreen-700 underline-offset-2 hover:underline">← All organizations</Link>
      </p>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {org.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo_url} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-evergreen-900/15" />
            )}
            <div>
              <h1 className="font-display text-2xl font-semibold text-evergreen-950">{org.name}</h1>
              <p className="mt-0.5 text-sm capitalize text-ink-soft">
                {org.type.replace(/_/g, " ")}
                {[org.city, org.country].filter(Boolean).length > 0 && ` · ${[org.city, org.country].filter(Boolean).join(", ")}`}
                {` · since ${fmtDate(org.created_at)}`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Platform</span>
                {platform.url ? (
                  <a
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-full break-all font-mono text-xs text-evergreen-800 underline underline-offset-2"
                  >
                    {platform.url}
                  </a>
                ) : (
                  <span className="text-xs text-ink-soft">no working URL</span>
                )}
                <PlatformUrlActions url={platform.url} size="sm" openLabel="Open" copyLabel="Copy" shareLabel="Share" />
              </div>

              <p className="mt-1 text-sm text-ink-soft">
                Owner:{" "}
                {ownerProfile ? (
                  <Link href={`/admin/users/${ownerProfile.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">
                    {ownerProfile.full_name || ownerProfile.email}
                  </Link>
                ) : "—"}
                {sub ? (
                  <> · <Badge tone="gold">{(sub.plans as unknown as { name: string } | null)?.name}</Badge>{" "}
                    <span className="capitalize">{sub.status}{sub.source !== "paid" ? ` (${String(sub.source).replace(/_/g, " ")})` : ""}</span>
                  </>
                ) : (
                  <> · <Badge tone="gray">Free plan</Badge></>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={org.status} />
            <div className="flex flex-wrap gap-2">
              <form action={enterOrgWorkspace}>
                <input type="hidden" name="organization_id" value={id} />
                <Button type="submit" variant="gold">Open workspace →</Button>
              </form>
              <form action={setOrgStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="status" value={org.status === "active" ? "suspended" : "active"} />
                <Button type="submit" variant="outline">{org.status === "active" ? "Suspend" : "Reactivate"}</Button>
              </form>
            </div>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-evergreen-900/10 pt-4 text-center sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Members", memberCount], ["Students", studentCount], ["Classes", classCount],
            ["Quizzes", quizCount], ["Examinations", examCount], ["Competitions", compCount], ["Live now", liveCount],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{label}</dt>
              <dd className="font-display text-xl font-semibold text-evergreen-950">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-evergreen-900/15" aria-label="Organization sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-medium ${
              tab === t.key
                ? "bg-evergreen-700 text-white shadow-sm"
                : "text-evergreen-800 hover:bg-evergreen-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="pt-6">
        {tab === "overview" && <OverviewTab org={org} sp={sp} />}
        {tab === "platform" && <PlatformTab org={org} sp={sp} />}
        {tab === "members" && <MembersTab orgId={id} sp={sp} />}
        {tab === "academics" && <AcademicsTab orgId={id} sp={sp} />}
        {tab === "students" && (
          <StudentsPanel
            organizationId={id}
            back={`${base}?tab=students`}
            sp={sp}
            preserveParams={{ tab: "students" }}
          />
        )}
        {tab === "subscription" && <SubscriptionTab orgId={id} sp={sp} back={`${base}?tab=subscription`} />}
        {tab === "activity" && <ActivityTab orgId={id} />}
      </div>
    </>
  );
}
