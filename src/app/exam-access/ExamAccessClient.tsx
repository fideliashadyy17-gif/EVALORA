"use client";

import { Logo } from "@/components/Logo";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import {
  ensureBrowserGuestKey,
  readActiveCandidatePointer,
  saveCandidateAttemptSession,
  type ActiveCandidatePointer,
} from "@/lib/examCandidateSession";
import { Download, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { isSecureBrowserEnvironment, persistSecureBrowserState } from "@/lib/lockdownClient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ClassOption {
  id: string;
  name: string;
}

export function ExamAccessClient({
  initialExamCode = "",
  classes = [],
  codeToClassMap = {},
  defaultClassId = null,
  lockdownChallenge,
}: {
  initialExamCode?: string;
  classes?: ClassOption[];
  codeToClassMap?: Record<string, string>;
  defaultClassId?: string | null;
  lockdownChallenge?: {
    timestamp: number;
    exam_code: string;
    platform: string;
    app_version: string;
    signature: string;
    nonce: string;
  };
}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [examCode, setExamCode] = useState(initialExamCode);
  const [classId, setClassId] = useState(
    defaultClassId || (initialExamCode ? codeToClassMap[initialExamCode] || "" : ""),
  );
  const [className, setClassName] = useState("");
  const [consent, setConsent] = useState(false);
  const [guestKey, setGuestKey] = useState("");
  const [activePointer, setActivePointer] = useState<ActiveCandidatePointer | null>(null);
  const [dismissedActivePointer, setDismissedActivePointer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [isLockdownClient, setIsLockdownClient] = useState(() => isSecureBrowserEnvironment());

  const [lockdownInfo, setLockdownInfo] = useState<{
    required: boolean;
    examTitle?: string;
    downloadUrl?: string;
    launchUrl?: string;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    const local = typeof window !== "undefined" ? window.localStorage : null;
    setGuestKey(ensureBrowserGuestKey(local, "exam-access"));
    setActivePointer(readActiveCandidatePointer(local, { entryHref: "/exam-access" }));
    if (isSecureBrowserEnvironment()) {
      setIsLockdownClient(true);
      persistSecureBrowserState();
    }
  }, []);

  function handleExamCodeChange(val: string) {
    const upper = val.toUpperCase();
    setExamCode(upper);
    const clean = upper.trim();
    if (codeToClassMap[clean] && !classId) {
      setClassId(codeToClassMap[clean]);
    }
  }

  async function submit(e: React.FormEvent | null) {
    e?.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      return setError("Both first name and last name are required.");
    }
    if (!examCode.trim()) {
      return setError("Examination code is required.");
    }
    if (!classId && !className.trim()) {
      return setError("Please select your class.");
    }
    if (!guestKey) {
      return setError("Your browser could not create a secure candidate key.");
    }

    setBusy(true);
    setError(null);
    setLockdownInfo(null);

    const activeLockdown = isLockdownClient || isSecureBrowserEnvironment();
    let lockdownAttestation: unknown = null;
    if (activeLockdown) {
      const lockdownApi = (window as unknown as {
        __EVALORA_SECURE_LOCKDOWN__?: {
          getAttestation: (code: string) => Promise<unknown>;
        };
      }).__EVALORA_SECURE_LOCKDOWN__;
      if (lockdownApi) {
        try {
          lockdownAttestation = await lockdownApi.getAttestation(examCode.trim().toUpperCase());
        } catch (err) {
          console.warn("Failed to collect lockdown attestation:", err);
        }
      }

      // If not obtained from Electron IPC, request fresh attestation for entered exam code
      if (!lockdownAttestation) {
        try {
          const freshRes = await fetch("/api/exam/lockdown/challenge", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-evalora-secure-browser": "1",
            },
            body: JSON.stringify({ exam_code: examCode.trim().toUpperCase() }),
          });
          if (freshRes.ok) {
            lockdownAttestation = await freshRes.json();
          }
        } catch (err) {
          console.warn("Failed to fetch fresh lockdown attestation:", err);
        }
      }

      if (!lockdownAttestation && lockdownChallenge) {
        lockdownAttestation = {
          ...lockdownChallenge,
          exam_code: examCode.trim().toUpperCase(),
        };
      }
      setIsLockdownClient(true);
      persistSecureBrowserState();
    }

    const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (activeLockdown || lockdownAttestation) {
      reqHeaders["x-evalora-secure-browser"] = "1";
    }
    if (lockdownAttestation && typeof lockdownAttestation === "object") {
      const att = lockdownAttestation as Record<string, unknown>;
      if (att.timestamp) reqHeaders["x-evalora-lockdown-timestamp"] = String(att.timestamp);
      if (att.exam_code) reqHeaders["x-evalora-lockdown-exam"] = String(att.exam_code);
      if (att.platform) reqHeaders["x-evalora-lockdown-platform"] = String(att.platform);
      if (att.app_version) reqHeaders["x-evalora-lockdown-version"] = String(att.app_version);
      if (att.signature) reqHeaders["x-evalora-lockdown-signature"] = String(att.signature);
      if (att.nonce) reqHeaders["x-evalora-lockdown-nonce"] = String(att.nonce);
    }

    let res: Response;
    try {
      res = await fetch("/api/exam/link-access", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          access_code: examCode.trim().toUpperCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          class_id: classId || undefined,
          class_name: className.trim() || undefined,
          guest_key: guestKey,
          identity: {
            ...(lockdownAttestation ? { lockdown_attestation: lockdownAttestation } : {}),
          },
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
        setLockdownInfo({
          required: true,
          examTitle: data.exam_title,
          downloadUrl: data.download_url || "/download/secure-browser",
          launchUrl: data.launch_url,
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
        entry_href: typeof data.entry_href === "string" ? data.entry_href : "/exam-access",
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

  return (
    <main className="exam-entry min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Logo />
          <span className="exam-entry-secure">Secure examination access</span>
        </div>
        <Card className="exam-entry-card overflow-hidden">
          <div className="exam-entry-heading px-6 py-7 sm:px-9 sm:py-8">
            <p className="exam-entry-kicker">Student check-in</p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">Enter your examination</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-emerald-50/80">
              Enter your name, examination code, and class to verify your identity and begin your examination.
            </p>
          </div>
          <div className="p-6 sm:p-9">
            <div className="exam-entry-assurance mb-5 grid gap-3 sm:grid-cols-3">
              <div><span>01</span><p>Server-timed session</p></div>
              <div><span>02</span><p>Answers autosaved</p></div>
              <div><span>03</span><p>Resume after reconnect</p></div>
            </div>

            {isLockdownClient && (
              <div
                role="status"
                aria-label="Secure environment active"
                className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 shadow-sm"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Verified EVALORA Secure Exam Browser Environment Active</span>
              </div>
            )}

            {activePointer && !dismissedActivePointer && (
              <div
                role="region"
                aria-label="Unfinished examination recovery"
                data-testid="active-attempt-recovery-banner"
                className="mb-5 rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3.5 text-sm text-amber-950"
              >
                <p className="font-semibold">
                  An unfinished examination{activePointer.candidate_name ? ` for ${activePointer.candidate_name}` : ""} is still in progress on this browser.
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-900/90">
                  If that paper is yours, resume where you left off. If you are a different student, enter your details below.
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

            {lockdownInfo?.required && (
              <div
                role="alert"
                aria-label="Secure examination application required"
                className="mb-5 rounded-2xl border-2 border-evergreen-800 bg-evergreen-950 p-5 text-white shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-gold-500/20 p-2 text-gold-400 shrink-0">
                    <ShieldAlert className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-base font-bold text-white">
                      EVALORA Secure Exam Browser Required
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-evergreen-100/90">
                      {lockdownInfo.examTitle ? (
                        <><strong>{lockdownInfo.examTitle}</strong> has been configured with strict exam lockdown.</>
                      ) : (
                        "This examination has been configured with strict exam lockdown."
                      )}{" "}
                      Standard web browsers (Chrome, Edge, Safari) cannot be used to take this examination.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {lockdownInfo.launchUrl && (
                        <a
                          href={lockdownInfo.launchUrl}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gold-500 px-3.5 py-2 text-xs font-bold text-evergreen-950 shadow transition hover:bg-gold-400"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Launch in Secure Browser
                        </a>
                      )}
                      <Link
                        href={lockdownInfo.downloadUrl || "/download/secure-browser"}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                      >
                        <Download className="h-3.5 w-3.5" /> Download Secure Browser
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First Name">
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    autoComplete="given-name"
                    required
                  />
                </Field>
                <Field label="Last Name">
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    autoComplete="family-name"
                    required
                  />
                </Field>
              </div>

              <Field label="Examination Code">
                <Input
                  value={examCode}
                  onChange={(e) => handleExamCodeChange(e.target.value)}
                  placeholder="e.g. 4E6E2138A7"
                  className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]"
                  required
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </Field>

              <Field label="Class">
                {classes.length > 0 ? (
                  <Select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    required
                  >
                    <option value="">Select your class…</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="e.g. Grade 10 — MYP 5"
                    required
                  />
                )}
              </Field>

              <label className="flex items-start gap-3 rounded-xl border border-evergreen-900/10 bg-cream/70 p-4 text-sm leading-6 text-ink">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-evergreen-700"
                  required
                />
                <span>
                  I confirm these details are mine and understand that the time limit, submission, autosave
                  and any enabled proctoring are enforced by the server.
                </span>
              </label>

              <Button
                type="submit"
                variant="gold"
                className="w-full py-3 text-base"
                disabled={busy || !consent}
              >
                {busy ? "Verifying…" : "Verify and Begin"}
              </Button>

              <p className="text-center text-xs text-ink-soft">
                Returning after a disconnection? Re-enter the same examination code, name and class to resume your saved answers.
              </p>
            </form>
          </div>
        </Card>
        <p className="mt-5 text-center text-xs text-ink-soft">
          Your attempt is verified and timed by EVALORA&apos;s secure examination service.
        </p>
      </div>
    </main>
  );
}
