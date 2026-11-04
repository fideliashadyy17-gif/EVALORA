import { Button, Card, Field, Input, Select } from "@/components/ui";
import { ExportButton } from "@/components/ExportTools";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime, toCsv } from "@/lib/utils";
import {
  importParticipants,
  registerClassForCompetition,
  registerParticipant,
  registrationOp,
} from "../../../actions/competitions";
import { CsvImport } from "../../../CsvImport";
import { Flash, Notice, Section, StatusBadge, Table } from "../../../ui";

interface CompRow {
  id: string;
  organization_id: string;
  session_id: string | null;
}

export async function ParticipantsTab({ comp, sp }: { comp: CompRow; sp: { ok?: string; e?: string } }) {
  const admin = createAdminClient();
  const [{ data: regs }, { data: orgStudents }, { data: orgs }, { data: classes }, { data: codes }, liveRes] = await Promise.all([
    admin
      .from("competition_registrations")
      .select("*, organizations(name), classes(name), competition_access_codes(code)")
      .eq("competition_id", comp.id)
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("students").select("id, full_name, student_ref").eq("organization_id", comp.organization_id).eq("status", "active").order("full_name").limit(500),
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("classes").select("id, name, organization_id, organizations(name)").order("name").limit(1000),
    admin.from("competition_access_codes").select("id, code, label").eq("competition_id", comp.id).order("created_at"),
    comp.session_id
      ? admin.from("session_participants").select("id, display_name, participant_ref, score, status, joined_at, last_seen_at").eq("session_id", comp.session_id).order("score", { ascending: false }).limit(200)
      : Promise.resolve({ data: null }),
  ]);

  const active = (regs ?? []).filter((r) => r.status !== "removed");
  const csv = toCsv([
    ["Full name", "Ref", "Organization", "Class", "Source", "Status", "Registered"],
    ...active.map((r) => [
      r.full_name, r.participant_ref ?? "",
      (r.organizations as unknown as { name: string } | null)?.name ?? "",
      (r.classes as unknown as { name: string } | null)?.name ?? "",
      r.source, r.status, fmtDateTime(r.created_at),
    ]),
  ]);

  return (
    <>
      <Flash />
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          registered: "Participant registered.",
          import_done: "Import finished — see the report above.",
          class_registered: "Class registered into the competition.",
          participant_remove: "Participant removed from the active roster.",
          participant_restore: "Participant restored.",
          participant_delete: "Registration deleted.",
          name: "Participant name is required.",
          failed: "Registration failed.",
          empty_csv: "No CSV rows found.",
          too_many: "Import is limited to 1,000 rows.",
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Register a participant</h2>
          <form action={registerParticipant} className="mt-3 space-y-3">
            <input type="hidden" name="competition_id" value={comp.id} />
            <Field label="From host school roster (optional)" hint="Choosing a student pre-fills identity; name below still required as display name.">
              <Select name="student_id" defaultValue="">
                <option value="">— Manual entry —</option>
                {(orgStudents ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}{s.student_ref ? ` (${s.student_ref})` : ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Full name *"><Input name="full_name" required /></Field>
            <Field label="Participant reference"><Input name="participant_ref" placeholder="Student ID / bib number" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Organization">
                <Select name="organization_id" defaultValue="">
                  <option value="">—</option>
                  {(orgs ?? []).map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Class">
                <Select name="class_id" defaultValue="">
                  <option value="">—</option>
                  {(classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · {(c.organizations as unknown as { name: string } | null)?.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Assign under access code">
              <Select name="access_code_id" defaultValue="">
                <option value="">— None —</option>
                {(codes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.code}{c.label ? ` (${c.label})` : ""}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="gold">Register participant</Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Register a whole class</h2>
          <p className="mt-1 text-sm text-ink-soft">Every active, actively-enrolled student of the class is registered (duplicates are skipped).</p>
          <form action={registerClassForCompetition} className="mt-3 space-y-3">
            <input type="hidden" name="competition_id" value={comp.id} />
            <Field label="Class">
              <Select name="class_id">
                {(classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {(c.organizations as unknown as { name: string } | null)?.name}</option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Register class</Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-base font-semibold text-evergreen-950">Import participants (CSV)</h2>
          <div className="mt-3">
            <CsvImport action={importParticipants} label="Participants CSV" template="full_name,participant_ref">
              <input type="hidden" name="competition_id" value={comp.id} />
            </CsvImport>
          </div>
        </Card>
      </div>

      <Section title={`Registered participants (${active.length})`}>
        <div className="mb-3"><ExportButton filename="competition-participants.csv" csv={csv} label="Export participants" /></div>
        {active.length === 0 ? (
          <p className="text-sm text-ink-soft">No registrations yet. Participants also appear here automatically when they join with a competition or session code.</p>
        ) : (
          <Table head={["Participant", "Organization / class", "Code", "Source", "Status", "Actions"]}>
            {active.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="font-medium">{r.full_name}</span>
                  {r.participant_ref && <span className="block text-xs text-ink-soft">ref {r.participant_ref}</span>}
                </td>
                <td className="text-xs">
                  {(r.organizations as unknown as { name: string } | null)?.name ?? "—"}
                  {(r.classes as unknown as { name: string } | null)?.name && (
                    <span className="block">{(r.classes as unknown as { name: string }).name}</span>
                  )}
                </td>
                <td className="font-mono text-xs">{(r.competition_access_codes as unknown as { code: string } | null)?.code ?? "—"}</td>
                <td className="capitalize text-xs">{r.source.replace(/_/g, " ")}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <div className="flex gap-3">
                    <form action={registrationOp}>
                      <input type="hidden" name="competition_id" value={comp.id} />
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="op" value="remove" />
                      <button className="font-medium text-red-700 underline-offset-2 hover:underline">Remove</button>
                    </form>
                    <form action={registrationOp}>
                      <input type="hidden" name="competition_id" value={comp.id} />
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="op" value="delete" />
                      <button className="font-medium text-ink-soft underline-offset-2 hover:underline">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {liveRes.data && (
        <Section title="Live session presence" hint="Who is actually in the running session right now (guest joins included).">
          <Table head={["Display name", "Ref", "Score", "Status", "Joined", "Last seen"]}>
            {(liveRes.data ?? []).map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.display_name}</td>
                <td>{p.participant_ref ?? "—"}</td>
                <td className="tabular-nums">{Number(p.score).toLocaleString()}</td>
                <td><StatusBadge status={p.status} /></td>
                <td className="text-xs text-ink-soft">{fmtDateTime(p.joined_at)}</td>
                <td className="text-xs text-ink-soft">{fmtDateTime(p.last_seen_at)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
    </>
  );
}
