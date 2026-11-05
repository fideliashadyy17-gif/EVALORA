"use client";

import { Logo } from "@/components/Logo";
import { Button, Card, Field, Input, Select } from "@/components/ui";
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
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [classId, setClassId] = useState(defaultClassId ?? verifiedClassId ?? "");
  const [consent, setConsent] = useState(false);
  const [guestKey, setGuestKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const key = `evalora-guest-${token}`;
    let existing = "";
    try { existing = localStorage.getItem(key) ?? ""; } catch { /* private mode */ }
    if (!existing) {
      existing = crypto.randomUUID();
      try { localStorage.setItem(key, existing); } catch { /* still valid for this tab */ }
    }
    setGuestKey(existing);
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return setError("Both first name and last name are required.");
    if (!classId) return setError("Select your class.");
    if (!guestKey) return setError("Your browser could not create a secure candidate key.");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/exam/link-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_token: token,
        access_code: code.trim().toUpperCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        class_id: classId,
        guest_key: guestKey,
        consent: true,
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(data?.error ?? "Access denied.");
    try {
      localStorage.setItem(
        `evalora-attempt-${data.attempt_id}`,
        JSON.stringify({ token: data.access_token, exam_id: data.exam_id }),
      );
    } catch {
      return setError("Your browser blocked session storage. Enable it and try again.");
    }
    router.push(`/take-exam/${data.attempt_id}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <Logo className="mb-6" />
      <Card className="w-full max-w-xl p-7 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Shared examination invitation</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-evergreen-950">{title}</h1>
        {description && <p className="mt-2 text-sm text-ink-soft">{description}</p>}
        {instructions && <div className="mt-3 rounded-lg bg-evergreen-50 px-4 py-3 text-sm text-evergreen-900">{instructions}</div>}
        <p className="mt-3 text-sm text-ink-soft">
          No EVALORA account is required. The examination clock is server-authoritative, answers are autosaved,
          and re-entry resumes the same attempt within its original deadline.
        </p>
        {verifiedStudentName && (
          <p className="mt-3 rounded-lg border border-evergreen-700/30 bg-evergreen-50 px-4 py-2 text-sm text-evergreen-900">
            Verified student: <strong>{verifiedStudentName}</strong>. Your registered class is used automatically.
          </p>
        )}
        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name *"><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="given-name" /></Field>
            <Field label="Last name *"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name" /></Field>
          </div>
          <Field label="Examination access code" hint="Use the code provided with this link; it is verified on the server.">
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. X8K2P4Q7" className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]" required autoComplete="off" />
          </Field>
          <Field label="Class" hint={verifiedClassId ? "Your verified class is fixed." : "Choose the class linked to this examination."}>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={Boolean(verifiedClassId)} required>
              <option value="">Select class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-evergreen-700" required />
            <span>I confirm these details are mine and understand that the time limit, submission, autosave and any enabled proctoring are enforced by the server.</span>
          </label>
          <Button type="submit" variant="gold" className="w-full py-3 text-base" disabled={busy || !consent || !guestKey}>
            {busy ? "Verifying…" : "Verify & begin examination"}
          </Button>
          <p className="text-center text-xs text-ink-soft">
            Returning after a disconnection? Use the same link, code, name and class on this browser to resume your saved answers.
          </p>
        </form>
      </Card>
    </div>
  );
}
