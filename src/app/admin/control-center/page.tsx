import { Badge, ButtonLink, Card, PageTitle, StatCard } from "@/components/ui";
import { ConfigNamespacePanel, ConfigNamespaceTabs } from "@/components/config/ConfigNamespacePanel";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getConfigCoverage, getFullResolution } from "@/lib/config/service";
import { CONFIG_NAMESPACES, readOnlyConfigs } from "@/lib/config/schema";
import { getEffectiveBrand } from "@/lib/brandConfig";
import type { ConfigNamespace } from "@/lib/config/types";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Platform Control Center" };
export const dynamic = "force-dynamic";

/** Namespaces a Super Admin configures for the whole platform. */
const PLATFORM_NAMESPACES = CONFIG_NAMESPACES
  .filter((ns) => ns.key !== "org_identity" && ns.audience !== "organization")
  .sort((a, b) => a.order - b.order)
  .map((ns) => ns.key);

const SECTION_INTRO: Record<string, { title: string; subtitle: string }> = {
  branding: {
    title: "Platform identity & branding",
    subtitle:
      "Name, tagline, logo, favicon, brand colours, typography and default theme. Saved here, every surface that renders the brand — the root layout metadata, the logo component, the marketing site, the legal pages, the support address — changes with it. No redeploy required.",
  },
  localization: {
    title: "Language & localization",
    subtitle:
      "Which interface languages exist, which one a visitor lands on before they choose, and whether the language switcher is offered at all. Examination content keeps its authored language regardless of these settings.",
  },
  formatting: {
    title: "Date, time & number formats",
    subtitle:
      "The default presentation of dates, times, numbers, currency and percentages across reports, results and dashboards, plus the platform default timezone.",
  },
  platform_behavior: {
    title: "Platform behaviour",
    subtitle:
      "Maintenance mode, global announcements, default landing pages and registration behaviour. These are operational settings: they change what real visitors see immediately, so each one asks for confirmation before it saves.",
  },
  assessment: {
    title: "Assessment defaults",
    subtitle:
      "Default pass mark, negative marking, numeric tolerance, rounding rule and result-link lifetime applied when an examination does not specify its own. An examination's stored value always wins — these fill the gaps, and they never rewrite an existing result or auto-publish anything.",
  },
  examination: {
    title: "Examination defaults",
    subtitle:
      "Starting values pre-filled into the New Examination form for every organization that has not overridden them.",
  },
  question_studio: {
    title: "Question Studio",
    subtitle:
      "Which question types authors may create, the default card layout, numbering, option alignment and image placement, and the Question Bank's controlled vocabularies (categories, difficulty, tags). Changing a design default affects newly authored questions only — published questions and examinations keep the design snapshot stored with them.",
  },
  proctoring: {
    title: "Proctoring",
    subtitle:
      "Availability, required device checks, incident categories, alert thresholds, recording and retention. Settings whose integration is not complete are reported as read-only with an honest explanation rather than offered as controls that appear to work.",
  },
  notifications: {
    title: "Notifications & communication",
    subtitle:
      "In-app notification behaviour and delivery capability. EVALORA has no SMTP provider configured: transactional email is limited to Supabase Auth mail, and that is reported truthfully instead of exposing a send button that would silently do nothing.",
  },
};

export default async function ControlCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; q?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const section = PLATFORM_NAMESPACES.includes((sp.section ?? "") as ConfigNamespace)
    ? (sp.section as ConfigNamespace)
    : "branding";
  const query = String(sp.q ?? "");
  const admin = createAdminClient();

  const [{ provenance }, coverage, brand, { data: orgs }] = await Promise.all([
    getFullResolution(null),
    getConfigCoverage(null),
    getEffectiveBrand(),
    admin.from("organizations").select("id, name, slug").is("deleted_at", null).order("name").limit(500),
  ]);

  const meta = CONFIG_NAMESPACES.find((ns) => ns.key === section);
  const intro = SECTION_INTRO[section] ?? { title: meta?.label ?? section, subtitle: meta?.description ?? "" };
  const orgList = (orgs ?? []) as { id: string; name: string; slug: string }[];

  return (
    <>
      <PageTitle
        eyebrow="Platform Administration · Section H"
        title="Platform Control Center"
        subtitle={`${brand.name} configuration that is actually wired to application behaviour. Every setting here is validated against a declared schema, versioned with an audit trail, and read at runtime by the modules listed on the setting itself.`}
        action={
          <>
            <ButtonLink href="/admin/control-center/organizations" variant="outline">
              Organization configuration
            </ButtonLink>
            <ButtonLink href="/admin/control-center/history" variant="outline">
              History & rollback
            </ButtonLink>
            <ButtonLink href="/admin/control-center/presets" variant="gold">
              Presets
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Settings in schema" value={coverage.total} hint="Validated, versioned keys" />
        <StatCard label="Configured globally" value={coverage.fromGlobal} hint={`Rest use the built-in default (${coverage.fromDefault})`} />
        <StatCard
          label="Read-only by design"
          value={readOnlyConfigs().length}
          hint="Reported honestly, never offered as a control"
        />
        <StatCard label="Organizations" value={orgList.length} hint="Each can override the global layer" />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-base font-semibold text-evergreen-950">Configuration inheritance</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          A value is resolved in this order: <strong>organization override</strong> → <strong>platform value</strong> →{" "}
          <strong>built-in default</strong>. The badge on each setting shows which layer supplied the value you are
          looking at. Removing an organization override deletes only that row — the platform value and every other
          organization are untouched.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="gray">Built-in default — shipped behaviour</Badge>
          <Badge tone="green">Platform — set here</Badge>
          <Badge tone="gold">Organization override — set per tenant</Badge>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Organizations can never change platform configuration, another organization&rsquo;s configuration, Super Admin
          permissions or platform-wide security settings: the tenant-facing action cannot reach global scope, and the
          schema declares which keys an organization may write.
        </p>
      </Card>

      <div className="mt-8">
        <ConfigNamespaceTabs namespaces={PLATFORM_NAMESPACES} active={section} basePath="/admin/control-center" />
      </div>

      <div className="mt-6">
        <h1 className="font-display text-xl font-semibold text-evergreen-950">{intro.title}</h1>
        <p className="mt-1 max-w-4xl text-sm leading-relaxed text-ink-soft">{intro.subtitle}</p>
      </div>

      <form className="mt-4 flex flex-wrap items-center gap-2" action="/admin/control-center" method="get">
        <input type="hidden" name="section" value={section} />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder={`Search ${section.replace(/_/g, " ")} settings…`}
          aria-label="Search settings"
          className="w-full max-w-sm rounded-lg border border-evergreen-900/55 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-evergreen-700 focus:outline-none focus:ring-2 focus:ring-evergreen-600/25"
        />
        <button
          type="submit"
          className="rounded-lg border border-evergreen-700/50 bg-white px-4 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50"
        >
          Search
        </button>
        {query && (
          <Link
            href={`/admin/control-center?section=${section}`}
            className="rounded-lg px-3 py-2.5 text-sm font-medium text-evergreen-800 hover:bg-evergreen-50"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mt-6">
        <ConfigNamespacePanel
          namespace={section}
          scope="global"
          provenance={provenance}
          query={query}
        />
      </div>
    </>
  );
}
