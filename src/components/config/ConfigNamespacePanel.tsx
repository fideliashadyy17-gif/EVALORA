import { Badge, Card, EmptyState } from "@/components/ui";
import { ConfigField } from "@/components/config/ConfigField";
import { configsInNamespace, groupsInNamespace } from "@/lib/config/schema";
import type { ConfigNamespace } from "@/lib/config/types";
import type { ResolvedConfigEntry } from "@/lib/config/types";
import {
  resetOrganizationConfig,
  saveOrganizationConfig,
  savePlatformConfig,
} from "@/lib/config/actions";
import { cn } from "@/lib/utils";

/**
 * Renders every setting of one configuration namespace as a working form.
 *
 * This is a SERVER component on purpose: the schema, the resolved values and
 * the provenance all come from the server, and the only thing shipped to the
 * browser is the markup plus references to server actions. A visitor cannot
 * reach a setting the schema does not declare, and cannot reach a scope their
 * role does not hold — the choice of `savePlatformConfig` versus
 * `saveOrganizationConfig` is made here, not in the payload.
 */
export function ConfigNamespacePanel({
  namespace,
  scope,
  organizationId = null,
  organizationName = null,
  provenance,
  inherited,
  query = "",
  className,
  actor = "tenant",
}: {
  namespace: ConfigNamespace;
  scope: "global" | "organization";
  organizationId?: string | null;
  organizationName?: string | null;
  /**
   * Who is editing. `tenant` routes to the organization action, which derives
   * the scope from the caller's own membership and can never reach global
   * configuration. `super_admin` routes to the platform action, which requires a
   * verified super_admin session and is the only path that can write a global
   * value or an override on a tenant's behalf.
   */
  actor?: "tenant" | "super_admin";
  /** Resolved entries keyed by `namespace.key` for the scope being rendered. */
  provenance: Record<string, ResolvedConfigEntry>;
  /** Global-layer values, so an override can show what it would inherit. */
  inherited?: Record<string, ResolvedConfigEntry>;
  query?: string;
  className?: string;
}) {
  const defs = configsInNamespace(namespace).filter((def) => {
    const haystack = `${def.label} ${def.description} ${def.key} ${def.group} ${(def.connectedModules ?? []).join(" ")}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });

  if (!defs.length) {
    return (
      <EmptyState
        title={query ? "No settings match that search" : "No settings in this namespace"}
        body={
          query
            ? `Nothing in ${namespace.replace(/_/g, " ")} matched “${query}”. Clear the search to see every setting.`
            : "This namespace is declared in the schema but has no keys yet."
        }
      />
    );
  }

  const groups = groupsInNamespace(namespace);
  const writable = defs.filter((d) => d.writableScopes.includes(scope)).length;

  return (
    <div className={cn("space-y-8", className)} data-testid={`config-namespace-${namespace}`}>
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-cream p-4">
        <p className="text-sm text-ink-soft">
          <span className="font-semibold text-evergreen-950">{defs.length}</span> setting{defs.length === 1 ? "" : "s"} in{" "}
          <span className="font-semibold">{namespace.replace(/_/g, " ")}</span> ·{" "}
          <span className="font-semibold">{writable}</span> editable at {scope === "global" ? "platform" : "organization"} scope ·{" "}
          <span className="font-semibold">{defs.length - writable}</span> reported read-only
        </p>
        <Badge tone={scope === "global" ? "green" : "gold"}>
          {scope === "global" ? "Platform scope" : `${organizationName ?? "Organization"} scope`}
        </Badge>
      </Card>

      {groups.map((group) => {
        const groupDefs = defs.filter((d) => d.group === group);
        if (!groupDefs.length) return null;
        return (
          <section key={group} data-testid={`config-group-${namespace}-${group}`}>
            <h2 className="font-display text-lg font-semibold text-evergreen-950">
              {group.charAt(0).toUpperCase() + group.slice(1).replace(/_/g, " ")}
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {groupDefs.length} setting{groupDefs.length === 1 ? "" : "s"} · saved individually, each change is versioned
            </p>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {groupDefs.map((def) => (
                <ConfigField
                  key={`${def.namespace}.${def.key}`}
                  def={def}
                  entry={provenance[`${def.namespace}.${def.key}`]}
                  inheritedValue={inherited?.[`${def.namespace}.${def.key}`]?.value}
                  action={scope === "global" || actor === "super_admin" ? savePlatformConfig : saveOrganizationConfig}
                  resetAction={scope === "organization" ? resetOrganizationConfig : undefined}
                  scope={scope}
                  scopeId={organizationId}
                  organizationName={organizationName}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The namespace tabs, rendered as real links so each panel is independently addressable. */
export function ConfigNamespaceTabs({
  namespaces,
  active,
  basePath,
}: {
  namespaces: readonly ConfigNamespace[];
  active: ConfigNamespace;
  basePath: string;
}) {
  // Sections are query parameters on the owning route; the organization is part
  // of basePath on the per-organization surfaces, so no extra parameter is
  // needed (and none of the pages read `?org=`).
  const href = (ns: ConfigNamespace) => `${basePath}?section=${ns}`;
  return (
    <nav aria-label="Configuration areas" className="-mx-1 flex flex-wrap gap-1.5 overflow-x-auto px-1 pb-1">
      {namespaces.map((ns) => (
        <a
          key={ns}
          href={href(ns)}
          aria-current={ns === active ? "page" : undefined}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
            ns === active
              ? "bg-evergreen-800 text-white shadow-sm"
              : "border border-evergreen-900/15 bg-white text-evergreen-900 hover:bg-evergreen-50",
          )}
        >
          {ns.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </a>
      ))}
    </nav>
  );
}
