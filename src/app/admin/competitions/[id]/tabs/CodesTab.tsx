import { Button, Card, Field, Input, Select } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import Link from "next/link";
import {
  accessCodeOp,
  regenerateSessionCode,
  saveAccessCode,
} from "../../../actions/competitions";
import { ConfirmField, Notice, Table } from "../../../ui";

interface CompRow {
  id: string;
  organization_id: string;
  session_id: string | null;
  title: string;
}

export async function CodesTab({ comp, sp }: { comp: CompRow; sp: { ok?: string; e?: string; edit_code?: string } }) {
  const admin = createAdminClient();
  const [{ data: codes }, { data: orgs }, { data: classes }, sessionRes] = await Promise.all([
    admin
      .from("competition_access_codes")
      .select("*, organizations(name), classes(name), competition_registrations(id, status, full_name, created_at)")
      .eq("competition_id", comp.id)
      .order("created_at"),
    admin.from("organizations").select("id, name").order("name").limit(500),
    admin.from("classes").select("id, name, organizations(name)").order("name").limit(1000),
    comp.session_id
      ? admin.from("quiz_sessions").select("join_code, status").eq("id", comp.session_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const editing = sp.edit_code ? (codes ?? []).find((c) => c.id === sp.edit_code) : undefined;
  const base = `/admin/competitions/${comp.id}?tab=codes`;
  const toLocal = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : "");

  const codeForm = (code?: NonNullable<typeof codes>[number]) => (
    <div className="grid gap-3 sm:grid-cols-3">
      {!code && (
        <Field label="Custom code (optional)" hint="4–12 letters/numbers, or leave empty to generate a secure one.">
          <Input name="code" placeholder="MATH2026" className="font-mono uppercase" />
        </Field>
      )}
      <Field label="Label"><Input name="label" placeholder="e.g. Lycée Classique — Grade 9" defaultValue={code?.label ?? ""} /></Field>
      <Field label="Restrict to organization">
        <Select name="organization_id" defaultValue={code?.organization_id ?? ""}>
          <option value="">Any organization</option>
          {(orgs ?? []).map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Restrict to class">
        <Select name="class_id" defaultValue={code?.class_id ?? ""}>
          <option value="">Any class</option>
          {(classes ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {(c.organizations as unknown as { name: string } | null)?.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Maximum uses"><Input name="max_uses" type="number" min={1} placeholder="Unlimited" defaultValue={code?.max_uses ?? ""} /></Field>
      <Field label="Expires at"><Input name="expires_at" type="datetime-local" defaultValue={toLocal(code?.expires_at ?? null)} /></Field>
      <Field label="Active">
        <Select name="is_active" defaultValue={code && !code.is_active ? "off" : "on"}>
          <option value="on">Active</option>
          <option value="off">Disabled</option>
        </Select>
      </Field>
    </div>
  );

  return (
    <>
      <Notice
        ok={sp.ok}
        e={sp.e}
        messages={{
          code_created: "Access code created.",
          code_saved: "Access code saved.",
          code_toggle: "Access code updated.",
          code_regenerate: "Code regenerated — the previous value no longer works.",
          code_revoke: "Access code revoked and deleted.",
          session_code: "Session join code regenerated.",
          code_short: "Custom codes need at least 4 characters.",
          code_taken: "That code is already in use on the platform.",
          code_failed: "The code could not be created.",
          confirm: "Tick the confirmation box to revoke a code.",
          no_session: "Start the live session first — it generates the session code.",
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">Session join code</h2>
          <p className="mt-1 text-sm text-ink-soft">
            The primary code shown on the host screen — anyone holding it joins the live session directly.
          </p>
          {sessionRes.data ? (
            <>
              <p className="mt-3">
                <span className="rounded-md bg-cream px-3 py-1.5 font-mono text-2xl font-bold tracking-[0.2em] text-evergreen-900">{sessionRes.data.join_code}</span>
              </p>
              <form action={regenerateSessionCode} className="mt-4">
                <input type="hidden" name="competition_id" value={comp.id} />
                <Button type="submit" variant="outline">Regenerate session code</Button>
              </form>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">Generated when you start the live session from the Overview tab.</p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold text-evergreen-950">{editing ? `Edit code ${editing.code}` : "Create an access code"}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Competition codes also join the live session — with expiry, usage caps and per-school / per-class restrictions.
          </p>
          <form action={saveAccessCode} className="mt-4 space-y-3">
            <input type="hidden" name="competition_id" value={comp.id} />
            {editing && <input type="hidden" name="id" value={editing.id} />}
            {codeForm(editing)}
            <div className="flex gap-2">
              <Button type="submit" variant="gold">{editing ? "Save code" : "Create code"}</Button>
              {editing && <Link href={base} className="inline-flex items-center px-3 text-sm font-medium text-evergreen-700 underline-offset-2 hover:underline">Cancel</Link>}
            </div>
          </form>
        </Card>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold text-evergreen-950">Competition access codes ({codes?.length ?? 0})</h2>
      <div className="mt-3">
        {(codes ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">No access codes yet — create one above.</p>
        ) : (
          <Table head={["Code", "Scope", "Usage", "Expiry", "Status", "Actions"]}>
            {(codes ?? []).map((c) => {
              const regs = ((c.competition_registrations as { status: string; full_name: string; created_at: string }[]) ?? []).filter((r) => r.status !== "removed");
              return (
                <tr key={c.id}>
                  <td>
                    <span className="font-mono text-base font-bold tracking-widest text-evergreen-900">{c.code}</span>
                    {c.label && <span className="block text-xs font-normal text-ink-soft">{c.label}</span>}
                  </td>
                  <td className="text-xs">
                    {(c.organizations as unknown as { name: string } | null)?.name ?? "Any organization"}
                    {(c.classes as unknown as { name: string } | null)?.name && (
                      <span className="block">{(c.classes as unknown as { name: string }).name}</span>
                    )}
                  </td>
                  <td>
                    {regs.length}{c.max_uses ? ` / ${c.max_uses}` : ""} used
                    {regs.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-medium text-evergreen-700">History</summary>
                        <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-xs text-ink-soft">
                          {regs.slice(0, 30).map((r, i) => (
                            <li key={i}>{r.full_name} · {fmtDateTime(r.created_at)}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="text-xs text-ink-soft">{c.expires_at ? fmtDateTime(c.expires_at) : "Never"}</td>
                  <td>{c.is_active ? <span className="font-medium text-evergreen-700">Active</span> : <span className="text-red-700">Disabled</span>}</td>
                  <td>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <Link href={`${base}&edit_code=${c.id}`} className="font-medium text-evergreen-700 underline-offset-2 hover:underline">Edit</Link>
                      <form action={accessCodeOp}>
                        <input type="hidden" name="competition_id" value={comp.id} />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="op" value="toggle" />
                        <button className="font-medium text-evergreen-700 underline-offset-2 hover:underline">{c.is_active ? "Disable" : "Activate"}</button>
                      </form>
                      <form action={accessCodeOp}>
                        <input type="hidden" name="competition_id" value={comp.id} />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="op" value="regenerate" />
                        <button className="font-medium text-gold-800 underline-offset-2 hover:underline">Regenerate</button>
                      </form>
                    </div>
                    <form action={accessCodeOp} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="competition_id" value={comp.id} />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="op" value="revoke" />
                      <ConfirmField label="Revoke" />
                      <button className="font-medium text-red-700 underline-offset-2 hover:underline">Revoke code</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
    </>
  );
}
