import { PageNavigation } from "@/components/PageNavigation";
import { Badge, Button, ButtonLink, Input, PageTitle, Select, StatCard } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { KeyRound, ShieldCheck, UserX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createStudentLogin, studentOp } from "../../actions/academics";
import { Flash, Notice, Section, StatusBadge, Table } from "../../ui";

export const metadata: Metadata = { title: "Student access management" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  student_updated: "Student access updated.",
  account_created: "Student login created — see the one-time password above.",
  account_linked: "Existing login account linked to this student.",
  reset_sent: "Password reset email sent.",
  student: "That student no longer exists.",
  student_email: "Add an email address to the student record before creating a login.",
  login_failed: "The student login could not be created.",
  status: "Invalid student status.",
  class: "Choose a class first.",
};

interface StudentRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  student_ref: string | null;
  status: string;
  organizations: { id: string; name: string } | null;
  profiles: { id: string; email: string; full_name: string | null; status: string } | null;
  student_enrollments: { status: string; classes: { name: string } | null; academic_years: { name: string } | null }[];
}

export default async function StudentAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; org?: string; status?: string; access?: string; page?: string; ok?: string; e?: string }>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const admin = createAdminClient();
  const back = "/admin/students/access";

  let query = admin
    .from("students")
    .select("*, organizations(id, name), profiles(id, email, full_name, status), student_enrollments(status, classes(name), academic_years(name))")
    .order("full_name")
    .limit(1000);
  if (sp.org) query = query.eq("organization_id", sp.org);
  if (sp.status) query = query.eq("status", sp.status);
  if (sp.q) query = query.or(`full_name.ilike.%${sp.q}%,email.ilike.%${sp.q}%,student_ref.ilike.%${sp.q}%`);

  const [{ data: rawStudents }, { data: orgs }, { count: candidateCount }, { count: compAccessCount }] = await Promise.all([
    query,
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("exam_candidates").select("id", { count: "exact", head: true }),
    admin.from("competition_registrations").select("id", { count: "exact", head: true }).neq("status", "removed"),
  ]);

  const students = (rawStudents ?? []) as unknown as StudentRow[];
  const userIds = [...new Set(students.map((s) => s.user_id).filter((v): v is string => Boolean(v)))];
  const { data: memberships } = userIds.length
    ? await admin.from("organization_members").select("organization_id, user_id, role, status").in("user_id", userIds)
    : { data: [] };
  const membershipKey = new Set((memberships ?? []).map((m) => `${m.organization_id}:${m.user_id}:${m.role}:${m.status}`));

  const decorated = students.map((s) => {
    const hasLogin = Boolean(s.user_id);
    const hasStudentMembership = hasLogin && membershipKey.has(`${s.organization_id}:${s.user_id}:student:active`);
    const accountActive = s.profiles?.status === "active";
    const loginReady = s.status === "active" && hasLogin && hasStudentMembership && accountActive;
    return { s, hasLogin, hasStudentMembership, accountActive, loginReady };
  });

  const filtered = decorated.filter(({ s, hasLogin, loginReady }) => {
    if (sp.access === "ready") return loginReady;
    if (sp.access === "roster") return !hasLogin;
    if (sp.access === "linked") return hasLogin;
    if (sp.access === "attention") return !loginReady;
    if (sp.access === "blocked") return s.status !== "active" || (hasLogin && s.profiles?.status !== "active");
    return true;
  });

  const linked = decorated.filter((d) => d.hasLogin).length;
  const ready = decorated.filter((d) => d.loginReady).length;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <PageTitle
        eyebrow="Learners & Rosters · Credential & Login Governance"
        title="Student access management"
        subtitle="Control roster status and linked student login accounts. Competition and examination code-based access remains separately controlled per event so one credential never opens unrelated assessments."
        action={<ButtonLink href="/admin/students/bulk" variant="gold">Register students</ButtonLink>}
      />

      <Flash />
      <Notice ok={sp.ok} e={sp.e} messages={MESSAGES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students shown" value={students.length} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Linked login accounts" value={linked} icon={<KeyRound className="h-5 w-5" />} />
        <StatCard label="Login-ready students" value={ready} icon={<ShieldCheck className="h-5 w-5" />} />
        <StatCard label="Needs access attention" value={decorated.length - ready} icon={<UserX className="h-5 w-5" />} />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Section title="Competition access" hint={`${compAccessCount ?? 0} participant registration records exist. Participant eligibility and codes are enforced per competition.`}>
          <ButtonLink href="/admin/competitions/participants" variant="outline">Competition participants</ButtonLink>{" "}
          <ButtonLink href="/admin/competitions/codes" variant="outline">Competition access codes</ButtonLink>
        </Section>
        <Section title="Examination access" hint={`${candidateCount ?? 0} candidate records exist. Each candidate has an exam-specific code and an independent attempt deadline.`}>
          <ButtonLink href="/admin/examinations/candidates" variant="outline">Examination candidates</ButtonLink>{" "}
          <ButtonLink href="/admin/examinations/codes" variant="outline">Candidate access codes</ButtonLink>
        </Section>
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><Input name="q" defaultValue={sp.q} placeholder="Search student, email or reference…" aria-label="Search students" /></div>
        <Select name="org" defaultValue={sp.org ?? ""} className="w-56" aria-label="Organization">
          <option value="">All organizations</option>
          {(orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label="Roster status">
          <option value="">All roster statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="graduated">Graduated</option>
          <option value="withdrawn">Withdrawn</option>
        </Select>
        <Select name="access" defaultValue={sp.access ?? ""} className="w-52" aria-label="Access state">
          <option value="">All access states</option>
          <option value="ready">Login ready</option>
          <option value="linked">Linked account</option>
          <option value="roster">Roster only</option>
          <option value="blocked">Blocked / inactive</option>
          <option value="attention">Needs attention</option>
        </Select>
        <Button type="submit" variant="outline">Filter</Button>
        {(sp.q || sp.org || sp.status || sp.access) && (
          <Link href="/admin/students/access" className="inline-flex min-h-10 items-center px-2.5 text-sm font-medium text-evergreen-800 underline underline-offset-2">
            Reset
          </Link>
        )}
      </form>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-evergreen-900/30 bg-paper px-6 py-12 text-center text-sm text-ink-soft">No students match this access view.</p>
      ) : (
        <>
          <Table head={["Student", "Organization / class", "Roster status", "Login account", "Effective access", "Actions"]}>
            {paged.map(({ s, hasLogin, hasStudentMembership, accountActive, loginReady }) => {
            const activeEnrollment = s.student_enrollments.find((e) => e.status === "active");
            return (
              <tr key={s.id}>
                <td>
                  <span className="font-semibold text-evergreen-950">{s.full_name}</span>
                  <span className="block text-xs text-ink-soft">{s.email || "No email"}{s.student_ref ? ` · ${s.student_ref}` : ""}</span>
                </td>
                <td className="text-ink-soft">
                  {s.organizations?.name ?? "—"}
                  <span className="block text-xs">{activeEnrollment?.classes?.name ?? "No active class"}{activeEnrollment?.academic_years?.name ? ` · ${activeEnrollment.academic_years.name}` : ""}</span>
                </td>
                <td><StatusBadge status={s.status} /></td>
                <td>
                  {hasLogin ? (
                    <>
                      <Badge tone={accountActive ? "green" : "red"}>{accountActive ? "Account active" : "Account blocked"}</Badge>
                      <span className="block text-xs text-ink-soft">{s.profiles?.email ?? "Linked profile"}</span>
                      <span className="block text-xs text-ink-soft">{hasStudentMembership ? "Student membership active" : "Student membership missing/inactive"}</span>
                    </>
                  ) : <Badge tone="gray">Roster only</Badge>}
                </td>
                <td><Badge tone={loginReady ? "green" : "amber"}>{loginReady ? "Login ready" : "Needs setup"}</Badge></td>
                <td>
                  <div className="flex max-w-[280px] flex-wrap gap-2">
                    <form action={createStudentLogin}>
                      <input type="hidden" name="organization_id" value={s.organization_id} />
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="back" value={back} />
                      <button
                        type="submit"
                        disabled={!s.email}
                        className="rounded-full border border-evergreen-700 px-3 py-1.5 text-xs font-semibold text-evergreen-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {hasLogin ? "Send password reset" : "Create / link login"}
                      </button>
                    </form>
                    {s.status === "active" ? (
                      <form action={studentOp}>
                        <input type="hidden" name="organization_id" value={s.organization_id} />
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="op" value="status" />
                        <input type="hidden" name="status" value="suspended" />
                        <button type="submit" className="rounded-full border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-700">Suspend roster access</button>
                      </form>
                    ) : (
                      <form action={studentOp}>
                        <input type="hidden" name="organization_id" value={s.organization_id} />
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="back" value={back} />
                        <input type="hidden" name="op" value="status" />
                        <input type="hidden" name="status" value="active" />
                        <button type="submit" className="rounded-full border border-evergreen-700 px-3 py-1.5 text-xs font-semibold text-evergreen-800">Reactivate</button>
                      </form>
                    )}
                    {s.profiles?.id && <Link href={`/admin/users/${s.profiles.id}`} className="px-1 py-1.5 text-xs font-semibold text-evergreen-700 hover:underline">User account →</Link>}
                    <Link href={`/admin/students?org=${s.organization_id}`} className="px-1 py-1.5 text-xs font-semibold text-evergreen-700 hover:underline">Roster →</Link>
                  </div>
                  {!s.email && <p className="mt-1 text-xs text-amber-800">Add an email in the roster before creating a login.</p>}
                </td>
              </tr>
            );
          })}
          </Table>
          <PageNavigation
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            pathname="/admin/students/access"
            query={{ q: sp.q, org: sp.org, status: sp.status, access: sp.access }}
            label="students"
          />
        </>
      )}
    </>
  );
}
