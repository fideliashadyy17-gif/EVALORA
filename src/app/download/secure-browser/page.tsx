import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui";
import { CheckCircle2, Download, Laptop, ShieldCheck, Terminal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Download EVALORA Secure Exam Browser",
  description: "Official secure examination application for Windows and desktop devices.",
};

export default function DownloadSecureBrowserPage() {
  return (
    <div className="min-h-screen bg-sand text-ink selection:bg-evergreen-900/10">
      <header className="border-b border-evergreen-900/10 bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <Link
            href="/exam-access"
            className="rounded-lg border border-evergreen-900/20 bg-white px-3.5 py-1.5 text-xs font-semibold text-evergreen-900 shadow-sm transition hover:bg-cream"
          >
            ← Back to Exam Check-in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-evergreen-900/15 bg-evergreen-50 px-3 py-1 text-xs font-semibold text-evergreen-900">
            <ShieldCheck className="h-4 w-4 text-evergreen-700" />
            Official Desktop Examination Client
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold text-evergreen-950 sm:text-4xl">
            EVALORA Secure Exam Browser
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-ink-soft">
            A hardened desktop examination environment built to uphold academic integrity. Designed for Windows
            computers with kiosk mode, screen capture protection, and single-monitor focus enforcement.
          </p>
        </div>

        {/* Quick PowerShell 1-Click Install Card */}
        <div className="mt-10 rounded-2xl border-2 border-evergreen-800 bg-evergreen-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-gold-500/20 px-3 py-1 text-xs font-bold text-gold-400">
                <Terminal className="h-3.5 w-3.5" /> Instant Windows 10 / 11 Setup (Recommended)
              </span>
              <h2 className="mt-2 font-display text-xl font-bold text-white">
                One-Line Fast Setup (No Administrator Rights Needed)
              </h2>
              <p className="mt-1 text-xs text-evergreen-200/80">
                Open <strong>PowerShell</strong> or <strong>Terminal</strong> on your Windows PC and paste this command:
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-black/50 p-3.5 font-mono text-xs text-gold-300">
            <code className="select-all flex-1 break-all">
              irm https://evalora-six.vercel.app/api/lockdown/install | iex
            </code>
          </div>
          <p className="mt-3 text-[11px] text-evergreen-300">
            ✓ Registers the <code className="text-gold-300">evalora-lockdown://</code> protocol · ✓ Creates a Desktop shortcut · ✓ 100% User-level safe
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {/* Windows Automated Setup Batch */}
          <Card className="flex flex-col justify-between border-2 border-evergreen-900/20 p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-evergreen-100 p-2.5 text-evergreen-900">
                  <Laptop className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-evergreen-100 px-2.5 py-0.5 text-xs font-semibold text-evergreen-800">
                  Windows Batch Setup (.bat)
                </span>
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-evergreen-950">
                Windows Setup Script (.bat)
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                Native Windows batch installer. Double-click to set up your secure exam environment and register deep-linking.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-ink-soft">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> No admin privileges needed (runs as current user)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Registers <code className="font-mono">evalora-lockdown://</code> protocol
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Creates desktop shortcut for quick examination access
                </li>
              </ul>
            </div>
            <div className="mt-8 border-t border-evergreen-900/10 pt-6">
              <a
                href="/downloads/EVALORA-Lockdown-Setup.bat"
                download
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-evergreen-900 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-evergreen-800"
              >
                <Download className="h-4 w-4" /> Download Setup Script (.bat)
              </a>
              <p className="mt-2 text-center text-[11px] text-ink-soft">
                Windows 10 / 11 · Direct Download (4.4 KB)
              </p>
            </div>
          </Card>

          {/* Full Distribution Package ZIP */}
          <Card className="flex flex-col justify-between p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-cream p-2.5 text-evergreen-900">
                  <Terminal className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                  Full Package (ZIP)
                </span>
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-evergreen-950">
                EVALORA Client Package (.zip)
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                Complete package containing the standalone application runner, setup scripts, and desktop integration files.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-ink-soft">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Contains PowerShell, Batch, and Desktop source files
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Ideal for School IT Administrators &amp; BYOD labs
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Zero permanent installation footprint on the host
                </li>
              </ul>
            </div>
            <div className="mt-8 border-t border-evergreen-900/10 pt-6">
              <a
                href="/downloads/EVALORA-Secure-Browser.zip"
                download
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-evergreen-900/20 bg-paper px-4 py-3 text-sm font-semibold text-evergreen-950 shadow-sm transition hover:bg-cream"
              >
                <Download className="h-4 w-4" /> Download Complete ZIP Package
              </a>
              <p className="mt-2 text-center text-[11px] text-ink-soft">
                Universal Desktop ZIP · 11 KB
              </p>
            </div>
          </Card>
        </div>

        {/* Instructions */}
        <div className="mt-12 rounded-2xl border border-evergreen-900/15 bg-paper p-6 sm:p-8">
          <h3 className="font-display text-lg font-bold text-evergreen-950">
            How to use EVALORA Secure Exam Browser
          </h3>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-evergreen-900 font-display text-sm font-bold text-white">
                1
              </span>
              <h4 className="font-semibold text-evergreen-950">Setup Once</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                Run the quick PowerShell command or double-click <code className="font-mono text-evergreen-900">EVALORA-Lockdown-Setup.bat</code>. This registers the secure protocol on your PC without needing administrator privileges.
              </p>
            </div>
            <div className="space-y-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-evergreen-900 font-display text-sm font-bold text-white">
                2
              </span>
              <h4 className="font-semibold text-evergreen-950">Click Exam Link</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                Click your examination link or enter your code on the check-in screen. Click <strong>&quot;Launch in Secure Browser&quot;</strong> and allow your browser to open the application.
              </p>
            </div>
            <div className="space-y-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-evergreen-900 font-display text-sm font-bold text-white">
                3
              </span>
              <h4 className="font-semibold text-evergreen-950">Sit Your Paper</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                The exam runs in a locked, fullscreen environment. Answers are continuously autosaved to the server. When finished, submit your exam to return safely to Windows.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
            <p className="font-semibold text-amber-900">Important System Requirements for Lockdown Examinations:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-amber-900/90">
              <li>Supported OS: Windows 10 or Windows 11 (64-bit).</li>
              <li>Single Monitor: Disconnect any secondary monitors, TVs, or external displays before starting.</li>
              <li>Close Prohibited Apps: Close Discord, TeamViewer, AnyDesk, OBS, Zoom, or screen sharing tools.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
