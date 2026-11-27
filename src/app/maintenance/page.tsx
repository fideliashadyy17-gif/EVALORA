import { Logo } from "@/components/Logo";
import { getPlatformBehaviorConfig } from "@/lib/config/service";
import { DEFAULT_MAINTENANCE_MESSAGE } from "@/lib/maintenance";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scheduled maintenance",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The notice Edge Middleware rewrites to while maintenance mode is on.
 *
 * Middleware keeps serving the authentication routes, the candidate and
 * live-session routes, and any verified Super Admin, so this page is only ever
 * shown to a visitor whose route is genuinely closed. The message comes from
 * platform_behavior.maintenance_message; if configuration cannot be read the
 * built-in notice is used, so the page can never fail to render.
 */
export default async function MaintenancePage() {
  let message = DEFAULT_MAINTENANCE_MESSAGE;
  try {
    const behavior = await getPlatformBehaviorConfig();
    if (typeof behavior.maintenance_message === "string" && behavior.maintenance_message.trim()) {
      message = behavior.maintenance_message.trim();
    }
  } catch {
    // keep the default notice
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-16">
      <div className="w-full max-w-xl rounded-2xl bg-paper p-8 text-center shadow-card ring-1 ring-evergreen-900/10 sm:p-12">
        <div className="flex justify-center">
          <Logo href={null} />
        </div>
        <h1 className="mt-8 font-display text-3xl font-semibold text-evergreen-950">Scheduled maintenance</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-soft" data-testid="maintenance-message">
          {message}
        </p>
        <div className="mt-8 rounded-xl bg-evergreen-50 px-4 py-3 text-left text-sm text-evergreen-900 ring-1 ring-evergreen-600/20">
          <p className="font-semibold">Already sitting an examination?</p>
          <p className="mt-1">
            Candidate examination links and live sessions stay open during maintenance, so an attempt in progress is
            never interrupted. If you were mid-examination, return to the link you were given.
          </p>
        </div>
        <p className="mt-8 text-sm text-ink-soft">
          Platform administrators can sign in at{" "}
          <a href="/login" className="font-semibold text-evergreen-700 underline underline-offset-2">
            /login
          </a>{" "}
          and switch maintenance mode off in the Platform Control Center.
        </p>
      </div>
    </main>
  );
}
