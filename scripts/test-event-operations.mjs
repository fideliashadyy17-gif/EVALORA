/**
 * Static acceptance checks for the Oak event, question-pool, qualification
 * and shared-exam-link work. Complements scripts/test-event-operations.sql,
 * which exercises the database guards transactionally.
 *
 * Run: node scripts/test-event-operations.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join as pathJoin } from "node:path";

const root = process.cwd();
let checks = 0;
const failures = [];

function read(rel) {
  return readFileSync(pathJoin(root, rel), "utf8");
}
function check(name, condition) {
  checks += 1;
  if (condition) console.log(`  ✓ ${name}`);
  else failures.push(name);
}
function exists(rel) {
  return existsSync(pathJoin(root, rel));
}

const OFFICIAL = "Oak International School Mental Math Competition";
const phases = [
  `${OFFICIAL} — Elimination Round`,
  `${OFFICIAL} — Semi-Final`,
  `${OFFICIAL} — Grand Final`,
];

check("operations guide documents official name", read("docs/OAK_EVENT_OPERATIONS.md").includes(OFFICIAL));
for (const phase of phases) check(`operations guide documents ${phase.split(" — ")[1]}`, read("docs/OAK_EVENT_OPERATIONS.md").includes(phase));
check("testing guide records actual outcomes", read("docs/TESTING.md").includes("Transactional pool / qualification / exam-link tests"));

const identity = read("supabase/migrations/0012_official_event_identity.sql");
check("identity migration updates existing event, not a duplicate", !/insert into public\.competition_events/i.test(identity));
check("identity migration records unresolved count", identity.includes("elimination_question_count_status"));
check("identity migration builds exact three phase titles", identity.includes(`${OFFICIAL} — `) && ["Elimination Round", "Semi-Final", "Grand Final"].every((suffix) => identity.includes(`'${suffix}'`)));

// The count decision moved from deferred to confirmed on 2026-11-06 (migration
// 0040). These checks keep the recorded decision, its scope and the two-way
// database proof in place.
const confirmationPath = "supabase/migrations/0040_oak_elimination_count_confirmed.sql";
check("count-confirmation migration exists", exists(confirmationPath));
const confirmation = read(confirmationPath);
check("confirmation records the chosen count (20 per class)", /'elimination_question_count_confirmed',\s*20/.test(confirmation));
check("confirmation records the decision date", confirmation.includes("2026-11-06"));
check("confirmation rejects the 25 and 5-per-class candidates", confirmation.includes("jsonb_build_array(25, 5)"));
check("confirmation is idempotent", confirmation.includes("already confirmed"));
check("confirmation fails loudly when the event is missing", confirmation.includes("raise exception"));
check("confirmation writes an audit row", confirmation.includes("competition.elimination_count_confirmed") && confirmation.includes("public.audit_logs"));
check("confirmation creates or publishes no pool", !/insert into public\.question_pools/i.test(confirmation) && !/status\s*=\s*'published'/i.test(confirmation));
check("confirmation does not retarget the event by id", /where name = 'Oak International School Mental Math Competition'/.test(confirmation));
check("operations guide records the confirmed count", read("docs/OAK_EVENT_OPERATIONS.md").includes("owner confirmed **20 questions per class**"));
const eventSql = read("scripts/test-event-operations.sql");
check("SQL suite proves the count gate blocks while pending", eventSql.includes("B9a pending count still blocks publish"));
check("SQL suite proves the count gate permits once confirmed", eventSql.includes("B9b confirmed count permits publish"));

const pools = read("supabase/migrations/0013_question_pools.sql");
check("pool migration enforces approved/published questions", pools.includes("review_status = 'approved'") && pools.includes("status = 'published'"));
check("pool migration forbids mixed classes", pools.includes("another organization or class"));
check("pool migration tracks usage", pools.includes("question_usage") && pools.includes("trg_exam_answer_usage") && pools.includes("trg_live_answer_usage"));
check("pool migration reports shortfall workflow", pools.includes("Generate additional questions") && pools.includes("shortfall"));

const qual = read("supabase/migrations/0014_phase_qualification_admission.sql");
check("qualification migration creates audited overrides", qual.includes("qualification_overrides") && qual.includes("reason"));
check("admission verifies org/event/phase/class/approval", qual.includes("verify_phase_admission") && qual.includes("approval_status"));
check("qualification RLS is organizer-only", qual.includes("can_create_content") && qual.includes("can_manage_org"));

const links = read("supabase/migrations/0015_exam_shared_links.sql");
check("shared-link migration stores code hash", links.includes("access_code_hash") && links.includes("trg_exam_code_hash"));
check("shared-link migration stores first/last/class", links.includes("first_name") && links.includes("last_name") && links.includes("class_id"));
check("shared-link migration tightens private RLS", links.includes("ec_select") && links.includes("eans_select"));

const recheck = read("supabase/migrations/0018_participant_admission_verified_student.sql");
check("admission recheck uses verified student identity", recheck.includes("students st") && recheck.includes("qualification_token_hash"));
check("admission recheck never trusts display name", !recheck.includes("display_name ="));

check("pool UI exists", exists("src/app/admin/competitions/pools/page.tsx"));
check("pool client supports generate/select/replace/shuffle/preview", ["generateQuestionPoolItems", "saveQuestionPoolSelections", "replaceQuestionPoolItem", "shuffleQuestionPoolItems", "Preview"].every((s) => read("src/app/admin/competitions/pools/PoolAssemblyClient.tsx").includes(s)));
check("qualification review UI exists", exists("src/app/admin/competitions/qualifications/page.tsx"));
check("event monitor UI exists", exists("src/app/admin/competitions/events/page.tsx"));
check("exam invitations UI exists", exists("src/app/admin/examinations/invitations/page.tsx"));
check("exam invitations UI configures attempt policy", read("src/app/admin/examinations/invitations/page.tsx").includes("attempt_policy") && read("src/app/admin/actions/event-operations.ts").includes('settings.attempt_policy'));

const join = read("src/app/api/live/join/route.ts");
check("live join calls server-side phase admission", join.includes("verify_phase_admission"));
check("live join stores only qualification token hash", join.includes("qualification_token_hash") && join.includes("createHash"));
const state = read("src/app/api/live/state/route.ts");
const answer = read("src/app/api/live/answer/route.ts");
check("live state rechecks admission", state.includes("verify_participant_phase_admission"));
check("live answer rechecks admission", answer.includes("verify_participant_phase_admission"));
const play = read("src/app/play/[code]/PlayClient.tsx");
check("participant UI collects qualification token", play.includes("qualificationToken") && play.includes("qualification_token"));

const examLink = read("src/app/api/exam/link-access/route.ts");
check("exam link validates code against server hash", examLink.includes("access_code_hash === sha256(normalizeCode(access_code))"));
check("exam link requires first and last name", examLink.includes("first_name") && examLink.includes("last_name") && examLink.includes("min(1)"));
check("exam link validates eligible class", examLink.includes("eligibleClasses") && examLink.includes("organization_id"));
check("exam link associates only verified student", examLink.includes("students") && examLink.includes("user_id") && !examLink.includes("full_name ="));
check("exam link prevents duplicate/conflicting attempts", examLink.includes("guestKeyHash") && examLink.includes("Duplicate attempts"));
check("exam access routes enforce configured attempt policy", examLink.includes("attemptPolicy") && read("src/app/api/exam/access/route.ts").includes('attemptPolicy !== "read_only_reentry"'));
const examPage = read("src/app/exam/join/[token]/page.tsx");
check("exam link scopes classes to the exam stage", examLink.includes('eq("phase_key", stage)') && examPage.includes('eq("phase_key", stage)'));
check("exam link page uses server-side validation", examPage.includes("createAdminClient") && examPage.includes("shared_link_enabled"));
const joinClient = read("src/app/exam/join/[token]/JoinClient.tsx");
check("candidate page requires first/last name and code", joinClient.includes("First name *") && joinClient.includes("Last name *") && joinClient.includes("access_code"));

const shell = read("src/app/admin/AdminShell.tsx");
check("admin nav links to event/pool/qualification/invitation pages", ["/admin/competitions/events", "/admin/competitions/pools", "/admin/competitions/qualifications", "/admin/examinations/invitations"].every((s) => shell.includes(s)));

check("transactional SQL tests are repeatable", exists("scripts/test-event-operations.sql"));
check("rollback script is provided", exists("supabase/migrations/ROLLBACK_0012_0019.sql"));

const legacy = ["scripts/oak-seed-function.ts", "scripts/oak-seed-bundle.generated.js"];
check("Oak seed scripts no longer contain wrong name", legacy.every((f) => !read(f).toLowerCase().includes("matamat")));
check("no wrong-name literals outside migration replacement SQL", !read("src/app/admin/competitions/events/page.tsx").toLowerCase().includes("matamat"));

if (failures.length) {
  console.error(`\n${failures.length} of ${checks} checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`\nAll ${checks} event-operations static checks passed.\n`);
