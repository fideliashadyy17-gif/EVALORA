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
            A hardened desktop examination environment built to uphold academic integrity. Designed for Windows and
            desktop computers with hardware-level screen protection and system-level focus enforcement.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Windows Installer */}
          <Card className="flex flex-col justify-between border-2 border-evergreen-900/20 p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-evergreen-100 p-2.5 text-evergreen-900">
                  <Laptop className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-evergreen-100 px-2.5 py-0.5 text-xs font-semibold text-evergreen-800">
                  Recommended for Windows
                </span>
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-evergreen-950">
                Windows Desktop Installer
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                Full installer for Windows 10 and 11. Registers deep-link protocols so you can jump straight into exams from your web browser.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-ink-soft">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Hardware screen-capture blocking
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> System shortcut interception (Alt+Tab, Win)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Automatic updates &amp; protocol handler
                </li>
              </ul>
            </div>
            <div className="mt-8 border-t border-evergreen-900/10 pt-6">
              <a
                href="/downloads/EvaloraSecureBrowserSetup-1.0.0.exe"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-evergreen-900 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-evergreen-800"
              >
                <Download className="h-4 w-4" /> Download Windows Installer (x64)
              </a>
              <p className="mt-2 text-center text-[11px] text-ink-soft">
                Version 1.0.0 · 64-bit · SHA-256 Verified
              </p>
            </div>
          </Card>

          {/* Windows Portable (Zero install) */}
          <Card className="flex flex-col justify-between p-6 sm:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-cream p-2.5 text-evergreen-900">
                  <Terminal className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                  BYOD / No Admin Rights
                </span>
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-evergreen-950">
                Windows Portable Executable
              </h2>
              <p className="mt-2 text-sm text-ink-soft">
                Single standalone .exe file. Requires no installation or administrator rights. Perfect for personal laptops and school computer labs.
              </p>
              <ul className="mt-4 space-y-2 text-xs text-ink-soft">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> No installation required — runs directly
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Leaves zero permanent traces upon exit
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-evergreen-700" /> Supports Windows 10 &amp; Windows 11
                </li>
              </ul>
            </div>
            <div className="mt-8 border-t border-evergreen-900/10 pt-6">
              <a
                href="/downloads/EVALORA-Secure-Browser-Portable.exe"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-evergreen-900/20 bg-paper px-4 py-3 text-sm font-semibold text-evergreen-950 shadow-sm transition hover:bg-cream"
              >
                <Download className="h-4 w-4" /> Download Portable .exe (BYOD)
              </a>
              <p className="mt-2 text-center text-[11px] text-ink-soft">
                Version 1.0.0 · Standalone executable
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
              <h4 className="font-semibold text-evergreen-950">Download &amp; Launch</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                Download the installer or portable executable on your Windows computer. Launch the application before your examination starts.
              </p>
            </div>
            <div className="space-y-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-evergreen-900 font-display text-sm font-bold text-white">
                2
              </span>
              <h4 className="font-semibold text-evergreen-950">Close Prohibited Apps</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                Close background messaging apps, screen recorders, and extra browser windows (such as Discord, TeamViewer, Zoom, and OBS).
              </p>
            </div>
            <div className="space-y-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-evergreen-900 font-display text-sm font-bold text-white">
                3
              </span>
              <h4 className="font-semibold text-evergreen-950">Enter Exam Code</h4>
              <p className="text-xs leading-relaxed text-ink-soft">
                Input your Exam Code and personal Candidate Code into the secure prompt. Your session will be cryptographically verified.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-ink-soft">
          Need IT administrator or mass-deployment MSI scripts for your school? Contact your institution&apos;s EVALORA administrator.
        </div>
      </main>
    </div>
  );
}
