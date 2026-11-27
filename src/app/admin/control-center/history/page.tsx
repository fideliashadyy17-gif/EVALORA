import { PageTitle, ButtonLink } from "@/components/ui";
import { HistoryClient, type HistoryRow } from "./history-client";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { CONFIG_NAMESPACES, getConfigDef } from "@/lib/config/schema";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Configuration history" };
export const dynamic = "force-dynamic";

interface RevisionRow {
  id: string;
  scope_level: "global" | "organization";
  scope_id: string;
  namespace: string;
  key: string;
  revision: number;
  previous_value: unknown;
  new_value: unknown;
  change_note: string | null;
  changed_by: string | null;
  changed_at: string;
  rolled_back_from: string | null;
}

/**
 * Configuration change history.
 *
 * Rows are read server-side by a verified Super Admin and handed to the client
 * component for filtering and rollback confirmation. The browser never queries
 * the history table itself, so the Super Admin gate cannot be bypassed by
 * calling the endpoint directly.
 */
export default async function ConfigHistoryPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const [{ data: rawRevisions }, { data: rawOrgs }] = await Promise.all([
    admin
      .from("platform_config_revisions")
      .select(
        "id, scope_level, scope_id, namespace, key, revision, previous_value, new_value, change_note, changed_by, changed_at, rolled_back_from",
      )
      .order("changed_at", { ascending: false })
      .limit(500),
    admin.from("organizations").select("id, name").is("deleted_at", null).order("name").limit(500),
  ]);

  const orgs = (rawOrgs ?? []) as { id: string; name: string }[];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const revisions = (rawRevisions ?? []) as unknown as RevisionRow[];

  // Actor emails: one bounded lookup for the distinct set of actors, rather
  // than a query per row.
  const actorIds = [...new Set(revisions.map((r) => r.changed_by).filter((v): v is string => Boolean(v)))];
  const actorEmail = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", actorIds.slice(0, 200));
    for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
      if (p.email) actorEmail.set(p.id, p.email);
    }
  }

  const rows: HistoryRow[] = revisions.map((r) => ({
    ...r,
    organization_name: r.scope_level === "organization" ? (orgName.get(r.scope_id) ?? null) : null,
    actor_email: r.changed_by ? (actorEmail.get(r.changed_by) ?? null) : null,
    setting_label: getConfigDef(r.namespace, r.key)?.label ?? null,
  }));

  const namespaces = CONFIG_NAMESPACES.map((ns) => ({ key: ns.key, label: ns.label }));

  return (
    <>
      <PageTitle
        eyebrow="Platform Control Center"
        title="Configuration history & rollback"
        subtitle="Append-only version history for every setting changed through the Control Center, at platform and organization scope. Each revision records the value before and after, who changed it, when, and why."
        action={
          <>
            <ButtonLink href="/admin/control-center" variant="outline">
              Platform configuration
            </ButtonLink>
            <ButtonLink href="/admin/control-center/organizations" variant="outline">
              Organizations
            </ButtonLink>
            <ButtonLink href="/admin/audit" variant="gold">
              Full audit log
            </ButtonLink>
          </>
        }
      />
      <HistoryClient rows={rows} organizations={orgs} namespaces={namespaces} />
    </>
  );
}
