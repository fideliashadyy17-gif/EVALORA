import { CopyInvitation } from "@/app/admin/examinations/invitations/CopyInvitation";
import { Badge, ButtonLink, Card, Input } from "@/components/ui";
import {
  buildInvitationText,
  examAccessAvailability,
  parseExamAccessSettings,
  type ExamAccessExam,
} from "@/lib/exam-access";

export interface ExaminationAccessCardProps {
  examTitle: string;
  organizationName?: string;
  shareUrl: string;
  accessLink: string;
  accessCode: string;
  exam: ExamAccessExam & {
    starts_at: string | null;
    ends_at: string | null;
  };
  settings: Record<string, unknown> | null;
}

export function ExaminationAccessCard({
  examTitle,
  organizationName,
  shareUrl,
  accessLink,
  accessCode,
  exam,
  settings,
}: ExaminationAccessCardProps) {
  const access = parseExamAccessSettings(settings);
  const availability = examAccessAvailability(exam);
  const restrictions = [
    "Server-verified access code bound to this examination",
    "First and last name are mandatory",
    access.accessMode === "registered_students_only"
      ? "Registered students only — institutional student record required"
      : "Shared-link candidates do not need an EVALORA account",
    access.eligibleClassIds.length
      ? `Eligible class allowlist: ${access.eligibleClassIds.length} configured`
      : "Class eligibility follows the examination / event phase links",
    `Attempt policy: ${access.attemptPolicy === "read_only_reentry" ? "read-only return after submission" : "one attempt, resume while in progress"}`,
    access.proctoring ? "Video proctoring enabled" : "Video proctoring off",
  ];
  if (access.identityFields.length) {
    restrictions.push(`Additional identity fields: ${access.identityFields.map((f) => f.label).join(", ")}`);
  }
  const invitation = buildInvitationText({
    title: examTitle,
    shareUrl,
    accessCode,
    availability: availability.label,
    restrictions,
  });

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Examination access</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-evergreen-950">{examTitle}</h2>
          {organizationName && <p className="text-sm text-ink-soft">{organizationName}</p>}
        </div>
        <Badge tone={availability.ok ? "green" : "gray"}>{availability.label}</Badge>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-evergreen-950">Unique shareable link</p>
          <p className="text-xs text-ink-soft">Persisted with the examination; opens the correct candidate access page.</p>
          <div className="flex gap-2">
            <Input readOnly value={shareUrl} className="font-mono text-xs" aria-label="Unique examination access link" />
            <CopyInvitation text={shareUrl} label="Copy link" />
          </div>
          <ButtonLink href={accessLink} variant="outline">Open candidate access page</ButtonLink>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-evergreen-950">Access code</p>
          <p className="text-xs text-ink-soft">Validated server-side against this examination&apos;s stored hash.</p>
          <div className="flex gap-2">
            <Input readOnly value={accessCode} className="text-center font-display text-xl font-bold uppercase tracking-[0.2em]" aria-label="Examination access code" />
            <CopyInvitation text={accessCode} label="Copy code" />
          </div>
          <CopyInvitation text={invitation} label="Copy complete invitation" />
        </div>
      </div>

      <div className="mt-5 grid gap-4 rounded-xl border border-evergreen-900/10 bg-cream p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Availability</p>
          <p className="mt-1 text-sm text-ink">{availability.ok ? "Open now" : availability.error}</p>
          <p className="mt-1 text-xs text-ink-soft">
            Status: <strong>{exam.status}</strong> · Opens: {exam.starts_at ? new Date(exam.starts_at).toLocaleString() : "—"} · Closes: {exam.ends_at ? new Date(exam.ends_at).toLocaleString() : "—"}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Link: {exam.shared_link_enabled ? "enabled" : "disabled"} · Link expiry: {exam.invite_expires_at ? new Date(exam.invite_expires_at).toLocaleString() : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Restrictions</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-ink-soft">
            {restrictions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        This section is organizer/Super-Admin only. The link is an identifier, not authorization; public APIs never return the stored access-code hash or privileged exam data.
      </p>
    </Card>
  );
}
