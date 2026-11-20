import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui";
import { CheckCircle2, Laptop, ShieldCheck, Terminal } from "lucide-react";
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
            A dedicated Electron application for examinations that require Lockdown. It can make switching and capture harder,
            but it is not tamper-proof and does not provide publisher identity, secure-boot, or remote device attestation.
          </p>
        </div>

        {/* Quick PowerShell 1-Click Install Card */}
        <div className="mt-10 rounded-2xl border-2 border-evergreen-800 bg-evergreen-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-gold-500/20 px-3 py-1 text-xs font-bold text-gold-400">
                <Terminal className="h-3.5 w-3.5" /> Windows 10 / 11 · x64 · Version 1.1.0
              </span>
              <h2 className="mt-2 font-display text-xl font-bold text-white">
                Windows installer verification in progress
              </h2>
              <p className="mt-1 text-xs text-evergreen-200/80">
                No installer is available yet. We will provide the download only after a genuine Windows install, launch, and admission test passes.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-black/50 p-4 text-sm text-gold-200" role="status">
            Installer download is intentionally unavailable until Windows installation and launch verification succeeds.
          </div>
          <p className="mt-3 text-[11px] text-evergreen-300">
            The setup script and release link will be enabled after the installed app, preload bridge, and backend admission are verified.
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
                  Windows Installer Bootstrap (.bat)
                </span>
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-evergreen-950">
                Windows Setup Script (.bat)
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                This bootstrap will download and start the Electron installer after the packaged application has passed Windows verification. It does not launch or modify Edge or Chrome.
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
              <p className="rounded-lg bg-amber-50 p-3 text-center text-xs font-semibold text-amber-900" role="status">
                Setup download is not available until Windows installation and launch verification is complete.
              </p>
            </div>
          </Card>

          <Card className="flex flex-col justify-between border-2 border-evergreen-900/20 p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-evergreen-100 p-2.5 text-evergreen-900"><Terminal className="h-6 w-6" /></span>
                <span className="rounded-full bg-evergreen-100 px-2.5 py-0.5 text-xs font-semibold text-evergreen-800">Windows 10 / 11 · x64</span>
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-evergreen-950">EVALORA Secure Browser 1.1.0</h2>
              <p className="mt-2 text-sm text-ink-soft">A packaged Electron desktop application with an isolated preload bridge and per-Windows-user OS-protected signing key. This is the installer, not source code and not a Chrome or Edge launcher.</p>
            </div>
            <div className="mt-8 border-t border-evergreen-900/10 pt-6">
              <p className="rounded-lg bg-amber-50 p-3 text-center text-xs font-semibold text-amber-900" role="status">
                Windows x64 installer download is pending genuine Windows install and launch verification.
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
                Download and install <strong>EVALORA Secure Browser 1.1.0</strong> using the Windows setup wizard. The installer registers the <code className="font-mono text-evergreen-900">evalora-lockdown://</code> protocol and creates a Start Menu shortcut.
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
                The application runs fullscreen and applies best-effort local restrictions. These do not stop OS-level tampering; follow your institution&apos;s proctor instructions after submitting.
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
