-- ═══════════════════════════════════════════════════════════════════════
-- EVALORA — migration 0001: multi-tenant foundation, RBAC, billing,
-- quiz/exam engines, proctoring, RLS everywhere.
-- ═══════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- ─── Platform settings (key/value, super-admin managed) ───────────────
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ─── Profiles (1:1 with auth.users) ───────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  platform_role text not null default 'user' check (platform_role in ('user','super_admin')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

-- ─── Plans (Super-Admin configurable; limits in jsonb) ────────────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  price_monthly_cents int not null default 0,
  price_yearly_cents int not null default 0,
  currency text not null default 'USD',
  trial_days int not null default 14,
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ─── Organizations (tenants) ──────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  type text not null default 'school' check (type in ('school','university','training_center','exam_board','independent','other')),
  owner_id uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active','suspended')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','teacher','organizer','supervisor','corrector','participant','candidate','parent')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index idx_members_user on public.organization_members(user_id);
create index idx_members_org on public.organization_members(organization_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null,
  token text unique not null default encode(gen_random_bytes(24),'hex'),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid references public.profiles(id),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- ─── Subscriptions & manual payments ─────────────────────────────────
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','expired','cancelled')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly','yearly','one_time')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_subs_org on public.subscriptions(organization_id);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  billing_period text not null default 'monthly',
  amount_cents int not null,
  currency text not null default 'USD',
  method text,
  transaction_ref text not null,
  proof_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','refunded')),
  submitted_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  admin_note text,
  rejection_reason text,
  created_at timestamptz not null default now()
);
create index idx_pay_org on public.payment_requests(organization_id);
create index idx_pay_status on public.payment_requests(status);

-- ─── Question bank ────────────────────────────────────────────────────
create table public.question_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.question_categories(id) on delete set null,
  type text not null check (type in ('single_choice','multiple_select','true_false','short_answer','numeric','ordering','matching','poll','open_ended','slide')),
  prompt text not null,
  explanation text,
  points numeric not null default 1,
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  topic text,
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','pending_review','published','archived')),
  config jsonb not null default '{}'::jsonb, -- media_url/media_type, numeric tolerance, matching pairs, ordering items…
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_q_org on public.questions(organization_id, status);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null,
  is_correct boolean not null default false,
  position int not null default 0
);
create index idx_qopt_q on public.question_options(question_id);

-- ─── Quizzes ──────────────────────────────────────────────────────────
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  settings jsonb not null default '{"randomize_questions":false,"randomize_options":false,"time_per_question_seconds":30}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position int not null default 0,
  points numeric,
  time_limit_seconds int,
  unique (quiz_id, question_id)
);
create index idx_qq_quiz on public.quiz_questions(quiz_id, position);

-- ─── Live quiz sessions ───────────────────────────────────────────────
create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  host_id uuid references public.profiles(id),
  join_code text unique not null,
  title text,
  mode text not null default 'synchronized' check (mode in ('synchronized','self_paced')),
  status text not null default 'lobby' check (status in ('lobby','live','paused','ended')),
  current_question_index int not null default -1,
  question_started_at timestamptz,
  settings jsonb not null default '{"show_leaderboard":true,"max_participants":200}'::jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  display_name text not null,
  participant_ref text,
  access_token uuid not null default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  score numeric not null default 0,
  status text not null default 'admitted' check (status in ('joined','admitted','rejected','finished')),
  current_index int not null default 0, -- self-paced progress
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index idx_sp_session on public.session_participants(session_id);

create table public.participant_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  participant_id uuid not null references public.session_participants(id) on delete cascade,
  quiz_question_id uuid not null references public.quiz_questions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer jsonb not null default '{}'::jsonb,
  is_correct boolean,
  points_awarded numeric not null default 0,
  response_ms int,
  submitted_at timestamptz not null default now(),
  unique (participant_id, quiz_question_id)
);
create index idx_pa_session on public.participant_answers(session_id);

-- ─── Examinations ─────────────────────────────────────────────────────
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  title text not null,
  description text,
  instructions text,
  duration_minutes int not null default 60,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','open','closed')),
  access_code text unique not null,
  settings jsonb not null default '{"proctoring":false,"require_screen_share":false,"randomize_questions":true,"randomize_options":true,"pass_mark_percent":50,"results_published":false}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.exam_candidates (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  full_name text not null,
  email text,
  candidate_ref text,
  access_code text not null,
  status text not null default 'registered' check (status in ('registered','admitted','in_progress','submitted')),
  created_at timestamptz not null default now(),
  unique (exam_id, access_code)
);
create index idx_ec_exam on public.exam_candidates(exam_id);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid not null references public.exam_candidates(id) on delete cascade,
  access_token uuid not null default gen_random_uuid(),
  question_order jsonb not null default '[]'::jsonb,
  flagged jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','auto_submitted','marked')),
  score numeric,
  max_score numeric,
  unique (exam_id, candidate_id)
);

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  quiz_question_id uuid references public.quiz_questions(id) on delete set null,
  answer jsonb not null default '{}'::jsonb,
  is_correct boolean,
  points_awarded numeric,
  marked_by uuid references public.profiles(id),
  marker_note text,
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ─── Proctoring ───────────────────────────────────────────────────────
create table public.proctoring_rooms (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  room_name text unique not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.proctoring_incidents (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_id uuid references public.exam_candidates(id) on delete set null,
  attempt_id uuid references public.exam_attempts(id) on delete set null,
  type text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  note text,
  reported_by uuid references public.profiles(id),
  status text not null default 'open' check (status in ('open','valid','invalid','investigating')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.proctoring_recordings (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete set null,
  room_name text,
  egress_id text,
  file_url text,
  status text not null default 'pending',
  retention_until timestamptz,
  created_at timestamptz not null default now()
);

-- ─── Notifications, support, audit ────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text,
  email text,
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_org on public.audit_logs(organization_id, created_at desc);

-- ═══════════════ RLS helpers (security definer: no policy recursion) ═
create or replace function public.is_super_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin' and status = 'active');
$$;

create or replace function public.org_role(p_org uuid)
returns text language sql security definer set search_path = public stable as $$
  select role from public.organization_members
  where organization_id = p_org and user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.org_role(p_org) is not null;
$$;

create or replace function public.can_manage_org(p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(public.org_role(p_org) in ('owner','admin'), false);
$$;

create or replace function public.can_create_content(p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(public.org_role(p_org) in ('owner','admin','teacher','organizer'), false);
$$;

create or replace function public.gen_code(p_len int default 6)
returns text language plpgsql volatile as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; out_ text := ''; i int;
begin
  for i in 1..p_len loop out_ := out_ || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
  return out_;
end $$;

-- ═══════════════════════ Enable RLS everywhere ═══════════════════════
alter table public.platform_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_requests enable row level security;
alter table public.question_categories enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.participant_answers enable row level security;
alter table public.exams enable row level security;
alter table public.exam_candidates enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;
alter table public.proctoring_rooms enable row level security;
alter table public.proctoring_incidents enable row level security;
alter table public.proctoring_recordings enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.audit_logs enable row level security;

-- platform_settings: readable by signed-in users; writable by super admin
create policy ps_select on public.platform_settings for select to authenticated using (true);
create policy ps_write on public.platform_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- profiles
create policy prof_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_super_admin());
create policy prof_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_super_admin()) with check (id = auth.uid() or public.is_super_admin());

-- plans: public catalogue
create policy plan_select on public.plans for select to anon, authenticated using (is_active or public.is_super_admin());
create policy plan_write on public.plans for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- organizations
create policy org_select on public.organizations for select to authenticated using (public.is_org_member(id) or public.is_super_admin());
create policy org_insert on public.organizations for insert to authenticated with check (owner_id = auth.uid());
create policy org_update on public.organizations for update to authenticated using (public.can_manage_org(id) or public.is_super_admin()) with check (public.can_manage_org(id) or public.is_super_admin());
create policy org_delete on public.organizations for delete to authenticated using (public.org_role(id) = 'owner' or public.is_super_admin());

-- members
create policy mem_select on public.organization_members for select to authenticated using (public.is_org_member(organization_id) or user_id = auth.uid() or public.is_super_admin());
create policy mem_insert on public.organization_members for insert to authenticated with check (
  public.can_manage_org(organization_id)
  or public.is_super_admin()
  or (user_id = auth.uid() and role = 'owner' and exists (select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()))
);
create policy mem_update on public.organization_members for update to authenticated using (public.can_manage_org(organization_id) or public.is_super_admin()) with check (public.can_manage_org(organization_id) or public.is_super_admin());
create policy mem_delete on public.organization_members for delete to authenticated using (public.can_manage_org(organization_id) or public.is_super_admin());

-- invitations
create policy inv_all on public.invitations for all to authenticated using (public.can_manage_org(organization_id) or public.is_super_admin()) with check (public.can_manage_org(organization_id) or public.is_super_admin());

-- subscriptions & payments
create policy sub_select on public.subscriptions for select to authenticated using (public.is_org_member(organization_id) or public.is_super_admin());
create policy sub_write on public.subscriptions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy pay_select on public.payment_requests for select to authenticated using (public.is_org_member(organization_id) or public.is_super_admin());
create policy pay_insert on public.payment_requests for insert to authenticated with check (public.can_manage_org(organization_id));
create policy pay_update on public.payment_requests for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- question bank / quizzes (tenant-scoped)
create policy qc_all on public.question_categories for all to authenticated
  using (public.is_org_member(organization_id)) with check (public.can_create_content(organization_id));
create policy q_select on public.questions for select to authenticated using (public.is_org_member(organization_id));
create policy q_write on public.questions for all to authenticated using (public.can_create_content(organization_id)) with check (public.can_create_content(organization_id));
create policy qopt_all on public.question_options for all to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and public.is_org_member(q.organization_id)))
  with check (exists (select 1 from public.questions q where q.id = question_id and public.can_create_content(q.organization_id)));
create policy quiz_select on public.quizzes for select to authenticated using (public.is_org_member(organization_id));
create policy quiz_write on public.quizzes for all to authenticated using (public.can_create_content(organization_id)) with check (public.can_create_content(organization_id));
create policy qq_all on public.quiz_questions for all to authenticated
  using (exists (select 1 from public.quizzes z where z.id = quiz_id and public.is_org_member(z.organization_id)))
  with check (exists (select 1 from public.quizzes z where z.id = quiz_id and public.can_create_content(z.organization_id)));

-- live sessions: org members manage; guests go through API (service role)
create policy ses_select on public.quiz_sessions for select to authenticated using (public.is_org_member(organization_id));
create policy ses_write on public.quiz_sessions for all to authenticated using (public.can_create_content(organization_id)) with check (public.can_create_content(organization_id));
create policy sp_select on public.session_participants for select to authenticated
  using (exists (select 1 from public.quiz_sessions s where s.id = session_id and public.is_org_member(s.organization_id)));
create policy pa_select on public.participant_answers for select to authenticated
  using (exists (select 1 from public.quiz_sessions s where s.id = session_id and public.is_org_member(s.organization_id)));

-- exams
create policy exam_select on public.exams for select to authenticated using (public.is_org_member(organization_id));
create policy exam_write on public.exams for all to authenticated using (public.can_create_content(organization_id)) with check (public.can_create_content(organization_id));
create policy ec_all on public.exam_candidates for all to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and public.is_org_member(e.organization_id)))
  with check (exists (select 1 from public.exams e where e.id = exam_id and public.can_create_content(e.organization_id)));
create policy ea_select on public.exam_attempts for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and public.is_org_member(e.organization_id)));
create policy eans_select on public.exam_answers for select to authenticated
  using (exists (select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where a.id = attempt_id and public.is_org_member(e.organization_id)));
create policy eans_update on public.exam_answers for update to authenticated
  using (exists (select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where a.id = attempt_id and coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','corrector'), false)))
  with check (exists (select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where a.id = attempt_id and coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','corrector'), false)));
create policy ea_update on public.exam_attempts for update to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','corrector'), false)))
  with check (exists (select 1 from public.exams e where e.id = exam_id and coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','corrector'), false)));

-- proctoring
create policy pr_select on public.proctoring_rooms for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and public.is_org_member(e.organization_id)));
create policy pi_all on public.proctoring_incidents for all to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','supervisor','corrector'), false)))
  with check (exists (select 1 from public.exams e where e.id = exam_id and coalesce(public.org_role(e.organization_id) in ('owner','admin','teacher','supervisor','corrector'), false)));
create policy prec_select on public.proctoring_recordings for select to authenticated
  using (public.is_super_admin() or exists (select 1 from public.exams e where e.id = exam_id and public.can_manage_org(e.organization_id)));

-- notifications / support / audit
create policy notif_own on public.notifications for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() or public.is_super_admin());
create policy notif_insert_admin on public.notifications for insert to authenticated with check (public.is_super_admin() or user_id = auth.uid());
create policy sup_insert on public.support_tickets for insert to anon, authenticated with check (true);
create policy sup_admin on public.support_tickets for select to authenticated using (public.is_super_admin() or user_id = auth.uid());
create policy sup_update on public.support_tickets for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy audit_select on public.audit_logs for select to authenticated using (public.is_super_admin() or (organization_id is not null and public.can_manage_org(organization_id)));

-- ═══════════════ New-user trigger → profile (+ Super Admin bootstrap) ═
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare sa text;
begin
  select value->>'email' into sa from public.platform_settings where key = 'super_admin';
  insert into public.profiles (id, email, full_name, platform_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when lower(new.email) = lower(coalesce(sa, '')) then 'super_admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════ Realtime (live sessions) ════════════════════════════
do $$
begin
  begin alter publication supabase_realtime add table public.quiz_sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.session_participants; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.participant_answers; exception when duplicate_object then null; end;
end $$;

-- ═══════════════ Storage buckets ═════════════════════════════════════
insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('question-media', 'question-media', true)
  on conflict (id) do nothing;

create policy "proofs_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "proofs_read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));
create policy "media_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'question-media');
create policy "media_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'question-media');

-- ═══════════════ Seeds: settings + plans ═════════════════════════════
insert into public.platform_settings (key, value) values
  ('super_admin', '{"email":"starboyboy2017@gmail.com"}'::jsonb),
  ('payment_instructions', '{"methods":[{"name":"Bank transfer","details":"Account name: EVALORA — details provided by the EVALORA team after you contact support."},{"name":"Mobile Money","details":"Send to the EVALORA Mobile Money number shared by our team, using your organization name as the reference."}],"note":"After paying, submit your transaction reference below. Your subscription activates only after our team verifies the payment."}'::jsonb),
  ('trial_days', '14'::jsonb),
  ('support_email', '"support@evalora.app"'::jsonb)
on conflict (key) do nothing;

insert into public.plans (slug, name, description, price_monthly_cents, price_yearly_cents, currency, trial_days, limits, features, sort) values
  ('free','Free','For individual teachers getting started with interactive quizzes.',0,0,'USD',0,
   '{"max_quizzes":5,"max_participants_per_session":30,"max_exams":2,"max_members":3,"max_questions":100,"proctoring":false,"advanced_reports":false,"storage_mb":100}'::jsonb,
   '["Up to 5 quizzes","30 participants per live session","Question bank (100 questions)","Basic results & CSV export","2 examinations"]'::jsonb,1),
  ('premium','Premium','For schools and training centers that need examinations and proctoring.',1900,19000,'USD',14,
   '{"max_quizzes":-1,"max_participants_per_session":500,"max_exams":-1,"max_members":50,"max_questions":-1,"proctoring":true,"advanced_reports":true,"storage_mb":5120}'::jsonb,
   '["Unlimited quizzes & questions","500 participants per live session","Video proctoring with LiveKit","Advanced analytics & exports","Manual marking workflows","50 team members"]'::jsonb,2),
  ('institution','Institution','For universities and examination boards running high-stakes assessments at scale.',7900,79000,'USD',14,
   '{"max_quizzes":-1,"max_participants_per_session":1000,"max_exams":-1,"max_members":-1,"max_questions":-1,"proctoring":true,"advanced_reports":true,"storage_mb":51200}'::jsonb,
   '["Everything in Premium","1,000 participants per live session","Unlimited team members","Priority support","Dedicated onboarding"]'::jsonb,3)
on conflict (slug) do nothing;
