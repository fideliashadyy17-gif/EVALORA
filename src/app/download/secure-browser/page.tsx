import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui";
import { CheckCircle2, Download, Laptop, ShieldCheck, Terminal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Download EVALORA Secure Exam Browser",
  description: "Official secure examination application for Windows and desktop devices.",
};

const RELEASE_VERSION = "1.1.0";
const RELEASE_EXE_URL = `https://github.com/fideliashadyy17-gif/EVALORA/releases/download/v${RELEASE_VERSION}/EVALORA-Secure-Browser-${RELEASE_VERSION}-Setup.exe`;
const RELEASE_SHA_URL = `${RELEASE_EXE_URL}.sha256`;

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
            Download EVALORA Secure Exam Browser
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-ink-soft">
            A dedicated desktop application for examinations that require strict Lockdown. Built for Windows 10 &amp; 11 with
            screen isolation, single-monitor focus enforcement, and hardware-backed cryptographic challenge attestation.
          </p>
        </div>

        {/* Quick PowerShell 1-Click Install Card */}
        <div className="mt-10 rounded-2xl border-2 border-evergreen-800 bg-evergreen-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-gold-500/20 px-3 py-1 text-xs font-bold text-gold-400">
                <Terminal className="h-3.5 w-3.5" /> Windows 10 / 11 · x64 · Version {RELEASE_VERSION} (Recommended)
              </span>
              <h2 className="mt-2 font-display text-xl font-bold text-white">
                One-Line Fast Setup (PowerShell)
              </h2>
              <p className="mt-1 text-xs text-evergreen-200/80">
                Open <strong>PowerShell</strong> or <strong>Windows Terminal</strong> on your PC and paste this command:
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-black/60 p-4 font-mono text-xs text-gold-300">
            <code className="select-all flex-1 break-all">
              irm https://evalora-six.vercel.app/api/lockdown/install | iex
            </code>
          </div>
          <p className="mt-3 text-[11px] text-evergreen-300">
            ✓ Registers the <code className="text-gold-300 font-mono">evalora-lockdown://</code> protocol · ✓ Creates Desktop &amp; Start Menu shortcuts · ✓ Clean user-level installation
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
                  Windows Bootstrap (.bat)
                </span>
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-evergreen-950">
                Windows Setup Script (.bat)
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                Automated bootstrap script for Windows. Double-click to download and install the official Secure Browser package and register deep-linking.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-ink-soft">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Runs without administrator rights
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Registers <code className="font-mono">evalora-lockdown://</code> protocol
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Verifies SHA-256 integrity before installation
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
                Windows 10 / 11 · Direct Download
              </p>
            </div>
          </Card>

          {/* Standalone Windows Installer */}
          <Card className="flex flex-col justify-between border-2 border-evergreen-900/20 p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-evergreen-100 p-2.5 text-evergreen-900">
                  <Terminal className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-evergreen-100 px-2.5 py-0.5 text-xs font-semibold text-evergreen-800">
                  Standalone Installer (.exe)
                </span>
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-evergreen-950">
                EVALORA Secure Browser {RELEASE_VERSION}
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                Official Windows installer for EVALORA Secure Exam Browser. Includes native Ed25519 hardware key protection and isolated examination environment.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-ink-soft">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Full desktop installer wizard
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Start Menu &amp; Desktop shortcuts
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Multi-display and clipboard guard
                </li>
              </ul>
            </div>
            <div className="mt-8 border-t border-evergreen-900/10 pt-6">
              <div className="flex flex-col gap-2">
                <a
                  href={RELEASE_EXE_URL}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 py-3 text-sm font-bold text-evergreen-950 shadow transition hover:bg-gold-400"
                >
                  <Download className="h-4 w-4" /> Download Windows Installer (.exe)
                </a>
                <div className="flex items-center justify-between text-[11px] text-ink-soft px-1">
                  <span>Version {RELEASE_VERSION} (x64)</span>
                  <a
                    href={RELEASE_SHA_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-evergreen-700 underline underline-offset-2 hover:text-evergreen-900"
                  >
                    SHA-256 Checksum
                  </a>
                </div>
              </div>
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
              <h4 className="font-semibold text-evergreen-950">Install Once</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                Download and run the installer or paste the one-line setup command in PowerShell. The installer registers the <code className="font-mono text-evergreen-900">evalora-lockdown://</code> protocol handler.
              </p>
            </div>
            <div className="space-y-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-evergreen-900 font-display text-sm font-bold text-white">
                2
              </span>
              <h4 className="font-semibold text-evergreen-950">Click Exam Link</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                Open your examination link in Chrome or Edge. Click <strong>&quot;Launch in Secure Browser&quot;</strong> and allow your browser to open the application when prompted.
              </p>
            </div>
            <div className="space-y-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-evergreen-900 font-display text-sm font-bold text-white">
                3
              </span>
              <h4 className="font-semibold text-evergreen-950">Sit Your Paper</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                The application starts fullscreen with strict focus enforcement. Complete candidate identification, sit your paper, and submit when finished.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
            <p className="font-semibold text-amber-900">Troubleshooting &amp; System Requirements:</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-amber-900/90">
              <li><strong>Screen flashed and application did not open?</strong> An outdated background process or old protocol handler may be present. Close any existing windows and re-run the <strong>One-Line Fast Setup</strong> above to register the handler cleanly.</li>
              <li><strong>Single Monitor Required:</strong> Disconnect any secondary monitors, TVs, or external displays before starting.</li>
              <li><strong>Close Prohibited Apps:</strong> Close Discord, TeamViewer, AnyDesk, OBS, Zoom, or screen sharing tools before beginning.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
