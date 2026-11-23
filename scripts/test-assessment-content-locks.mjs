import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261123203000_immutable_exam_paper_sources.sql", "utf8");
const db = new PGlite();
await db.exec(`
  create table public.quizzes (id uuid primary key, organization_id uuid not null, title text not null, status text not null, settings jsonb not null default '{}'::jsonb);
  create table public.questions (id uuid primary key, organization_id uuid not null, prompt text not null, config jsonb not null default '{}'::jsonb, prompt_doc jsonb not null default '{}'::jsonb, type text not null default 'open_ended', points numeric not null default 1, status text not null default 'draft');
  create table public.question_options (id uuid primary key, question_id uuid not null, label text not null, is_correct boolean not null default false, position integer not null default 0, content_doc jsonb not null default '{}'::jsonb);
  create table public.quiz_questions (id uuid primary key, quiz_id uuid not null, question_id uuid not null, position integer not null, points numeric not null);
  create table public.exams (id uuid primary key, organization_id uuid not null, quiz_id uuid, title text not null);
  create table public.quiz_sessions (id uuid primary key, quiz_id uuid, status text not null default 'lobby');
  create table public.exam_attempts (id uuid primary key, exam_id uuid not null, status text not null, question_order jsonb not null);
  create table public.exam_answers (id uuid primary key, attempt_id uuid not null, question_id uuid not null, answer jsonb not null);

  insert into public.quizzes values
    ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'Legacy exam paper', 'published', '{"randomize_questions":false}'),
    ('10000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'Editable draft', 'draft', '{}'),
    ('10000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', 'Other tenant paper', 'draft', '{}');
  insert into public.questions (id, organization_id, prompt, config, status) values
    ('20000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'x + 2 = 5', '{"graph":"line"}', 'published'),
    ('20000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'Draft prompt', '{}', 'published'),
    ('20000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', 'Other tenant question', '{}', 'published');
  insert into public.question_options (id, question_id, label, is_correct, position) values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'x=3', true, 0);
  insert into public.quiz_questions values
    ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 0, 5),
    ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 0, 2),
    ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 0, 1);
  insert into public.exams values ('50000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Existing exam');
  insert into public.exam_attempts values ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'in_progress', '["40000000-0000-4000-8000-000000000001"]');
  insert into public.exam_answers values ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '{"response":"x=3"}');
`);
await db.exec(migration);

let checks = 0;
async function blocked(name, sql) {
  await assert.rejects(() => db.exec(sql), (error) => /assessment content is immutable|cannot be moved|requires a (published|non-empty)/i.test(error.message), name);
  checks++;
}
async function allowed(name, sql) {
  await db.exec(sql);
  checks++;
}

// Database-level guards reject all paths that could change an already-used
// paper, its membership/order/marks, or the underlying question/answer data.
await blocked("paper metadata edit is rejected", `update quizzes set title='Changed' where id='10000000-0000-4000-8000-000000000001'`);
await blocked("paper publication/status edit is rejected", `update quizzes set status='archived' where id='10000000-0000-4000-8000-000000000001'`);
await blocked("paper deletion is rejected", `delete from quizzes where id='10000000-0000-4000-8000-000000000001'`);
await blocked("paper question marks/order edit is rejected", `update quiz_questions set points=99 where id='40000000-0000-4000-8000-000000000001'`);
await blocked("paper question removal is rejected", `delete from quiz_questions where id='40000000-0000-4000-8000-000000000001'`);
await blocked("paper question insertion is rejected", `insert into quiz_questions values ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',1,1)`);
await blocked("question prompt/config mutation is rejected", `update questions set prompt='mutated' where id='20000000-0000-4000-8000-000000000001'`);
await blocked("question deletion is rejected", `delete from questions where id='20000000-0000-4000-8000-000000000001'`);
await blocked("adding a new answer option is rejected", `insert into question_options (id,question_id,label,is_correct,position) values ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','x=4',false,1)`);
await blocked("answer option mutation is rejected", `update question_options set label='x=4' where id='30000000-0000-4000-8000-000000000001'`);
await blocked("answer option deletion is rejected", `delete from question_options where id='30000000-0000-4000-8000-000000000001'`);
await blocked("an exam cannot be repointed to another paper", `update exams set quiz_id='10000000-0000-4000-8000-000000000002' where id='50000000-0000-4000-8000-000000000001'`);

// New exam rows are revalidated while holding the paper lock, so a stale UI
// check cannot attach an unpublished, empty, or cross-tenant paper.
await blocked("new examinations cannot attach an unpublished draft", `insert into exams values ('50000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Unpublished paper')`);
await db.exec(`insert into quizzes values ('10000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001','Empty published paper','published','{}');
  insert into quiz_questions values ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000003',0,1);`);
await blocked("new examinations cannot attach an empty paper", `insert into exams values ('50000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Empty paper')`);
await blocked("new examinations cannot attach foreign-organization questions", `insert into exams values ('50000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Foreign-content paper')`);

// Reuse is allowed; once attached it also becomes immutable. Existing attempts,
// answers and their stored order must be unchanged by rejected authoring writes.
await allowed("reusing a locked paper for another exam remains allowed", `insert into exams values ('50000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Second exam')`);
await allowed("a live session can attach to the already-locked paper", `insert into quiz_sessions values ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','lobby')`);
await blocked("a live session cannot be repointed to another paper", `update quiz_sessions set quiz_id='10000000-0000-4000-8000-000000000002' where id='80000000-0000-4000-8000-000000000001'`);
await allowed("an isolated tenant can edit its own unrelated question", `update questions set prompt='Tenant B updated question' where id='20000000-0000-4000-8000-000000000003'`);
await allowed("an independent draft can be edited and reordered before attachment", `update quizzes set title='Edited draft', status='published' where id='10000000-0000-4000-8000-000000000002'; update questions set prompt='Edited draft question' where id='20000000-0000-4000-8000-000000000002'; update quiz_questions set points=3, position=1 where id='40000000-0000-4000-8000-000000000002'`);
await allowed("the paper becomes locked atomically when attached to a new exam", `insert into exams values ('50000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Draft now scheduled')`);
await blocked("newly attached draft cannot be changed", `update questions set prompt='late edit' where id='20000000-0000-4000-8000-000000000002'`);

// Isolated database workflow: author a rich question, assemble/edit a draft,
// publish it, attach it to an exam, and verify persisted section/mark/math/graph
// content plus a new attempt's stable question order.
const workflowQuiz = "10000000-0000-4000-8000-000000000005";
const workflowQuestion = "20000000-0000-4000-8000-000000000004";
const workflowOption = "30000000-0000-4000-8000-000000000004";
const workflowLink = "40000000-0000-4000-8000-000000000005";
const workflowExam = "50000000-0000-4000-8000-000000000007";
const richPrompt = { type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text: "Solve the equation." }] },
  { type: "mathBlock", attrs: { latex: "x^2 = 9" } },
  { type: "graphBlock", attrs: { spec: { type: "cartesian", expressions: ["y = x^2"] } } },
  { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "text", text: "x" }] }] }] },
] };
const optionDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "mathInline", attrs: { latex: "x=3" } }] }] };
await db.query(`insert into quizzes values ($1,$2,'New paper','draft',$3)`, [workflowQuiz, "90000000-0000-4000-8000-000000000001", { paper_builder: { version: 1, sections: [] } }]);
await db.query(`insert into questions (id,organization_id,prompt,config,prompt_doc,type,points,status) values ($1,$2,$3,$4,$5,'single_choice',6,'published')`, [workflowQuestion, "90000000-0000-4000-8000-000000000001", "Solve x squared equals nine", {}, richPrompt]);
await db.query(`insert into question_options (id,question_id,label,is_correct,position,content_doc) values ($1,$2,'x=3',true,0,$3)`, [workflowOption, workflowQuestion, optionDoc]);
await db.query(`insert into quiz_questions values ($1,$2,$3,0,6)`, [workflowLink, workflowQuiz, workflowQuestion]);
await db.query(`update quizzes set title='Edited mathematics paper', settings=$2 where id=$1`, [workflowQuiz, { paper_builder: { version: 1, max_marks: 6, instructions: "Show working", sections: [{ id: "sec-a", title: "Section A", question_ids: [workflowQuestion] }] } }]);
await db.query(`update quizzes set status='published' where id=$1`, [workflowQuiz]);
await db.query(`insert into exams values ($1,$2,$3,'Scheduled from published paper')`, [workflowExam, "90000000-0000-4000-8000-000000000001", workflowQuiz]);
await db.query(`insert into exam_attempts values ('60000000-0000-4000-8000-000000000002',$1,'in_progress',$2)`, [workflowExam, [workflowLink]]);
const workflow = await db.query(`select z.title,z.status,z.settings->'paper_builder'->'sections' as sections,z.settings->'paper_builder'->>'instructions' as instructions,qq.points,q.prompt_doc,o.content_doc
  from quizzes z join quiz_questions qq on qq.quiz_id=z.id join questions q on q.id=qq.question_id join question_options o on o.question_id=q.id where z.id=$1`, [workflowQuiz]);
assert.equal(workflow.rows.length, 1);
assert.equal(workflow.rows[0].title, "Edited mathematics paper");
assert.equal(workflow.rows[0].status, "published");
assert.deepEqual(workflow.rows[0].sections, [{ id: "sec-a", title: "Section A", question_ids: [workflowQuestion] }]);
assert.equal(workflow.rows[0].instructions, "Show working");
assert.equal(workflow.rows[0].points, "6");
assert.equal(workflow.rows[0].prompt_doc.content[1].attrs.latex, "x^2 = 9");
assert.equal(workflow.rows[0].prompt_doc.content[2].type, "graphBlock");
assert.equal(workflow.rows[0].content_doc.content[0].content[0].attrs.latex, "x=3");
const selectable = await db.query(`select id from quizzes where id=$1 and organization_id=$2 and status='published'`, [workflowQuiz, "90000000-0000-4000-8000-000000000001"]);
assert.deepEqual(selectable.rows, [{ id: workflowQuiz }]);
const attemptOrder = await db.query(`select question_order from exam_attempts where exam_id=$1`, [workflowExam]);
assert.deepEqual(attemptOrder.rows, [{ question_order: [workflowLink] }]);
checks += 11;
await blocked("published paper question cannot be edited after exam attachment", `update questions set prompt='changed after publish' where id='${workflowQuestion}'`);
await blocked("published paper marks cannot be edited after exam attachment", `update quiz_questions set points=0 where id='${workflowLink}'`);

const unchanged = await db.query(`select e.title, a.status, a.question_order, ea.answer, q.prompt, qq.points, o.label
  from exams e join exam_attempts a on a.exam_id=e.id
  join exam_answers ea on ea.attempt_id=a.id
  join questions q on q.id=ea.question_id
  join quiz_questions qq on qq.quiz_id=e.quiz_id and qq.question_id=q.id
  join question_options o on o.question_id=q.id
 where e.id='50000000-0000-4000-8000-000000000001'`);
assert.deepEqual(unchanged.rows, [{ title: "Existing exam", status: "in_progress", question_order: ["40000000-0000-4000-8000-000000000001"], answer: { response: "x=3" }, prompt: "x + 2 = 5", points: "5", label: "x=3" }]);
checks++;
await db.close();
console.log(`${checks} checks passed (isolated PostgreSQL integration with PGlite; no production connection or data used).`);
