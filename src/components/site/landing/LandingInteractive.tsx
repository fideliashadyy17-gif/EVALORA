"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * Small, dependency-free interaction islands for the landing page.
 * Everything degrades gracefully: without JavaScript the first tab is shown
 * and all content remains in the document (the tab panels are real DOM).
 */

/* ── Reveal on scroll ─────────────────────────────────────────────────── */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("is-in");
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Component = Tag as "div";
  return (
    <Component ref={ref} className={cn("lp-reveal", className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Component>
  );
}

/* ── Role workspace switcher ──────────────────────────────────────────── */
export interface RoleTabData {
  id: string;
  label: string;
  short: string;
  summary: string;
  highlights: string[];
  evidence: string;
}

export function RoleSwitcher({ roles }: { roles: RoleTabData[] }) {
  const [active, setActive] = useState(roles[0]?.id ?? "");
  const current = roles.find((r) => r.id === active) ?? roles[0];
  if (!current) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[19rem_1fr] lg:gap-8">
      <div role="tablist" aria-label="Role workspaces" aria-orientation="vertical" className="flex flex-col gap-1.5">
        {roles.map((r, i) => {
          const selected = r.id === current.id;
          return (
            <button
              key={r.id}
              role="tab"
              type="button"
              id={`role-tab-${r.id}`}
              aria-selected={selected}
              aria-controls={`role-panel-${r.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(r.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                e.preventDefault();
                const next = e.key === "ArrowDown" ? (i + 1) % roles.length : (i - 1 + roles.length) % roles.length;
                setActive(roles[next].id);
                document.getElementById(`role-tab-${roles[next].id}`)?.focus();
              }}
              className="lp-role-tab"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-[0.7rem] font-bold",
                  selected ? "bg-evergreen-700 text-white" : "bg-evergreen-900/8 text-evergreen-800",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", selected ? "text-evergreen-950" : "text-ink")}>{r.label}</span>
                <span className="block text-[0.7rem] text-ink-soft">{r.short}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`role-panel-${current.id}`}
        aria-labelledby={`role-tab-${current.id}`}
        className="rounded-2xl border border-evergreen-900/12 bg-white p-5 shadow-[0_1px_0_#fff_inset,0_30px_60px_-52px_rgb(6_53_31/0.7)] sm:p-7"
      >
        <p className="lp-eyebrow">{current.short}</p>
        <h3 className="mt-2 font-display text-xl font-semibold text-evergreen-950 sm:text-2xl">{current.label}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{current.summary}</p>
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {current.highlights.map((h) => (
            <li key={h} className="flex gap-2 text-sm leading-snug text-ink">
              <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-evergreen-600" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 10.5l4 4 8-8.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{h}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-evergreen-900/10 bg-cream px-2.5 py-1 text-[0.7rem] font-semibold text-evergreen-900">
          <span className="h-1.5 w-1.5 rounded-full bg-evergreen-600" aria-hidden />
          {current.evidence}
        </p>
      </div>
    </div>
  );
}

/* ── Engine showcase tabs ─────────────────────────────────────────────── */
export interface ShowcaseItem {
  id: string;
  tab: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  note?: string;
  panelId: "studio" | "monitor" | "proctor" | "results" | "livescreen" | "competition";
}

export function EngineShowcase({
  items,
  previews,
}: {
  items: ShowcaseItem[];
  /** Panel id → rendered product preview. Only the active one is mounted. */
  previews: Record<string, React.ReactNode>;
}) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const current = items.find((i) => i.id === active) ?? items[0];
  if (!current) return null;
  return (
    <div>
      <div role="tablist" aria-label="Platform engines" className="flex flex-wrap gap-1.5 rounded-xl border border-evergreen-900/10 bg-white/70 p-1.5">
        {items.map((item) => {
          const selected = item.id === current.id;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`showcase-panel-${item.id}`}
              id={`showcase-tab-${item.id}`}
              onClick={() => setActive(item.id)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-[0.78rem] font-semibold transition",
                selected
                  ? "bg-evergreen-800 text-white shadow-[0_10px_22px_-16px_rgb(4_35_21/0.9)]"
                  : "text-evergreen-900 hover:bg-evergreen-50",
              )}
            >
              {item.tab}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`showcase-panel-${current.id}`} aria-labelledby={`showcase-tab-${current.id}`} className="mt-4">
        {current.kicker && <p className="lp-eyebrow">{current.kicker}</p>}
        <h3 className="mt-1.5 font-display text-xl font-semibold text-evergreen-950 sm:text-2xl">{current.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{current.body}</p>
        <ul className="mt-4 space-y-1.5">
          {current.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-[0.83rem] leading-snug text-ink">
              <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-gold-500" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {current.note && (
          <p className="mt-4 rounded-lg border border-evergreen-900/10 bg-cream/70 px-3 py-2 text-[0.72rem] leading-relaxed text-ink-soft">
            {current.note}
          </p>
        )}
      </div>
      <div className="mt-5">{previews[current.panelId] ?? null}</div>
    </div>
  );
}

/* ── Pricing: monthly / yearly ────────────────────────────────────────── */
export function BillingToggle({ yearlyLabel, monthlyLabel }: { yearlyLabel: string; monthlyLabel: string }) {
  const [yearly, setYearly] = useState(true);
  // Expose state to cards via a data attribute on the closest pricing section.
  useEffect(() => {
    const root = document.getElementById("lp-pricing");
    if (root) root.dataset.billing = yearly ? "yearly" : "monthly";
  }, [yearly]);
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-evergreen-900/12 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => setYearly(false)}
        aria-pressed={!yearly}
        className={cn(
          "rounded-full px-3.5 py-1.5 text-[0.78rem] font-semibold transition",
          !yearly ? "bg-evergreen-800 text-white" : "text-evergreen-900 hover:bg-evergreen-50",
        )}
      >
        {monthlyLabel}
      </button>
      <button
        type="button"
        onClick={() => setYearly(true)}
        aria-pressed={yearly}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.78rem] font-semibold transition",
          yearly ? "bg-evergreen-800 text-white" : "text-evergreen-900 hover:bg-evergreen-50",
        )}
      >
        {yearlyLabel}
        <span className={cn("rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold", yearly ? "bg-gold-400 text-evergreen-950" : "bg-gold-100 text-gold-800")}>
          2 months free
        </span>
      </button>
    </div>
  );
}

/** Price that switches with the billing toggle without shipping price text twice. */
export function PriceValue({ monthly, yearly, suffix }: { monthly: string; yearly: string; suffix: string }) {
  const [yearlyMode, setYearlyMode] = useState(true);
  useEffect(() => {
    const root = document.getElementById("lp-pricing");
    const read = () => setYearlyMode((root?.dataset.billing ?? "yearly") !== "monthly");
    read();
    if (!root) return;
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["data-billing"] });
    return () => mo.disconnect();
  }, []);
  return (
    <p className="mt-4 flex flex-wrap items-baseline gap-1.5">
      <span className="lp-metric text-[2.4rem] font-bold leading-none text-evergreen-950">{yearlyMode ? yearly : monthly}</span>
      <span className="text-sm text-ink-soft">{suffix}</span>
    </p>
  );
}

/* ── Mobile navigation ────────────────────────────────────────────────── */
export function MobileNav({ links, authed }: { links: { href: string; label: string }[]; authed: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="lp-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white transition hover:bg-white/10"
      >
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <div
        id="lp-mobile-menu"
        hidden={!open}
        className="fixed inset-x-0 top-[4.25rem] z-50 mx-3 overflow-hidden rounded-2xl border border-evergreen-900/12 bg-[#fffdf8] p-2 shadow-[0_30px_70px_-30px_rgb(4_35_21/0.6)]"
      >
        <nav aria-label="Mobile">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-evergreen-950 hover:bg-evergreen-50"
                >
                  {l.label}
                  <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 text-evergreen-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-1 grid grid-cols-2 gap-2 border-t border-evergreen-900/10 p-2">
          {authed ? (
            <a href="/auth/resolve" className="lp-btn lp-btn--forest col-span-2">
              Open console
            </a>
          ) : (
            <>
              <a href="/login" className="lp-btn lp-btn--ghost">
                Sign in
              </a>
              <a href="/register" className="lp-btn lp-btn--forest">
                Get started
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sticky "join" pill for long scrolls ──────────────────────────────── */
export function HeaderShadowSentinel() {
  return <span aria-hidden data-lp-header-sentinel className="absolute inset-x-0 top-0 h-px" />;
}
