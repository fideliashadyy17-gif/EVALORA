-- AP Examination — AP Calculus AB/BC, Limits Practice Exam (Oak International School)
--
-- Source document: "AP Calculus ABBC.pdf" — Limits Practice Exam, Student Edition,
-- 17 pages, fifty multiple-choice questions (1–30 Part A no calculator, 31–50
-- Part B calculator permitted; 45–50 BC only). The student edition prints no answer
-- key and no marks per item.
--
-- Fidelity rules applied:
--   * every stem and option is transcribed from the page images, not from the text
--     layer (the text layer drops superscripts and signs, e.g. 3^x in item 38);
--   * the sixteen figures and printed tables (items 1–7, 21, 23, 26, 29, 31, 34–36, 45)
--     are cropped from their own pages at 200 dpi into public/exam-figures/ap-limits/;
--   * the answer key is DERIVED by hand (no key is printed) and checked on the page
--     images; it is stored in config.answer_key with answer_key_status set accordingly;
--   * each item is worth 1 mark: the PDF prints no marks, so this is a default that
--     the owner must confirm;
--   * no explanation text is written: the PDF contains none;
--   * question order and option order stay fixed, A–D as printed.
--
-- Safety: this migration only INSERTs new rows (one quiz, 50 questions, 200 options,
-- 50 quiz links, one draft examination). It does not update or delete any existing
-- row, so the examinations already open (Summative Assessment — Grade 7, 9 and 10) and
-- their attempts are untouched. The examination is created as 'draft' and is not
-- visible to candidates until an owner publishes it.
--
-- Idempotent: an existing examination with this title in this organization stops the block.
-- Atomic: any failed check raises an exception and rolls the whole migration back.
do $body$
declare
  v_org uuid := '0a400000-0000-4000-8000-000000000001';
  v_quiz uuid;
  v_exam uuid;
  v_n int;
  v_o int;
  v_c int;
  v_qq int;
begin
  if exists (select 1 from public.exams where organization_id = v_org and title = 'AP Examination') then
    raise notice 'AP Examination already exists, nothing to do.';
    return;
  end if;

  insert into public.quizzes (organization_id, title, description, status, settings)
  values (
    v_org,
    $zq$AP Examination$zq$,
    $zq$AP Calculus AB/BC — Limits Practice Exam. Fifty multiple-choice questions on limits: one-sided and two-sided limits, algebraic evaluation, special trigonometric limits, infinite limits, limits at infinity, indeterminate forms; questions 45–50 are BC only.$zq$,
    'published',
    $zj${"randomize_questions":false,"randomize_options":false}$zj$::jsonb
  )
  returning id into v_quiz;

  -- Question 1
with q_1 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The table below gives selected values of a function $f$ that is defined for all real numbers, with $f(2)=3$.
Based on the table, which of the following statements is true?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The table below gives selected values of a function "},{"type":"mathInline","attrs":{"latex":"f"}},{"type":"text","text":" that is defined for all real numbers, with "},{"type":"mathInline","attrs":{"latex":"f(2)=3"}},{"type":"text","text":"."}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q01.png","alt":"Figure for question 1","width":60}},{"type":"paragraph","content":[{"type":"text","text":"Based on the table, which of the following statements is true?"}]}]}$zj$::jsonb, null, 1, 'easy',
          $zq$Limits from Graphs and Tables$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":1,"part":"A","chapter":"Limits from Graphs and Tables","printed_level":"easy","bc_only":false,"figure":"/exam-figures/ap-limits/q01.png","answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_1.id, v.label, v.ok, v.pos
  from q_1, (values
    ($zq$$\lim_{x\to 2} f(x)=5$, and $f(2)=3$.$zq$, true, 1),
    ($zq$$\lim_{x\to 2} f(x)=3$, because $f(2)=3$.$zq$, false, 2),
    ($zq$$\lim_{x\to 2} f(x)$ does not exist, because $f(2)\neq 5$.$zq$, false, 3),
    ($zq$$\lim_{x\to 2} f(x)=5$, and therefore $f(2)=5$.$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 2
with q_2 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The graph of a function $f$ is shown in the figure. What is $\lim_{x\to 1} f(x)$?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The graph of a function "},{"type":"mathInline","attrs":{"latex":"f"}},{"type":"text","text":" is shown in the figure. What is "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 1} f(x)"}},{"type":"text","text":"?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q02.png","alt":"Figure for question 2","width":60}}]}$zj$::jsonb, null, 1, 'easy',
          $zq$Limits from Graphs and Tables$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":2,"part":"A","chapter":"Limits from Graphs and Tables","printed_level":"easy","bc_only":false,"figure":"/exam-figures/ap-limits/q02.png","answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_2.id, v.label, v.ok, v.pos
  from q_2, (values
    ($zq$1$zq$, false, 1),
    ($zq$2$zq$, false, 2),
    ($zq$4$zq$, false, 3),
    ($zq$does not exist$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 3
with q_3 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The graph of a function $g$ is shown in the figure. Which of the following statements about $x = 2$ must be true?
I. $\lim_{x\to 2} g(x)=4$
II. $g(2)=4$
III. $\lim_{x\to 2^-} g(x)=\lim_{x\to 2^+} g(x)$$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The graph of a function "},{"type":"mathInline","attrs":{"latex":"g"}},{"type":"text","text":" is shown in the figure. Which of the following statements about "},{"type":"mathInline","attrs":{"latex":"x = 2"}},{"type":"text","text":" must be true?"}]},{"type":"paragraph","content":[{"type":"text","text":"I. "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 2} g(x)=4"}}]},{"type":"paragraph","content":[{"type":"text","text":"II. "},{"type":"mathInline","attrs":{"latex":"g(2)=4"}}]},{"type":"paragraph","content":[{"type":"text","text":"III. "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 2^-} g(x)=\\lim_{x\\to 2^+} g(x)"}}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q03.png","alt":"Figure for question 3","width":60}}]}$zj$::jsonb, null, 1, 'medium',
          $zq$Limits from Graphs and Tables$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":3,"part":"A","chapter":"Limits from Graphs and Tables","printed_level":"medium","bc_only":false,"figure":"/exam-figures/ap-limits/q03.png","answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_3.id, v.label, v.ok, v.pos
  from q_3, (values
    ($zq$I only$zq$, false, 1),
    ($zq$I and II only$zq$, false, 2),
    ($zq$I, II, and III$zq$, false, 3),
    ($zq$I and III only$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 4
with q_4 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The graph of a function $h$ is shown in the figure. Which of the following statements is true?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The graph of a function "},{"type":"mathInline","attrs":{"latex":"h"}},{"type":"text","text":" is shown in the figure. Which of the following statements is true?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q04.png","alt":"Figure for question 4","width":60}}]}$zj$::jsonb, null, 1, 'medium',
          $zq$Limits from Graphs and Tables$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":4,"part":"A","chapter":"Limits from Graphs and Tables","printed_level":"medium","bc_only":false,"figure":"/exam-figures/ap-limits/q04.png","answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_4.id, v.label, v.ok, v.pos
  from q_4, (values
    ($zq$$\lim_{x\to 2^-} h(x)=-\infty$ and $\lim_{x\to 2^+} h(x)=\infty$$zq$, true, 1),
    ($zq$$\lim_{x\to 2} h(x)=\infty$$zq$, false, 2),
    ($zq$$\lim_{x\to 2} h(x)=0$$zq$, false, 3),
    ($zq$$\lim_{x\to 2} h(x)=-\infty$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 5
with q_5 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The table below gives values of $f(x)=\sin\left(\frac{\pi}{x}\right)$ at selected values of $x$ near $0$.
Which of the following statements is correct?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The table below gives values of "},{"type":"mathInline","attrs":{"latex":"f(x)=\\sin\\left(\\frac{\\pi}{x}\\right)"}},{"type":"text","text":" at selected values of "},{"type":"mathInline","attrs":{"latex":"x"}},{"type":"text","text":" near "},{"type":"mathInline","attrs":{"latex":"0"}},{"type":"text","text":"."}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q05.png","alt":"Figure for question 5","width":60}},{"type":"paragraph","content":[{"type":"text","text":"Which of the following statements is correct?"}]}]}$zj$::jsonb, null, 1, 'hard',
          $zq$Limits from Graphs and Tables$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":5,"part":"A","chapter":"Limits from Graphs and Tables","printed_level":"hard","bc_only":false,"figure":"/exam-figures/ap-limits/q05.png","answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_5.id, v.label, v.ok, v.pos
  from q_5, (values
    ($zq$$\lim_{x\to 0} f(x)=0$, because $f(x)=0$ at every value of $x$ listed in the table.$zq$, false, 1),
    ($zq$$\lim_{x\to 0} f(x)$ does not exist, because on every interval that contains $x=0$, the function takes both the value $1$ and the value $-1$.$zq$, true, 2),
    ($zq$$\lim_{x\to 0} f(x)=0$, because $-1\le f(x)\le 1$ for all $x\neq 0$.$zq$, false, 3),
    ($zq$$\lim_{x\to 0} f(x)=1$, because $\sin\theta$ attains the value $1$ for arbitrarily large $\theta$.$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 6
with q_6 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The graph of a function $F$ is shown in the figure. Which of the following limits exist?
I. $\lim_{x\to -1} F(x)$
II. $\lim_{x\to 2} F(x)$
III. $\lim_{x\to 4} F(x)$$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The graph of a function "},{"type":"mathInline","attrs":{"latex":"F"}},{"type":"text","text":" is shown in the figure. Which of the following limits exist?"}]},{"type":"paragraph","content":[{"type":"text","text":"I. "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to -1} F(x)"}}]},{"type":"paragraph","content":[{"type":"text","text":"II. "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 2} F(x)"}}]},{"type":"paragraph","content":[{"type":"text","text":"III. "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 4} F(x)"}}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q06.png","alt":"Figure for question 6","width":60}}]}$zj$::jsonb, null, 1, 'hard',
          $zq$Limits from Graphs and Tables$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":6,"part":"A","chapter":"Limits from Graphs and Tables","printed_level":"hard","bc_only":false,"figure":"/exam-figures/ap-limits/q06.png","answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_6.id, v.label, v.ok, v.pos
  from q_6, (values
    ($zq$I only$zq$, false, 1),
    ($zq$III only$zq$, false, 2),
    ($zq$I and II only$zq$, false, 3),
    ($zq$II only$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 7
with q_7 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The graphs of the functions $f$ and $g$ are shown in the figure. What is $\lim_{x\to 1} f\big(g(x)\big)$?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The graphs of the functions "},{"type":"mathInline","attrs":{"latex":"f"}},{"type":"text","text":" and "},{"type":"mathInline","attrs":{"latex":"g"}},{"type":"text","text":" are shown in the figure. What is "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 1} f\\big(g(x)\\big)"}},{"type":"text","text":"?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q07.png","alt":"Figure for question 7","width":90}}]}$zj$::jsonb, null, 1, 'hard',
          $zq$Limits from Graphs and Tables$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":7,"part":"A","chapter":"Limits from Graphs and Tables","printed_level":"hard","bc_only":false,"figure":"/exam-figures/ap-limits/q07.png","answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_7.id, v.label, v.ok, v.pos
  from q_7, (values
    ($zq$does not exist$zq$, false, 1),
    ($zq$1$zq$, false, 2),
    ($zq$2$zq$, false, 3),
    ($zq$3$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 8
with q_8 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 3}\dfrac{x^2-9}{x-3}=$$zq$, null, null, 1, 'easy',
          $zq$Algebraic Evaluation of Limits$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":8,"part":"A","chapter":"Algebraic Evaluation of Limits","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_8.id, v.label, v.ok, v.pos
  from q_8, (values
    ($zq$does not exist$zq$, false, 1),
    ($zq$0$zq$, false, 2),
    ($zq$1$zq$, false, 3),
    ($zq$6$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 9
with q_9 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 2}\dfrac{x^2-4}{x^2-5x+6}=$$zq$, null, null, 1, 'easy',
          $zq$Algebraic Evaluation of Limits$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":9,"part":"A","chapter":"Algebraic Evaluation of Limits","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_9.id, v.label, v.ok, v.pos
  from q_9, (values
    ($zq$$-4$$zq$, true, 1),
    ($zq$0$zq$, false, 2),
    ($zq$1$zq$, false, 3),
    ($zq$4$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 10
with q_10 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\dfrac{\dfrac{1}{x+3}-\dfrac{1}{3}}{x}=$$zq$, null, null, 1, 'easy',
          $zq$Algebraic Evaluation of Limits$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":10,"part":"A","chapter":"Algebraic Evaluation of Limits","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_10.id, v.label, v.ok, v.pos
  from q_10, (values
    ($zq$$-\frac{1}{3}$$zq$, false, 1),
    ($zq$$-\frac{1}{9}$$zq$, true, 2),
    ($zq$0$zq$, false, 3),
    ($zq$$\frac{1}{9}$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 11
with q_11 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\dfrac{\sqrt{x+4}-2}{x}=$$zq$, null, null, 1, 'easy',
          $zq$Algebraic Evaluation of Limits$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":11,"part":"A","chapter":"Algebraic Evaluation of Limits","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_11.id, v.label, v.ok, v.pos
  from q_11, (values
    ($zq$0$zq$, false, 1),
    ($zq$$\frac{1}{4}$$zq$, true, 2),
    ($zq$$\frac{1}{2}$$zq$, false, 3),
    ($zq$1$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 12
with q_12 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Let $f$ be the function defined by $f(x)=\begin{cases}\dfrac{2x^2-x-1}{x-1}, & x\neq 1,\\[1ex] 5, & x=1.\end{cases}$
What is $\lim_{x\to 1} f(x)$?$zq$, null, null, 1, 'medium',
          $zq$Algebraic Evaluation of Limits$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":12,"part":"A","chapter":"Algebraic Evaluation of Limits","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_12.id, v.label, v.ok, v.pos
  from q_12, (values
    ($zq$0$zq$, false, 1),
    ($zq$3$zq$, true, 2),
    ($zq$5$zq$, false, 3),
    ($zq$does not exist$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 13
with q_13 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to -2}\dfrac{x^3+8}{x^2-4}=$$zq$, null, null, 1, 'medium',
          $zq$Algebraic Evaluation of Limits$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":13,"part":"A","chapter":"Algebraic Evaluation of Limits","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_13.id, v.label, v.ok, v.pos
  from q_13, (values
    ($zq$$-3$$zq$, true, 1),
    ($zq$0$zq$, false, 2),
    ($zq$3$zq$, false, 3),
    ($zq$12$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 14
with q_14 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 7}\dfrac{\sqrt{x+2}-3}{x-7}=$$zq$, null, null, 1, 'medium',
          $zq$Algebraic Evaluation of Limits$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":14,"part":"A","chapter":"Algebraic Evaluation of Limits","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_14.id, v.label, v.ok, v.pos
  from q_14, (values
    ($zq$$\frac{1}{6}$$zq$, true, 1),
    ($zq$$\frac{1}{3}$$zq$, false, 2),
    ($zq$3$zq$, false, 3),
    ($zq$6$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 15
with q_15 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 4}\dfrac{\dfrac{1}{\sqrt{x}}-\dfrac{1}{2}}{x-4}=$$zq$, null, null, 1, 'hard',
          $zq$Algebraic Evaluation of Limits$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":15,"part":"A","chapter":"Algebraic Evaluation of Limits","printed_level":"hard","bc_only":false,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_15.id, v.label, v.ok, v.pos
  from q_15, (values
    ($zq$$-\frac{1}{4}$$zq$, false, 1),
    ($zq$$-\frac{1}{8}$$zq$, false, 2),
    ($zq$$-\frac{1}{16}$$zq$, true, 3),
    ($zq$$\frac{1}{16}$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 16
with q_16 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\dfrac{\sin 5x}{x}=$$zq$, null, null, 1, 'easy',
          $zq$Special Trigonometric Limits and the Squeeze Theorem$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":16,"part":"A","chapter":"Special Trigonometric Limits and the Squeeze Theorem","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_16.id, v.label, v.ok, v.pos
  from q_16, (values
    ($zq$0$zq$, false, 1),
    ($zq$1$zq$, false, 2),
    ($zq$5$zq$, true, 3),
    ($zq$does not exist$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 17
with q_17 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\dfrac{1-\cos x}{x}=$$zq$, null, null, 1, 'easy',
          $zq$Special Trigonometric Limits and the Squeeze Theorem$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":17,"part":"A","chapter":"Special Trigonometric Limits and the Squeeze Theorem","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_17.id, v.label, v.ok, v.pos
  from q_17, (values
    ($zq$does not exist$zq$, false, 1),
    ($zq$0$zq$, true, 2),
    ($zq$$\frac{1}{2}$$zq$, false, 3),
    ($zq$1$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 18
with q_18 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\dfrac{1-\cos x}{x^2}=$$zq$, null, null, 1, 'medium',
          $zq$Special Trigonometric Limits and the Squeeze Theorem$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":18,"part":"A","chapter":"Special Trigonometric Limits and the Squeeze Theorem","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_18.id, v.label, v.ok, v.pos
  from q_18, (values
    ($zq$0$zq$, false, 1),
    ($zq$$\frac{1}{4}$$zq$, false, 2),
    ($zq$$\frac{1}{2}$$zq$, true, 3),
    ($zq$1$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 19
with q_19 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The displacement, in centimeters, of an oscillating bar at time $t$ seconds is modeled by
$$d(t)=\frac{\sin(3t)\,\sin(5t)}{t^2}, \qquad t\neq 0.$$
What is $\lim_{t\to 0} d(t)$?$zq$, null, null, 1, 'medium',
          $zq$Special Trigonometric Limits and the Squeeze Theorem$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":19,"part":"A","chapter":"Special Trigonometric Limits and the Squeeze Theorem","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_19.id, v.label, v.ok, v.pos
  from q_19, (values
    ($zq$1$zq$, false, 1),
    ($zq$3$zq$, false, 2),
    ($zq$5$zq$, false, 3),
    ($zq$15$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 20
with q_20 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\dfrac{\sin 4x}{\sin 7x}=$$zq$, null, null, 1, 'medium',
          $zq$Special Trigonometric Limits and the Squeeze Theorem$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":20,"part":"A","chapter":"Special Trigonometric Limits and the Squeeze Theorem","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_20.id, v.label, v.ok, v.pos
  from q_20, (values
    ($zq$0$zq$, false, 1),
    ($zq$$\frac{4}{7}$$zq$, true, 2),
    ($zq$1$zq$, false, 3),
    ($zq$$\frac{7}{4}$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 21
with q_21 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$A sensor records a temperature $T(x)$, in degrees Celsius, and for every $x\neq 0$ the reading satisfies
$$2-\frac{x^2}{2}\le T(x)\le 2+\frac{x^2}{2}.$$
The graphs of the three functions are shown in the figure. Which of the following statements must be true?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A sensor records a temperature "},{"type":"mathInline","attrs":{"latex":"T(x)"}},{"type":"text","text":", in degrees Celsius, and for every "},{"type":"mathInline","attrs":{"latex":"x\\neq 0"}},{"type":"text","text":" the reading satisfies"}]},{"type":"mathBlock","attrs":{"latex":"2-\\frac{x^2}{2}\\le T(x)\\le 2+\\frac{x^2}{2}."}},{"type":"paragraph","content":[{"type":"text","text":"The graphs of the three functions are shown in the figure. Which of the following statements must be true?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q21.png","alt":"Figure for question 21","width":60}}]}$zj$::jsonb, null, 1, 'hard',
          $zq$Special Trigonometric Limits and the Squeeze Theorem$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":21,"part":"A","chapter":"Special Trigonometric Limits and the Squeeze Theorem","printed_level":"hard","bc_only":false,"figure":"/exam-figures/ap-limits/q21.png","answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_21.id, v.label, v.ok, v.pos
  from q_21, (values
    ($zq$$\lim_{x\to 0} T(x)$ does not exist, because $T(x)$ oscillates between the two parabolas.$zq$, false, 1),
    ($zq$$\lim_{x\to 0} T(x)=1$$zq$, false, 2),
    ($zq$$\lim_{x\to 0} T(x)=2$ only if $T$ is continuous at $x=0$.$zq$, false, 3),
    ($zq$$\lim_{x\to 0} T(x)=2$$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 22
with q_22 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 3^-}\dfrac{x-3}{|x-3|}=$$zq$, null, null, 1, 'easy',
          $zq$Absolute Value, Piecewise Functions, and One-Sided Analysis$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":22,"part":"A","chapter":"Absolute Value, Piecewise Functions, and One-Sided Analysis","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_22.id, v.label, v.ok, v.pos
  from q_22, (values
    ($zq$$-1$$zq$, true, 1),
    ($zq$0$zq$, false, 2),
    ($zq$1$zq$, false, 3),
    ($zq$does not exist$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 23
with q_23 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The graph of a function $C$ gives the cost, in dollars, of parking a car for $t$ hours, where $0<t\le 4$. The graph of $C$ is shown in the figure. Which of the following statements is true?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The graph of a function "},{"type":"mathInline","attrs":{"latex":"C"}},{"type":"text","text":" gives the cost, in dollars, of parking a car for "},{"type":"mathInline","attrs":{"latex":"t"}},{"type":"text","text":" hours, where "},{"type":"mathInline","attrs":{"latex":"0<t\\le 4"}},{"type":"text","text":". The graph of "},{"type":"mathInline","attrs":{"latex":"C"}},{"type":"text","text":" is shown in the figure. Which of the following statements is true?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q23.png","alt":"Figure for question 23","width":65}}]}$zj$::jsonb, null, 1, 'medium',
          $zq$Absolute Value, Piecewise Functions, and One-Sided Analysis$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":23,"part":"A","chapter":"Absolute Value, Piecewise Functions, and One-Sided Analysis","printed_level":"medium","bc_only":false,"figure":"/exam-figures/ap-limits/q23.png","answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_23.id, v.label, v.ok, v.pos
  from q_23, (values
    ($zq$$\lim_{t\to 1} C(t)=3$$zq$, false, 1),
    ($zq$$\lim_{t\to 1} C(t)=6$$zq$, false, 2),
    ($zq$$\lim_{t\to 1^-} C(t)\neq \lim_{t\to 1^+} C(t)$, so $\lim_{t\to 1} C(t)$ does not exist.$zq$, true, 3),
    ($zq$$\lim_{t\to 1} C(t)=C(1)$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 24
with q_24 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Let $k$ be a constant and let $f(x)=\begin{cases}kx+1, & x<2,\\ x^2-k, & x\ge 2.\end{cases}$
For what value of $k$ does $\lim_{x\to 2} f(x)$ exist?$zq$, null, null, 1, 'medium',
          $zq$Absolute Value, Piecewise Functions, and One-Sided Analysis$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":24,"part":"A","chapter":"Absolute Value, Piecewise Functions, and One-Sided Analysis","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_24.id, v.label, v.ok, v.pos
  from q_24, (values
    ($zq$$-1$$zq$, false, 1),
    ($zq$$\frac{1}{3}$$zq$, false, 2),
    ($zq$1$zq$, true, 3),
    ($zq$2$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 25
with q_25 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Let $f$ be the function defined by $f(x)=\dfrac{|x^2-4|}{x-2}$ for $x\neq 2$. What is $\lim_{x\to 2} f(x)$?$zq$, null, null, 1, 'hard',
          $zq$Absolute Value, Piecewise Functions, and One-Sided Analysis$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":25,"part":"A","chapter":"Absolute Value, Piecewise Functions, and One-Sided Analysis","printed_level":"hard","bc_only":false,"figure":null,"answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_25.id, v.label, v.ok, v.pos
  from q_25, (values
    ($zq$$-4$$zq$, false, 1),
    ($zq$0$zq$, false, 2),
    ($zq$4$zq$, false, 3),
    ($zq$does not exist$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 26
with q_26 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The graph of $f(x)=\dfrac{|x+2|+|x-2|-4}{x}$ is shown in the figure. What is $\lim_{x\to 0} f(x)$?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The graph of "},{"type":"mathInline","attrs":{"latex":"f(x)=\\dfrac{|x+2|+|x-2|-4}{x}"}},{"type":"text","text":" is shown in the figure. What is "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 0} f(x)"}},{"type":"text","text":"?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q26.png","alt":"Figure for question 26","width":65}}]}$zj$::jsonb, null, 1, 'hard',
          $zq$Absolute Value, Piecewise Functions, and One-Sided Analysis$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":26,"part":"A","chapter":"Absolute Value, Piecewise Functions, and One-Sided Analysis","printed_level":"hard","bc_only":false,"figure":"/exam-figures/ap-limits/q26.png","answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_26.id, v.label, v.ok, v.pos
  from q_26, (values
    ($zq$$-2$$zq$, false, 1),
    ($zq$0$zq$, true, 2),
    ($zq$2$zq$, false, 3),
    ($zq$does not exist$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 27
with q_27 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 2^+}\dfrac{1}{x-2}=$$zq$, null, null, 1, 'easy',
          $zq$Infinite Limits and Vertical Asymptotes$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":27,"part":"A","chapter":"Infinite Limits and Vertical Asymptotes","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_27.id, v.label, v.ok, v.pos
  from q_27, (values
    ($zq$$-\infty$$zq$, false, 1),
    ($zq$0$zq$, false, 2),
    ($zq$2$zq$, false, 3),
    ($zq$$\infty$$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 28
with q_28 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 1^-}\dfrac{x+2}{x-1}=$$zq$, null, null, 1, 'easy',
          $zq$Infinite Limits and Vertical Asymptotes$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":28,"part":"A","chapter":"Infinite Limits and Vertical Asymptotes","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_28.id, v.label, v.ok, v.pos
  from q_28, (values
    ($zq$$-\infty$$zq$, true, 1),
    ($zq$$-3$$zq$, false, 2),
    ($zq$3$zq$, false, 3),
    ($zq$$\infty$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 29
with q_29 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The graph of a function $h$ has a vertical asymptote at $x=3$, with $\lim_{x\to 3^-} h(x)=-\infty$ and $\lim_{x\to 3^+} h(x)=\infty$, as shown in the figure. Which of the following could be the rule for $h$?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The graph of a function "},{"type":"mathInline","attrs":{"latex":"h"}},{"type":"text","text":" has a vertical asymptote at "},{"type":"mathInline","attrs":{"latex":"x=3"}},{"type":"text","text":", with "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 3^-} h(x)=-\\infty"}},{"type":"text","text":" and "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 3^+} h(x)=\\infty"}},{"type":"text","text":", as shown in the figure. Which of the following could be the rule for "},{"type":"mathInline","attrs":{"latex":"h"}},{"type":"text","text":"?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q29.png","alt":"Figure for question 29","width":60}}]}$zj$::jsonb, null, 1, 'medium',
          $zq$Infinite Limits and Vertical Asymptotes$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":29,"part":"A","chapter":"Infinite Limits and Vertical Asymptotes","printed_level":"medium","bc_only":false,"figure":"/exam-figures/ap-limits/q29.png","answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_29.id, v.label, v.ok, v.pos
  from q_29, (values
    ($zq$$h(x)=-\dfrac{1}{(x-3)^2}$$zq$, false, 1),
    ($zq$$h(x)=-\dfrac{1}{x-3}$$zq$, false, 2),
    ($zq$$h(x)=\dfrac{1}{(x-3)^2}$$zq$, false, 3),
    ($zq$$h(x)=\dfrac{1}{x-3}$$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 30
with q_30 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to \frac{\pi}{2}^-}\tan x=$$zq$, null, null, 1, 'medium',
          $zq$Infinite Limits and Vertical Asymptotes$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":30,"part":"A","chapter":"Infinite Limits and Vertical Asymptotes","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_30.id, v.label, v.ok, v.pos
  from q_30, (values
    ($zq$$-\infty$$zq$, false, 1),
    ($zq$0$zq$, false, 2),
    ($zq$1$zq$, false, 3),
    ($zq$$\infty$$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 31
with q_31 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The table below gives values of $f(x)=\dfrac{x-4}{\sqrt{x^2-16}}$ for values of $x$ greater than $4$.
What is $\lim_{x\to 4^+} f(x)=?$$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The table below gives values of "},{"type":"mathInline","attrs":{"latex":"f(x)=\\dfrac{x-4}{\\sqrt{x^2-16}}"}},{"type":"text","text":" for values of "},{"type":"mathInline","attrs":{"latex":"x"}},{"type":"text","text":" greater than "},{"type":"mathInline","attrs":{"latex":"4"}},{"type":"text","text":"."}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q31.png","alt":"Figure for question 31","width":60}},{"type":"paragraph","content":[{"type":"text","text":"What is "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to 4^+} f(x)=?"}}]}]}$zj$::jsonb, null, 1, 'hard',
          $zq$Infinite Limits and Vertical Asymptotes$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":31,"part":"B","chapter":"Infinite Limits and Vertical Asymptotes","printed_level":"hard","bc_only":false,"figure":"/exam-figures/ap-limits/q31.png","answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_31.id, v.label, v.ok, v.pos
  from q_31, (values
    ($zq$0$zq$, true, 1),
    ($zq$1$zq$, false, 2),
    ($zq$4$zq$, false, 3),
    ($zq$$\infty$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 32
with q_32 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to \infty}\dfrac{3x^2-5x+2}{2x^2+7}=$$zq$, null, null, 1, 'easy',
          $zq$Limits at Infinity, Horizontal Asymptotes, and Growth Rates$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":32,"part":"B","chapter":"Limits at Infinity, Horizontal Asymptotes, and Growth Rates","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_32.id, v.label, v.ok, v.pos
  from q_32, (values
    ($zq$0$zq$, false, 1),
    ($zq$$\frac{3}{2}$$zq$, true, 2),
    ($zq$$\frac{5}{2}$$zq$, false, 3),
    ($zq$$\infty$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 33
with q_33 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$A company models the average cost, in dollars per unit, of producing $x$ units of a product by
$$A(x)=\frac{4800+3x}{x}, \qquad x\ge 1.$$
What is $\lim_{x\to \infty} A(x)$?$zq$, null, null, 1, 'easy',
          $zq$Limits at Infinity, Horizontal Asymptotes, and Growth Rates$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":33,"part":"B","chapter":"Limits at Infinity, Horizontal Asymptotes, and Growth Rates","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_33.id, v.label, v.ok, v.pos
  from q_33, (values
    ($zq$0$zq$, false, 1),
    ($zq$3$zq$, true, 2),
    ($zq$4800$zq$, false, 3),
    ($zq$$\infty$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 34
with q_34 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Let $f(x)=\dfrac{\sqrt{4x^2+1}}{x+3}$. The graph of $f$ is shown in the figure, together with its horizontal asymptote. What is $\lim_{x\to -\infty} f(x)$?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Let "},{"type":"mathInline","attrs":{"latex":"f(x)=\\dfrac{\\sqrt{4x^2+1}}{x+3}"}},{"type":"text","text":". The graph of "},{"type":"mathInline","attrs":{"latex":"f"}},{"type":"text","text":" is shown in the figure, together with its horizontal asymptote. What is "},{"type":"mathInline","attrs":{"latex":"\\lim_{x\\to -\\infty} f(x)"}},{"type":"text","text":"?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q34.png","alt":"Figure for question 34","width":65}}]}$zj$::jsonb, null, 1, 'medium',
          $zq$Limits at Infinity, Horizontal Asymptotes, and Growth Rates$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":34,"part":"B","chapter":"Limits at Infinity, Horizontal Asymptotes, and Growth Rates","printed_level":"medium","bc_only":false,"figure":"/exam-figures/ap-limits/q34.png","answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_34.id, v.label, v.ok, v.pos
  from q_34, (values
    ($zq$$-2$$zq$, true, 1),
    ($zq$$-\frac{1}{2}$$zq$, false, 2),
    ($zq$$\frac{1}{2}$$zq$, false, 3),
    ($zq$2$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 35
with q_35 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The population of a culture of bacteria after $t$ hours is modeled by
$$P(t)=\frac{5000}{1+4e^{-0.2t}}, \qquad t\ge 0.$$
Selected values of $P(t)$ are given in the table.
What is $\lim_{t\to\infty} P(t)$?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The population of a culture of bacteria after "},{"type":"mathInline","attrs":{"latex":"t"}},{"type":"text","text":" hours is modeled by"}]},{"type":"mathBlock","attrs":{"latex":"P(t)=\\frac{5000}{1+4e^{-0.2t}}, \\qquad t\\ge 0."}},{"type":"paragraph","content":[{"type":"text","text":"Selected values of "},{"type":"mathInline","attrs":{"latex":"P(t)"}},{"type":"text","text":" are given in the table."}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q35.png","alt":"Figure for question 35","width":60}},{"type":"paragraph","content":[{"type":"text","text":"What is "},{"type":"mathInline","attrs":{"latex":"\\lim_{t\\to\\infty} P(t)"}},{"type":"text","text":"?"}]}]}$zj$::jsonb, null, 1, 'medium',
          $zq$Limits at Infinity, Horizontal Asymptotes, and Growth Rates$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":35,"part":"B","chapter":"Limits at Infinity, Horizontal Asymptotes, and Growth Rates","printed_level":"medium","bc_only":false,"figure":"/exam-figures/ap-limits/q35.png","answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_35.id, v.label, v.ok, v.pos
  from q_35, (values
    ($zq$0$zq$, false, 1),
    ($zq$1000$zq$, false, 2),
    ($zq$5000$zq$, true, 3),
    ($zq$$\infty$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 36
with q_36 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$An object moves along a line. Its velocity, in meters per second, is
$$v(t)=\frac{\ln t}{\sqrt{t}}, \qquad t\ge 1.$$
The graph of $v$ is shown in the figure. What is $\lim_{t\to\infty} v(t)$?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"An object moves along a line. Its velocity, in meters per second, is"}]},{"type":"mathBlock","attrs":{"latex":"v(t)=\\frac{\\ln t}{\\sqrt{t}}, \\qquad t\\ge 1."}},{"type":"paragraph","content":[{"type":"text","text":"The graph of "},{"type":"mathInline","attrs":{"latex":"v"}},{"type":"text","text":" is shown in the figure. What is "},{"type":"mathInline","attrs":{"latex":"\\lim_{t\\to\\infty} v(t)"}},{"type":"text","text":"?"}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q36.png","alt":"Figure for question 36","width":65}}]}$zj$::jsonb, null, 1, 'medium',
          $zq$Limits at Infinity, Horizontal Asymptotes, and Growth Rates$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":36,"part":"B","chapter":"Limits at Infinity, Horizontal Asymptotes, and Growth Rates","printed_level":"medium","bc_only":false,"figure":"/exam-figures/ap-limits/q36.png","answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_36.id, v.label, v.ok, v.pos
  from q_36, (values
    ($zq$0$zq$, true, 1),
    ($zq$1$zq$, false, 2),
    ($zq$$e$$zq$, false, 3),
    ($zq$$\infty$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 37
with q_37 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Let $k$ be a constant such that
$$\lim_{x\to\infty}\frac{kx^2+3x}{2x^2-x+1}=4.$$
What is the value of $k$?$zq$, null, null, 1, 'hard',
          $zq$Limits at Infinity, Horizontal Asymptotes, and Growth Rates$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":37,"part":"B","chapter":"Limits at Infinity, Horizontal Asymptotes, and Growth Rates","printed_level":"hard","bc_only":false,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_37.id, v.label, v.ok, v.pos
  from q_37, (values
    ($zq$2$zq$, false, 1),
    ($zq$4$zq$, false, 2),
    ($zq$8$zq$, true, 3),
    ($zq$16$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 38
with q_38 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to\infty}\dfrac{3^x+x^{100}}{3^x-x^2}=$$zq$, null, null, 1, 'hard',
          $zq$Limits at Infinity, Horizontal Asymptotes, and Growth Rates$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":38,"part":"B","chapter":"Limits at Infinity, Horizontal Asymptotes, and Growth Rates","printed_level":"hard","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_38.id, v.label, v.ok, v.pos
  from q_38, (values
    ($zq$0$zq$, false, 1),
    ($zq$1$zq$, true, 2),
    ($zq$3$zq$, false, 3),
    ($zq$$\infty$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 39
with q_39 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\dfrac{e^{2x}-1}{x}=$$zq$, null, null, 1, 'easy',
          $zq$Indeterminate Forms and L'Hôpital's Rule$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":39,"part":"B","chapter":"Indeterminate Forms and L'Hôpital's Rule","printed_level":"easy","bc_only":false,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_39.id, v.label, v.ok, v.pos
  from q_39, (values
    ($zq$0$zq$, false, 1),
    ($zq$$\frac{1}{2}$$zq$, false, 2),
    ($zq$2$zq$, true, 3),
    ($zq$$e^2$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 40
with q_40 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0^+} x\ln x=$$zq$, null, null, 1, 'medium',
          $zq$Indeterminate Forms and L'Hôpital's Rule$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":40,"part":"B","chapter":"Indeterminate Forms and L'Hôpital's Rule","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_40.id, v.label, v.ok, v.pos
  from q_40, (values
    ($zq$$-\infty$$zq$, false, 1),
    ($zq$$-1$$zq$, false, 2),
    ($zq$0$zq$, true, 3),
    ($zq$1$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 41
with q_41 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 1}\dfrac{x-1-\ln x}{(x-1)^2}=$$zq$, null, null, 1, 'medium',
          $zq$Indeterminate Forms and L'Hôpital's Rule$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":41,"part":"B","chapter":"Indeterminate Forms and L'Hôpital's Rule","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_41.id, v.label, v.ok, v.pos
  from q_41, (values
    ($zq$0$zq$, false, 1),
    ($zq$$\frac{1}{4}$$zq$, false, 2),
    ($zq$$\frac{1}{2}$$zq$, true, 3),
    ($zq$1$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 42
with q_42 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$In a compounding model, the value after one year of an investment of $1 is
$$V(x)=(1+3x)^{2/x}, \qquad x>0,$$
where $x$ is a small positive parameter. What is $\lim_{x\to 0^+} V(x)$?$zq$, null, null, 1, 'medium',
          $zq$Indeterminate Forms and L'Hôpital's Rule$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":42,"part":"B","chapter":"Indeterminate Forms and L'Hôpital's Rule","printed_level":"medium","bc_only":false,"figure":null,"answer_key":"D","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_42.id, v.label, v.ok, v.pos
  from q_42, (values
    ($zq$1$zq$, false, 1),
    ($zq$6$zq$, false, 2),
    ($zq$$2e^3$$zq$, false, 3),
    ($zq$$e^6$$zq$, true, 4)
  ) as v(label, ok, pos);

  -- Question 43
with q_43 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\left(\dfrac{1}{x^2}-\dfrac{1}{\sin^2 x}\right)=$$zq$, null, null, 1, 'hard',
          $zq$Indeterminate Forms and L'Hôpital's Rule$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":43,"part":"B","chapter":"Indeterminate Forms and L'Hôpital's Rule","printed_level":"hard","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_43.id, v.label, v.ok, v.pos
  from q_43, (values
    ($zq$$-\frac{1}{2}$$zq$, false, 1),
    ($zq$$-\frac{1}{3}$$zq$, true, 2),
    ($zq$$-\frac{1}{6}$$zq$, false, 3),
    ($zq$0$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 44
with q_44 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Consider the limit $\lim_{x\to\infty}\dfrac{2x+\sin x}{x}$. Which of the following statements is true?$zq$, null, null, 1, 'hard',
          $zq$Indeterminate Forms and L'Hôpital's Rule$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":44,"part":"B","chapter":"Indeterminate Forms and L'Hôpital's Rule","printed_level":"hard","bc_only":false,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_44.id, v.label, v.ok, v.pos
  from q_44, (values
    ($zq$The limit is $2$, and it can be justified by applying L'Hôpital's Rule once.$zq$, false, 1),
    ($zq$The limit is $2$, and L'Hôpital's Rule does not apply because $\lim_{x\to\infty}(2+\cos x)$ does not exist.$zq$, true, 2),
    ($zq$The limit does not exist, because L'Hôpital's Rule fails.$zq$, false, 3),
    ($zq$The limit is $2$, and L'Hôpital's Rule applies because the quotient has the indeterminate form $\frac{\infty}{\infty}$.$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 45
with q_45 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$The amount of a medication, in milligrams, remaining in a patient's bloodstream $n$ hours after a dose is given by
$$D_n=120\left(\frac{5}{6}\right)^n, \qquad n=0,1,2,\ldots$$
Selected values are shown in the table.
What is $\lim_{n\to\infty} D_n$?$zq$, $zj${"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The amount of a medication, in milligrams, remaining in a patient's bloodstream "},{"type":"mathInline","attrs":{"latex":"n"}},{"type":"text","text":" hours after a dose is given by"}]},{"type":"mathBlock","attrs":{"latex":"D_n=120\\left(\\frac{5}{6}\\right)^n, \\qquad n=0,1,2,\\ldots"}},{"type":"paragraph","content":[{"type":"text","text":"Selected values are shown in the table."}]},{"type":"image","attrs":{"src":"/exam-figures/ap-limits/q45.png","alt":"Figure for question 45","width":60}},{"type":"paragraph","content":[{"type":"text","text":"What is "},{"type":"mathInline","attrs":{"latex":"\\lim_{n\\to\\infty} D_n"}},{"type":"text","text":"?"}]}]}$zj$::jsonb, null, 1, 'easy',
          $zq$BC-Only Limit Extensions$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":45,"part":"B","chapter":"BC-Only Limit Extensions","printed_level":"easy","bc_only":true,"figure":"/exam-figures/ap-limits/q45.png","answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_45.id, v.label, v.ok, v.pos
  from q_45, (values
    ($zq$0$zq$, true, 1),
    ($zq$20$zq$, false, 2),
    ($zq$100$zq$, false, 3),
    ($zq$120$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 46
with q_46 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{n\to\infty}\dfrac{(-1)^n}{n}=$$zq$, null, null, 1, 'medium',
          $zq$BC-Only Limit Extensions$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":46,"part":"B","chapter":"BC-Only Limit Extensions","printed_level":"medium","bc_only":true,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_46.id, v.label, v.ok, v.pos
  from q_46, (values
    ($zq$does not exist$zq$, false, 1),
    ($zq$$-1$$zq$, false, 2),
    ($zq$0$zq$, true, 3),
    ($zq$1$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 47
with q_47 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Using the Maclaurin series for $\sin x$, $\lim_{x\to 0}\dfrac{\sin x - x}{x^3}=$$zq$, null, null, 1, 'medium',
          $zq$BC-Only Limit Extensions$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":47,"part":"B","chapter":"BC-Only Limit Extensions","printed_level":"medium","bc_only":true,"figure":null,"answer_key":"B","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_47.id, v.label, v.ok, v.pos
  from q_47, (values
    ($zq$$-\frac{1}{3}$$zq$, false, 1),
    ($zq$$-\frac{1}{6}$$zq$, true, 2),
    ($zq$0$zq$, false, 3),
    ($zq$$\frac{1}{6}$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 48
with q_48 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$$\lim_{x\to 0}\dfrac{1-\cos x-\dfrac{x^2}{2}}{x^4}=$$zq$, null, null, 1, 'hard',
          $zq$BC-Only Limit Extensions$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":48,"part":"B","chapter":"BC-Only Limit Extensions","printed_level":"hard","bc_only":true,"figure":null,"answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_48.id, v.label, v.ok, v.pos
  from q_48, (values
    ($zq$$-\frac{1}{24}$$zq$, true, 1),
    ($zq$0$zq$, false, 2),
    ($zq$$\frac{1}{24}$$zq$, false, 3),
    ($zq$$\frac{1}{12}$$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 49
with q_49 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Let $a_n=\dfrac{3^n}{(n+2)!}$ for $n\ge 1$. What is $\lim_{n\to\infty}\dfrac{a_{n+1}}{a_n}$?$zq$, null, null, 1, 'hard',
          $zq$BC-Only Limit Extensions$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":49,"part":"B","chapter":"BC-Only Limit Extensions","printed_level":"hard","bc_only":true,"figure":null,"answer_key":"A","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_49.id, v.label, v.ok, v.pos
  from q_49, (values
    ($zq$0$zq$, true, 1),
    ($zq$$\frac{1}{3}$$zq$, false, 2),
    ($zq$1$zq$, false, 3),
    ($zq$3$zq$, false, 4)
  ) as v(label, ok, pos);

  -- Question 50
with q_50 as (
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags, status, review_status, config)
  values ('0a400000-0000-4000-8000-000000000001', 'single_choice', $zq$Let $a_n=\dfrac{2n^2+5}{4n^3-n}$ and $b_n=\dfrac{1}{n}$ for $n\ge 1$. What is $\lim_{n\to\infty}\dfrac{a_n}{b_n}$?$zq$, null, null, 1, 'hard',
          $zq$BC-Only Limit Extensions$zq$, array['ap','calculus-ab-bc','limits']::text[], 'published', 'approved', $zj${"source":"ap-calculus-abbc-limits-practice-exam","question_number":50,"part":"B","chapter":"BC-Only Limit Extensions","printed_level":"hard","bc_only":true,"figure":null,"answer_key":"C","answer_key_status":"derived_and_checked_on_page_images","marks_printed_in_pdf":false}$zj$::jsonb)
  returning id
)
insert into public.question_options (question_id, label, is_correct, position)
select q_50.id, v.label, v.ok, v.pos
  from q_50, (values
    ($zq$0$zq$, false, 1),
    ($zq$$\frac{1}{4}$$zq$, false, 2),
    ($zq$$\frac{1}{2}$$zq$, true, 3),
    ($zq$2$zq$, false, 4)
  ) as v(label, ok, pos);

  insert into public.quiz_questions (quiz_id, question_id, position, points)
  select v_quiz, q.id, (q.config ->> 'question_number')::int, 1
    from public.questions q
   where q.organization_id = v_org and q.config ->> 'source' = 'ap-calculus-abbc-limits-practice-exam'
   order by (q.config ->> 'question_number')::int;

  insert into public.exams
    (organization_id, quiz_id, class_id, title, description, instructions, duration_minutes,
     status, access_code, shared_link_enabled, settings)
  values (
    v_org,
    v_quiz,
    null,
    $zq$AP Examination$zq$,
    $zq$AP Calculus AB/BC — Limits Practice Exam. 50 multiple-choice questions, one correct answer each. Questions 45–50 are for BC students only.$zq$,
    $zq$Mark one answer per question. There is no penalty for guessing, so answer every question. Part A (questions 1–30) does not allow a calculator; in Part B (questions 31–50) a graphing calculator is permitted, but your reasoning must support each choice. Answers are exact values unless a graphing calculator is specified.$zq$,
    75,
    'draft',
    'AP-LIM-2026',
    false,
    $zj${"randomize_questions":false,"randomize_options":false,"parts":[{"name":"Part A","questions":"1-30","minutes":45,"calculator":false},{"name":"Part B","questions":"31-50","minutes":30,"calculator":true}]}$zj$::jsonb
  )
  returning id into v_exam;

  select count(*) into v_n from public.questions
   where organization_id = v_org and config ->> 'source' = 'ap-calculus-abbc-limits-practice-exam';
  select count(*) into v_o from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = 'ap-calculus-abbc-limits-practice-exam';
  select count(*) into v_c from public.question_options o
    join public.questions q on q.id = o.question_id
   where q.organization_id = v_org and q.config ->> 'source' = 'ap-calculus-abbc-limits-practice-exam' and o.is_correct;
  select count(*) into v_qq from public.quiz_questions where quiz_id = v_quiz;

  if v_n <> 50 or v_o <> 200 or v_c <> 50 or v_qq <> 50 then
    raise exception 'AP import incomplete: questions=%, options=%, keyed=%, quiz_questions=%', v_n, v_o, v_c, v_qq;
  end if;
end $body$;
