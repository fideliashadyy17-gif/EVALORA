"use client";

import { ExamLanguageShield } from "@/components/ExamLanguageShield";
import { ExamBrandHeader, type ExamOrganizationBrand } from "@/components/ExamBrandHeader";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import type { AccessMode, IdentityField } from "@/lib/exam-access";
import type { PaperLanguage } from "@/lib/examLanguage";
import {
  ensureBrowserGuestKey,
  readActiveCandidatePointer,
  saveCandidateAttemptSession,
  type ActiveCandidatePointer,
} from "@/lib/examCandidateSession";
import { createClient } from "@/lib/supabase/client";
import { createLockdownCandidateBinding, isSecureBrowserEnvironment, persistSecureBrowserState } from "@/lib/lockdownClient";
import { Download, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ClassOption { id: string; name: string }

export function ExamJoinClient({
  token,
  title,
  description,
  instructions,
  classes,
  defaultClassId,
  verifiedClassId,
  verifiedStudentName,
  initialCode,
  accessMode,
  identityFields,
  requiresAccount,
  language,
  languageLock,
  lockdownRequired,
  lockdownLaunchUrl,
  organization,
}: {
  token: string;
  title: string;
  description: string | null;
  instructions: string | null;
  classes: ClassOption[];
  defaultClassId: string | null;
  verifiedClassId: string | null;
  verifiedStudentName: string | null;
  initialCode: string;
  accessMode: AccessMode;
  identityFields: IdentityField[];
  requiresAccount: boolean;
  language: PaperLanguage;
  languageLock: boolean;
  lockdownRequired?: boolean;
  lockdownLaunchUrl?: string;
  organization?: ExamOrganizationBrand | null;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [ignoreAuthSession, setIgnoreAuthSession] = useState(false);
  const effectiveVerifiedClassId = ignoreAuthSession ? null : verifiedClassId;
  const effectiveVerifiedStudentName = ignoreAuthSession ? null : verifiedStudentName;
  const [classId, setClassId] = useState(defaultClassId ?? verifiedClassId ?? "");
  const [identity, setIdentity] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [guestKey, setGuestKey] = useState("");
  const [activePointer, setActivePointer] = useState<ActiveCandidatePointer | null>(null);
  const [dismissedActivePointer, setDismissedActivePointer] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [isLockdownClient, setIsLockdownClient] = useState(() => isSecureBrowserEnvironment());

  const [lockdownAlert, setLockdownAlert] = useState<{
    required: boolean;
    launchUrl?: string;
    downloadUrl?: string;
    reason?: string;
  } | null>(
    lockdownRequired && !isSecureBrowserEnvironment()
      ? {
          required: true,
          launchUrl: lockdownLaunchUrl,
          downloadUrl: "/download/secure-browser",
        }
      : null,
  );

  useEffect(() => {
    if (isSecureBrowserEnvironment()) {
      setIsLockdownClient(true);
      setLockdownAlert(null);
      persistSecureBrowserState();
    }
  }, []);

  useEffect(() => {
    const local = typeof window !== "undefined" ? window.localStorage : null;
    setGuestKey(ensureBrowserGuestKey(local, token));
    setActivePointer(readActiveCandidatePointer(local, { inviteToken: token }));
  }, [token]);

  async function handleDifferentStudentFromAuth() {
    if (accessMode === "registered_students_only") {
      setSwitchingAccount(true);
      try {
        await createClient().auth.signOut({ scope: "local" });
      } catch {
        // Proceed to switch-account login even if local sign-out fails.
      }
      window.location.assign(`/login?switch=1&next=${encodeURIComponent(`/exam/join/${token}`)}`);
      return;
    }
    setIgnoreAuthSession(true);
    if (classes.length === 1) setClassId(classes[0].id);
    else setClassId("");
    try {
      void createClient().auth.signOut({ scope: "local" });
    } catch {
      // Optional background cleanup of lingering student portal session.
    }
  }

  async function submit(e: React.FormEvent | null) {
    e?.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return setError("Both first name and last name are required.");
    if (!classId) return setError("Select your class.");
    if (!guestKey) return setError("Your browser could not create a secure candidate key.");
    if (identityFields.some((f) => f.required && !(identity[f.key] ?? "").trim()))
      return setError("Complete every required identification field.");
    setBusy(true);
    setError(null);
    const activeLockdown = isLockdownClient || isSecureBrowserEnvironment();
    let lockdownAttestation: unknown = null;
    if (activeLockdown || lockdownRequired) {
      const lockdownApi = (window as unknown as {
        __EVALORA_SECURE_LOCKDOWN__?: {
          getAttestation: (examCode: string, context: { first_name: string; last_name: string; class_id: string; guest_key: string; identity: Record<string, string>; candidate_binding: string }) => Promise<unknown>;
        };
      }).__EVALORA_SECURE_LOCKDOWN__;
      if (lockdownApi) {
        try {
          const candidateContext = { first_name: firstName.trim(), last_name: lastName.trim(), class_id: classId, guest_key: guestKey, identity };
          const candidate_binding = await createLockdownCandidateBinding(candidateContext);
          lockdownAttestation = await lockdownApi.getAttestation(code.trim().toUpperCase(), { ...candidateContext, candidate_binding });
        } catch (e) {
          console.warn("Failed to collect lockdown attestation:", e);
        }
      }

      // Never mint or fetch a server-signed client assertion here. The server
      // admission endpoint accepts only the signature returned by the native
      // Secure Browser bridge; ordinary browser markers do not create one.
      if (activeLockdown) {
        setIsLockdownClient(true);
        persistSecureBrowserState();
      }
    }

    const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };

    let res: Response;
    try {
      res = await fetch("/api/exam/link-access", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          invite_token: token,
          access_code: code.trim().toUpperCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          class_id: classId,
          guest_key: guestKey,
          identity: {
            ...identity,
            ...(lockdownAttestation ? { lockdown_attestation: lockdownAttestation } : {}),
          },
          ...(ignoreAuthSession ? { ignore_auth_session: true } : {}),
          consent: true,
        }),
      });
    } catch {
      setBusy(false);
      return setError("Connection interrupted while verifying access. Check your connection and try again.");
    }
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      if (data?.lockdown_required) {
        setLockdownAlert({
          required: true,
          launchUrl: data.launch_url || lockdownLaunchUrl,
          downloadUrl: data.download_url || "/download/secure-browser",
          reason: data.lockdown_reason,
        });
      }
      return setError(data?.error ?? "Access denied.");
    }
    const saved = saveCandidateAttemptSession(
      typeof window !== "undefined" ? window.localStorage : null,
      typeof window !== "undefined" ? window.sessionStorage : null,
      {
        attempt_id: data.attempt_id,
        token: data.access_token,
        exam_id: data.exam_id,
        entry_href: typeof data.entry_href === "string" ? data.entry_href : `/exam/join/${token}`,
        invite_token: token,
        candidate_name:
          typeof data.candidate_name === "string" && data.candidate_name.trim()
            ? data.candidate_name
            : `${firstName.trim()} ${lastName.trim()}`.trim(),
        status: typeof data.status === "string" ? data.status : "in_progress",
      },
    );
    if (!saved) {
      return setError("Your browser blocked session storage. Enable it and try again.");
    }
    if (activeLockdown || data?.lockdown_verified) {
      persistSecureBrowserState();
    }
    router.push(activeLockdown || data?.lockdown_verified ? `/take-exam/${data.attempt_id}?lockdown=1` : `/take-exam/${data.attempt_id}`);
  }

  const effectiveRequiresAccount =
    requiresAccount || (accessMode === "registered_students_only" && ignoreAuthSession);

  return (
    <main className="exam-entry min-h-screen px-4 py-8 sm:px-6 sm:py-12" lang={language}>
      <ExamLanguageShield language={language} enabled={languageLock} />
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <ExamBrandHeader organization={organization} />
          <span className="exam-entry-secure">Secure examination access</span>
        </div>
        <Card className="exam-entry-card overflow-hidden">
          <div className="exam-entry-heading px-6 py-7 sm:px-9 sm:py-8">
            <p className="exam-entry-kicker">Shared examination invitation</p>
            <div lang={language} translate={languageLock ? "no" : undefined} className={languageLock ? "notranslate" : undefined}>
              <h1 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
              {description && <p className="mt-2 text-sm leading-6 text-emerald-50/80">{description}</p>}
            </div>
          </div>
          <div className="p-6 sm:p-9">
            {instructions && (
              <div lang={language} translate={languageLock ? "no" : undefined} className={`notranslate mt-3 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900`}>
                {instructions}
              </div>
            )}
            <p className="mt-3 text-sm text-ink-soft">
              {accessMode === "shared_link"
                ? "No EVALORA account is required. Shared classroom browsers are supported: each student enters their own name and access code for a separate timed paper."
                : "This examination is restricted to registered students. Sign in with your institutional account; a valid link and code alone are not sufficient."}
            </p>
            {activePointer && !dismissedActivePointer && (
              <div
                role="region"
                aria-label="Unfinished examination recovery"
                data-testid="active-attempt-recovery-banner"
                className="mt-4 rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3.5 text-sm text-amber-950"
              >
                <p className="font-semibold">
                  An unfinished examination{activePointer.candidate_name ? ` for ${activePointer.candidate_name}` : ""} is still in progress on this browser.
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-900/90">
                  If that paper is yours, resume where you left off. If you are a different student, start your own separate attempt below — the saved attempt will not be overwritten.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    className="text-xs"
                    onClick={() => router.push(`/take-exam/${activePointer.attempt_id}`)}
                  >
                    Resume{activePointer.candidate_name ? ` ${activePointer.candidate_name}'s` : " saved"} attempt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-xs"
                    onClick={() => setDismissedActivePointer(true)}
                  >
                    I am a different student
                  </Button>
                </div>
              </div>
            )}
            {effectiveVerifiedStudentName && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-evergreen-700/30 bg-evergreen-50 px-4 py-2.5 text-sm text-evergreen-900">
                <p>
                  Verified student: <strong>{effectiveVerifiedStudentName}</strong>. Your registered class is selected automatically.
                </p>
                <button
                  type="button"
                  disabled={switchingAccount}
                  onClick={() => void handleDifferentStudentFromAuth()}
                  className="text-xs font-semibold text-evergreen-800 underline underline-offset-2 hover:text-evergreen-950"
                >
                  {switchingAccount
                    ? "Switching…"
                    : accessMode === "registered_students_only"
                      ? "Switch student account"
                      : `Not ${effectiveVerifiedStudentName}? Enter as another student`}
                </button>
              </div>
            )}
            {effectiveRequiresAccount && (
              <p className="mt-3 rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                A verified institutional student account is required.{" "}
                <Link className="font-semibold underline" href={`/login?switch=1&next=${encodeURIComponent(`/exam/join/${token}`)}`}>Sign in</Link>, then reopen this link.
              </p>
            )}

            {lockdownAlert?.required && (
              <div
                role="alert"
                aria-label="Secure examination application required"
                className="mt-4 rounded-2xl border-2 border-evergreen-800 bg-evergreen-950 p-6 text-white shadow-xl"
              >
                <div className="flex items-start gap-3">
                  <span className="shrink-0 rounded-lg bg-gold-500/20 p-2.5 text-gold-400">
                    <ShieldAlert className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-display text-base font-bold text-white">
                        EVALORA Secure Exam Browser Required
                      </h2>
                      <span className="rounded-full bg-gold-500/20 px-2.5 py-0.5 text-[11px] font-bold text-gold-300">
                        Lockdown Active
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-evergreen-100/90">
                      This examination has been configured with strict exam lockdown. Standard web browsers (Chrome, Edge, Safari, Firefox) cannot be used to sit this paper.
                    </p>

                    <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-black/40 p-3.5 text-xs text-evergreen-100/90">
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500 text-[11px] font-bold text-evergreen-950">1</span>
                        <span><strong>First time on this PC?</strong> Download the setup script or install via the download page.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500 text-[11px] font-bold text-evergreen-950">2</span>
                        <span><strong>Already installed?</strong> Click <em>&quot;Launch in Secure Browser&quot;</em> and allow your browser to open the application.</span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {lockdownAlert.launchUrl && (
                        <a
                          href={lockdownAlert.launchUrl}
                          className="inline-flex items-center gap-2 rounded-xl bg-gold-500 px-4 py-2.5 text-xs font-bold text-evergreen-950 shadow transition hover:bg-gold-400"
                        >
                          <ExternalLink className="h-4 w-4" /> Launch in Secure Browser
                        </a>
                      )}
                      <a
                        href="/downloads/EVALORA-Lockdown-Setup.bat"
                        download
                        className="inline-flex items-center gap-2 rounded-xl border border-evergreen-700 bg-evergreen-800 px-4 py-2.5 text-xs font-semibold text-white shadow transition hover:bg-evergreen-700"
                      >
                        <Download className="h-4 w-4" /> Download Setup Script (.bat)
                      </a>
                      <Link
                        href={lockdownAlert.downloadUrl || "/download/secure-browser"}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/20"
                      >
                        All Download Options
                      </Link>
                    </div>

                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-evergreen-200/80">
                      <span>Application didn&apos;t open or screen flashed?</span>
                      <div className="flex items-center gap-3">
                        {lockdownAlert.launchUrl && (
                          <a
                            href={lockdownAlert.launchUrl}
                            className="font-semibold text-gold-300 underline underline-offset-2 hover:text-gold-200"
                          >
                            Retry Launch
                          </a>
                        )}
                        <Link
                          href="/download/secure-browser"
                          className="font-medium text-evergreen-300 underline underline-offset-2 hover:text-white"
                        >
                          Troubleshooting &amp; Setup Help
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isLockdownClient && (
              <div
                role="status"
                aria-label="Secure environment active"
                className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 shadow-sm"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Verified EVALORA Secure Exam Browser Environment Active</span>
              </div>
            )}

            <form onSubmit={submit} className="mt-5 space-y-4">
              {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First Name"><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="off" placeholder="First name *" /></Field>
                <Field label="Last Name"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="off" placeholder="Last name *" /></Field>
              </div>
              {identityFields.map((field) => (
                <Field key={field.key} label={`${field.label}${field.required ? " *" : ""}`} hint="Required by this examination's organizer.">
                  <Input
                    type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
                    value={identity[field.key] ?? ""}
                    onChange={(e) => setIdentity((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    required={field.required}
                    autoComplete="off"
                  />
                </Field>
              ))}
              <Field label="Examination Code" hint="Use the code provided with this link. Hyphens, spaces and O/0 look-alikes don't matter — pasting the code works too.">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. X8K2P4Q7" className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]" required autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} />
              </Field>
              <Field label="Class" hint={effectiveVerifiedClassId ? "Your verified class is fixed." : "Choose your class. Your AP Calculus course (AB or BC) follows from your class."}>
                <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={Boolean(effectiveVerifiedClassId)} required>
                  <option value="">Select class…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <label className="flex items-start gap-3 rounded-xl border border-evergreen-900/10 bg-cream/70 p-4 text-sm leading-6 text-ink">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-evergreen-700" required />
                <span>I confirm these details are mine and understand that the time limit, submission, autosave and any enabled proctoring are enforced by the server.</span>
              </label>
              <Button type="submit" variant="gold" className="w-full py-3 text-base" disabled={busy || !consent || !guestKey || effectiveRequiresAccount}>
                {busy ? "Verifying…" : "Verify and Begin"}
              </Button>
              <p className="text-center text-xs text-ink-soft">
                Returning after a disconnection? Re-enter the same link, code, name, identification fields and class on this browser to resume your saved answers.
              </p>
            </form>
          </div>
        </Card>
        <p className="mt-5 text-center text-xs text-ink-soft">Your attempt is verified and timed by EVALORA&apos;s secure examination service.</p>
      </div>
    </main>
  );
}
