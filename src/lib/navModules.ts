/**
 * Sidebar ↔ module entitlement — derived from the canonical catalog.
 *
 * The organization navigation and the Plan & Module Management console MUST
 * share one registry: href→module here is computed from MODULE_CATALOG's
 * `surface.kind === "nav"` entries, so a module can never be configurable in
 * the console while missing from the sidebar (or vice versa). DashboardChrome
 * imports moduleForHref() instead of keeping its own hardcoded map.
 */
import { MODULE_CATALOG, moduleEnabled } from "./modules";
import { filterNavItems, type NavAudience } from "./navAccess";

export interface NavModuleRef {
  href: string;
  audience?: NavAudience;
}

/** href → module key for every catalog module that surfaces in the sidebar. */
export function moduleForHref(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of MODULE_CATALOG) {
    const s = m.surface;
    if (s && s.kind === "nav") {
      for (const href of s.hrefs) map[href] = m.key;
    }
  }
  return map;
}

/**
 * The exact rule the sidebar applies: the verified role's audience filter
 * AND the organization's effective module entitlement. Pages and server
 * actions re-check the same entitlement independently — this decides what
 * is *offered*, never what is authorized.
 */
export function isNavVisible(
  item: NavModuleRef,
  modules: Record<string, boolean> | undefined,
  role: string | null | undefined,
): boolean {
  if (!filterNavItems([item as { audience?: NavAudience }], role).length) return false;
  const key = moduleForHref()[item.href];
  if (!key) return true;
  if (!moduleEnabled(modules, key)) return false;
  // A child surface (e.g. Rankings & Results under Live Competitions) also
  // hides when its parent module is disabled — the route guards require both,
  // so the sidebar must never offer a destination that would redirect.
  const entry = MODULE_CATALOG.find((m) => m.key === key);
  if (entry && entry.surface.kind === "nav" && entry.surface.requires) {
    if (!moduleEnabled(modules, entry.surface.requires)) return false;
  }
  return true;
}
