import { Badge, Button, ButtonLink, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import {
  createQuestionPool,
  updateQuestionPoolFilters,
} from "../../actions/event-operations";
import { Flash, Notice, Section } from "../../ui";
import { PoolAssemblyClient, type PoolEligibleQuestion, type PoolReport } from "./PoolAssemblyClient";

export const metadata: Metadata = { title: "Question pools" };
export const dynamic = "force-dynamic";

interface Org { id: string; name: string }
interface Event { id: string; organization_id: string; name: string }
interface Phase { id: string; event_id: string; title: string; phase_key: string; max_questions: number | null }
interface Class { id: string; name: string; organization_id: string }
interface Pool {
  id: string; organization_id: string; event_id: string | null; phase_id: string | null;
  class_id: string; curriculum: string | null; title: string; status: string;
  target_count: number; filters: Record<string, unknown>; notes: string | null;
}

export default async function QuestionPoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [{ data: orgRows }, { data: eventRows }, { data: phaseRows }, { data: classRows }, { data: subjectRows }, { data: curriculumRows }] = await Promise.all([
    admin.from("organizations").select("id,name").order("name").limit(300),
    admin.from("competition_events").select("id,organization_id,name").order("name").limit(100),
    admin.from("competition_event_phases").select("id,event_id,title,phase_key,max_questions").order("sort").limit(100),
    admin.from("classes").select("id,name,organization_id").order("name").limit(500),
    admin.from("subjects").select("id,name").order("name").limit(300),
    admin.from("curriculum_programmes").select("key,name").order("name").limit(100),
  ]);
  const orgs = (orgRows ?? []) as Org[];
  const events = (eventRows ?? []) as Event[];
  const phases = (phaseRows ?? []) as Phase[];
  const classes = (classRows ?? []) as Class[];
  const subjects = (subjectRows ?? []) as { id: string; name: string }[];
  const curricula = (curriculumRows ?? []) as { key: string; name: string }[];

  const orgId = sp.org || events[0]?.organization_id || orgs[0]?.id || "";
  const eventId = sp.event || events.find((e) => e.organization_id === orgId)?.id || "";
  const phaseId = sp.phase || phases.find((p) => p.event_id === eventId)?.id || "";
  const classId = sp.class || classes.find((c) => c.organization_id === orgId)?.id || "";
  const curriculum = sp.curriculum || "";
  const phase = phases.find((p) => p.id === phaseId) ?? null;

  const { data: facets } = await admin
    .from("questions")
    .select("topic,subtopic,difficulty,type,creation_method")
    .eq("organization_id", orgId)
    .eq("class_id", classId)
    .eq("review_status", "approved")
    .eq("status", "published")
    .limit(1000);
  const facetRows = (facets ?? []) as { topic: string | null; subtopic: string | null; difficulty: string | null; type: string | null; creation_method: string | null }[];
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();
  const difficulties = uniq(facetRows.map((f) => f.difficulty));
  const questionTypes = uniq(facetRows.map((f) => f.type));
  const creationMethods = uniq(facetRows.map((f) => f.creation_method));

  const { data: poolRows } = await admin
    .from("question_pools")
    .select("id,organization_id,event_id,phase_id,class_id,curriculum,title,status,target_count,filters,notes")
    .eq("organization_id", orgId)
    .eq("phase_id", phaseId)
    .eq("class_id", classId)
    .is("curriculum", curriculum || null)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(20);
  const matchingPools = (poolRows ?? []) as unknown as Pool[];
  let pool: Pool | null = null;
  if (sp.pool) {
    const { data } = await admin
      .from("question_pools")
      .select("id,organization_id,event_id,phase_id,class_id,curriculum,title,status,target_count,filters,notes")
      .eq("id", sp.pool)
      .maybeSingle();
    pool = (data ?? null) as unknown as Pool | null;
  }
  pool ??= matchingPools[0] ?? null;

  let eligible: PoolEligibleQuestion[] = [];
  let selectedIds: string[] = [];
  let report: PoolReport = {
    valid: false, selected: 0, eligible: 0, target_count: pool?.target_count ?? phase?.max_questions ?? 20,
    shortfall: pool?.target_count ?? phase?.max_questions ?? 20, insufficient: true, curriculum_counts: {}, errors: [],
  };
  if (pool) {
    const excludeUsed = String(pool.filters?.previous_usage ?? "exclude") !== "include";
    const { data: eligibleRows } = await admin.rpc("question_pool_eligible", { p_pool_id: pool.id, p_exclude_used: excludeUsed });
    const rows = (eligibleRows ?? []) as Omit<PoolEligibleQuestion, "prompt">[];
    const ids = rows.map((r) => r.question_id);
    const { data: questionRows } = ids.length
      ? await admin.from("questions").select("id,prompt").in("id", ids)
      : { data: [] };
    const prompts = new Map(((questionRows ?? []) as { id: string; prompt: string }[]).map((q) => [q.id, q.prompt]));
    eligible = rows.map((r) => ({ ...r, prompt: prompts.get(r.question_id) ?? r.question_id }));

    const { data: itemRows } = await admin
      .from("question_pool_items")
      .select("question_id,position")
      .eq("pool_id", pool.id)
      .order("position");
    selectedIds = ((itemRows ?? []) as { question_id: string }[]).map((i) => i.question_id);
    const { data: validation } = await admin.rpc("question_pool_validate", { p_pool_id: pool.id });
    const v = (validation ?? {}) as Record<string, unknown>;
    report = {
      valid: Boolean(v.valid),
      selected: Number(v.selected ?? selectedIds.length),
      eligible: Number(v.eligible ?? eligible.length),
      target_count: Number(v.target_count ?? pool.target_count),
      shortfall: Number(v.shortfall ?? 0),
      insufficient: Boolean(v.insufficient),
      curriculum_counts: (v.curriculum_counts ?? {}) as Record<string, number>,
      errors: (v.errors ?? []) as string[],
    };
  }

  const filterFields = {
    topic: sp.topic ?? "", subtopic: sp.subtopic ?? "", difficulty: sp.difficulty ?? "",
    question_type: sp.question_type ?? "", creation_method: sp.creation_method ?? "",
    previous_usage: sp.previous_usage ?? "exclude", approval_status: "approved",
  };

  return (
    <>
      <Flash />
      <PageTitle
        eyebrow="Live Competitions · Parameterized Pool Assembly"
        title="Generic question-pool assembly"
        subtitle="Filter approved questions by organization, parent event, phase, class, subject, curriculum, topic, difficulty and type; review, select, generate, replace, shuffle and preview before publishing."
        action={<ButtonLink href={`/admin/questions/new?org=${orgId}&class=${classId}`} variant="gold">+ Generate question</ButtonLink>}
      />
      <Notice ok={sp.ok} e={sp.e} messages={{
        created: "Draft pool created.", existing: "An existing pool for this scope was opened.", duplicate: "A pool already exists for this scope.",
        created_failed: "Could not create the pool.", scope: "Invalid organization / event / phase / class relationship.",
        generated: "Draft pool generated.", selected: "Manual selection saved.", shuffled: "Draft pool shuffled.",
        replaced: "Question replaced.", published: "Published pool attached to the phase-class link.", reopened: "Pool reopened as a draft.",
        publish_failed: "Publishing was rejected: the pool is incomplete, contains an ineligible question, or the Elimination count is still unresolved.",
        draft_only: "Reopen the pool as a draft first.", update_failed: "Could not update pool filters.",
        selection_failed: "Selection rejected by the approved / same-class / curriculum guard.",
      }} />

      <Card className="p-5">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Organization"><Select name="org" defaultValue={orgId}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <Field label="Parent event"><Select name="event" defaultValue={eventId}>{events.filter((e) => e.organization_id === orgId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
          <Field label="Phase"><Select name="phase" defaultValue={phaseId}>{phases.filter((p) => p.event_id === eventId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></Field>
          <Field label="Class"><Select name="class" defaultValue={classId}>{classes.filter((c) => c.organization_id === orgId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Curriculum"><Select name="curriculum" defaultValue={curriculum}><option value="">All class curricula</option>{curricula.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</Select></Field>
          <Field label="Subject"><Select name="subject" defaultValue={sp.subject ?? ""}><option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Topic"><Input name="topic" defaultValue={filterFields.topic} placeholder="Any topic" /></Field>
          <Field label="Subtopic"><Input name="subtopic" defaultValue={filterFields.subtopic} placeholder="Any subtopic" /></Field>
          <Field label="Difficulty"><Select name="difficulty" defaultValue={filterFields.difficulty}><option value="">Any difficulty</option>{difficulties.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
          <Field label="Question type"><Select name="question_type" defaultValue={filterFields.question_type}><option value="">Any type</option>{questionTypes.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
          <Field label="Creation method"><Select name="creation_method" defaultValue={filterFields.creation_method}><option value="">Any method</option>{creationMethods.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
          <Field label="Previous usage"><Select name="previous_usage" defaultValue={filterFields.previous_usage}><option value="exclude">Exclude previously encountered</option><option value="include">Include for review</option></Select></Field>
          <Field label="Approval status"><Select name="approval_status" defaultValue="approved" disabled><option value="approved">Approved only</option></Select></Field>
          <div className="flex items-end"><Button type="submit" variant="outline">Apply filters</Button></div>
        </form>
      </Card>

      {!pool ? (
        <Section title="Create draft pool" hint="Creation never publishes an examination or changes a question count. The owner has deferred the Elimination count decision.">
          <Card className="p-5">
            <form action={createQuestionPool} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="organization_id" value={orgId} />
              <input type="hidden" name="event_id" value={eventId} />
              <input type="hidden" name="phase_id" value={phaseId} />
              <input type="hidden" name="class_id" value={classId} />
              <input type="hidden" name="subject_id" value={sp.subject ?? ""} />
              <input type="hidden" name="curriculum" value={curriculum} />
              <input type="hidden" name="topic" value={filterFields.topic} />
              <input type="hidden" name="subtopic" value={filterFields.subtopic} />
              <input type="hidden" name="difficulty" value={filterFields.difficulty} />
              <input type="hidden" name="question_type" value={filterFields.question_type} />
              <input type="hidden" name="creation_method" value={filterFields.creation_method} />
              <input type="hidden" name="previous_usage" value={filterFields.previous_usage} />
              <input type="hidden" name="approval_status" value="approved" />
              <Field label="Pool title"><Input name="title" defaultValue={`${phase?.title ?? "Phase"} — ${classes.find((c) => c.id === classId)?.name ?? "class"}`} /></Field>
              <Field label="Target questions" hint={`Phase maximum: ${phase?.max_questions ?? 20}`}><Input name="target_count" type="number" min={1} max={100} defaultValue={phase?.max_questions ?? 20} /></Field>
              <Field label="Curriculum quota" hint="Optional, e.g. beninese:10,english:10"><Input name="curriculum_quota" placeholder="Auto from class curricula" /></Field>
              <Field label="Existing approved questions" hint="Eligible for current scope"><Input value={facetRows.length} readOnly /></Field>
              <Field label="Previously used" hint="Excluded from automatic generation when alternatives exist"><Input value={0} readOnly /></Field>
              <div className="flex items-end"><Button type="submit" variant="gold">Create draft pool</Button></div>
            </form>
          </Card>
        </Section>
      ) : (
        <>
          <Section title={pool.title} hint={`${classes.find((c) => c.id === pool.class_id)?.name ?? "Class"} · ${pool.curriculum ?? "all class curricula"} · ${pool.target_count} required`}>
            <Card className="mb-4 p-5">
              <form action={updateQuestionPoolFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="pool_id" value={pool.id} />
                <Field label="Topic"><Input name="topic" defaultValue={String(pool.filters?.topic ?? "")} /></Field>
                <Field label="Subtopic"><Input name="subtopic" defaultValue={String(pool.filters?.subtopic ?? "")} /></Field>
                <Field label="Difficulty"><Select name="difficulty" defaultValue={String(pool.filters?.difficulty ?? "")}><option value="">Any</option>{difficulties.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
                <Field label="Question type"><Select name="question_type" defaultValue={String(pool.filters?.question_type ?? "")}><option value="">Any</option>{questionTypes.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
                <Field label="Creation method"><Select name="creation_method" defaultValue={String(pool.filters?.creation_method ?? "")}><option value="">Any</option>{creationMethods.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
                <Field label="Previous usage"><Select name="previous_usage" defaultValue={String(pool.filters?.previous_usage ?? "exclude")}><option value="exclude">Exclude</option><option value="include">Include for review</option></Select></Field>
                <Field label="Curriculum quota"><Input name="curriculum_quota" defaultValue={Object.entries((pool.filters?.curriculum_quota ?? {}) as Record<string, number>).map(([k, v]) => `${k}:${v}`).join(",")} /></Field>
                <div className="flex items-end"><Button type="submit" variant="outline" disabled={pool.status !== "draft"}>Save filters</Button></div>
              </form>
            </Card>
            <PoolAssemblyClient
              poolId={pool.id}
              status={pool.status}
              targetCount={pool.target_count}
              eligible={eligible}
              selectedIds={selectedIds}
              report={report}
              orgId={pool.organization_id}
              classId={pool.class_id}
            />
          </Section>
          <p className="mt-4 text-xs text-ink-soft">
            <Badge tone="amber">Owner decision</Badge> The Elimination question count remains unresolved (20 / 25 / 5 in guidance). Publishing an Elimination pool is blocked until the owner confirms it; existing examination configurations were not changed.
          </p>
        </>
      )}
    </>
  );
}
