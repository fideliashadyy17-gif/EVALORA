-- Privacy-preserving Founder workspace. No academic rows are updated.
-- The only elevated read surface returns aggregate counts and examination
-- scheduling metadata, never answers, marks, candidate identities or codes.
create function public.access_is_founder() returns boolean
language sql security definer stable set search_path=public,pg_temp as $$
 select exists(select 1 from public.organization_members where user_id=auth.uid() and role='school_founder')
 or exists(select 1 from public.access_user_roles ur join public.access_roles r on r.id=ur.role_id
 where ur.user_id=auth.uid() and ur.status='active' and r.slug='school_founder'
 and r.is_active and (ur.expires_at is null or ur.expires_at>now()))
$$;
revoke all on function public.access_is_founder() from public,anon;
grant execute on function public.access_is_founder() to authenticated;

create function public.access_founder_assignment_guard() returns trigger language plpgsql
security definer set search_path=public,pg_temp as $$
begin
 if new.status='active' and exists(select 1 from public.access_roles where id=new.role_id and slug='school_founder') then
   if not exists(select 1 from public.organization_members where user_id=new.user_id and organization_id=new.organization_id and role='school_founder' and status='active') then
     raise exception 'A supervision-only membership is required for Founder assignment'; end if;
   if exists(select 1 from public.profiles where id=new.user_id and platform_role='super_admin') or
      exists(select 1 from public.organization_members where user_id=new.user_id and status='active' and role in ('owner','admin','teacher','organizer','supervisor','corrector')) then
     raise exception 'Founder requires a dedicated non-operational account; existing memberships are never demoted automatically';
   end if;
 end if;
 return new;
end $$;
create trigger access_founder_assignment_guard before insert or update on public.access_user_roles
for each row execute function public.access_founder_assignment_guard();

-- Restrictive policies intersect existing permissive policies. They do not
-- expand anyone's access. Founder reads go through the sanitized RPC below;
-- existing ordinary-user and Super Admin policies otherwise remain unchanged.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity
   and tablename not like 'access_%' loop
   execute format('create policy access_founder_no_insert on public.%I as restrictive for insert to authenticated with check(not public.access_is_founder())', t.tablename);
   execute format('create policy access_founder_no_update on public.%I as restrictive for update to authenticated using(not public.access_is_founder()) with check(not public.access_is_founder())', t.tablename);
   execute format('create policy access_founder_no_delete on public.%I as restrictive for delete to authenticated using(not public.access_is_founder())', t.tablename);
   if t.tablename not in ('profiles','organizations','organization_members','plans','subscriptions','platform_settings') then
     execute format('create policy access_founder_private_reads on public.%I as restrictive for select to authenticated using(not public.access_is_founder())', t.tablename);
   end if;
 end loop;
end $$;

create function public.access_module_enabled(p_org uuid,p_key text) returns boolean
language plpgsql security definer stable set search_path=public,pg_temp as $$
declare m jsonb; ov jsonb; begin
 if public.is_super_admin() then return true; end if;
 if not public.is_org_member(p_org) then return false; end if;
 select p.modules,s.modules_override into m,ov from public.subscriptions s join public.plans p on p.id=s.plan_id
 where s.organization_id=p_org and s.status in ('active','trialing')
 order by s.created_at desc limit 1;
 -- Expiry matches getEntitlement: no period end is an open-ended subscription.
 if not exists(select 1 from public.subscriptions s where s.organization_id=p_org and s.status in ('active','trialing')
   and (case when s.status='trialing' then s.trial_ends_at else s.current_period_end end is null
    or case when s.status='trialing' then s.trial_ends_at else s.current_period_end end>now())
   and s.id=(select id from public.subscriptions where organization_id=p_org and status in ('active','trialing') order by created_at desc limit 1)) then
   select modules into m from public.plans where slug='free'; ov:=null;
 end if;
 if jsonb_typeof(ov->p_key)='boolean' then return (ov->>p_key)::boolean; end if;
 if jsonb_typeof(m->p_key)='boolean' then return (m->>p_key)::boolean; end if;
 return true;
end $$;
revoke all on function public.access_module_enabled(uuid,text) from public,anon;
grant execute on function public.access_module_enabled(uuid,text) to authenticated;

create function public.access_supervision_overview(p_org uuid) returns jsonb
language plpgsql security definer stable set search_path=public,pg_temp as $$
declare result jsonb:='{}'; rows jsonb; n bigint; begin
 if not public.access_has_permission(auth.uid(),p_org,'dashboard.view') then
   raise exception 'Organization supervision permission required' using errcode='42501'; end if;
 if public.access_has_permission(auth.uid(),p_org,'exams.view') and public.access_module_enabled(p_org,'examinations') then
   select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into rows from
    (select title,status,starts_at,ends_at from public.exams where organization_id=p_org order by created_at desc limit 100) e;
   result:=result||jsonb_build_object('examinations',rows);
 end if;
 if public.access_has_permission(auth.uid(),p_org,'questions.view') and public.access_module_enabled(p_org,'question_bank') then
   select count(*) into n from public.questions where organization_id=p_org;
   result:=result||jsonb_build_object('questionCount',n);
 end if;
 if public.access_has_permission(auth.uid(),p_org,'quizzes.view') and public.access_module_enabled(p_org,'quizzes') then
   select count(*) into n from public.quizzes where organization_id=p_org;
   result:=result||jsonb_build_object('quizCount',n);
 end if;
 if public.access_has_permission(auth.uid(),p_org,'results.view') and public.access_module_enabled(p_org,'exam_results') then
   select count(*) into n from public.exams where organization_id=p_org and settings->>'results_published'='true';
   result:=result||jsonb_build_object('publishedExaminationCount',n);
 end if;

 if public.access_has_permission(auth.uid(),p_org,'classes.view') and public.access_module_enabled(p_org,'classes') then
   select coalesce(jsonb_agg(c.name order by c.name),'[]'::jsonb) into rows from public.classes c where c.organization_id=p_org;
   result:=result||jsonb_build_object('classes',rows);
 end if;
 if public.access_has_permission(auth.uid(),p_org,'dashboard.analytics') and public.access_module_enabled(p_org,'students') then
   select count(*) into n from public.students where organization_id=p_org;
   result:=result||jsonb_build_object('studentCount',n);
 end if;
 if public.access_has_permission(auth.uid(),p_org,'paper_builder.view') and public.access_module_enabled(p_org,'paper_builder') then
   select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from
     (select title,status from public.quizzes where organization_id=p_org order by title limit 100) q;
   result:=result||jsonb_build_object('papers',rows);
 end if;
 if public.access_has_permission(auth.uid(),p_org,'competitions.view') and public.access_module_enabled(p_org,'competitions') then
   select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into rows from
     (select name,status from public.competition_events where organization_id=p_org order by name limit 100) c;
   result:=result||jsonb_build_object('competitions',rows);
 end if;
 if public.access_has_permission(auth.uid(),p_org,'grading.view') and public.access_module_enabled(p_org,'exam_results') then
   select coalesce(jsonb_object_agg(a.status,a.n),'{}'::jsonb) into rows from
     (select ea.status,count(*) as n from public.exam_attempts ea join public.exams e on e.id=ea.exam_id
      where e.organization_id=p_org group by ea.status) a;
   result:=result||jsonb_build_object('attemptProgress',rows);
 end if;
 if public.access_has_permission(auth.uid(),p_org,'exams.monitor') and public.access_module_enabled(p_org,'proctoring') then
   select count(*) into n from public.proctoring_rooms pr join public.exams e on e.id=pr.exam_id
   where e.organization_id=p_org and pr.status='active';
   result:=result||jsonb_build_object('activeProctoringRooms',n);
 end if;
 return result;
end $$;
revoke all on function public.access_supervision_overview(uuid) from public,anon;
grant execute on function public.access_supervision_overview(uuid) to authenticated;

-- Backward-compatible expansion only when the local/older membership schema
-- uses a closed list. Preserve the full prior expression, including custom roles.
do $$ declare c record; begin
 for c in select conname,pg_get_expr(conbin,conrelid) expr from pg_constraint
   where conrelid='public.organization_members'::regclass and contype='c'
   and conname='organization_members_role_check' loop
   if c.expr not like '%~%' and c.expr not like '%school_founder%' then
     execute format('alter table public.organization_members drop constraint %I',c.conname);
     execute format('alter table public.organization_members add constraint %I check ((%s) or role=''school_founder'')',c.conname,c.expr);
   end if;
 end loop;
end $$;

-- Provisioning is explicit, scoped and atomic. No auth user is invented and
-- no existing membership is overwritten or demoted.
create function public.access_assign_founder(p_email text,p_org uuid,p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid; founder_role uuid;
begin
 if not public.is_super_admin() then raise exception 'Active Super Admin required' using errcode='42501'; end if;
 if not exists(select 1 from public.organizations where id=p_org and status='active') then raise exception 'Active organization required'; end if;
 select id into strict target from public.profiles where lower(email)=lower(trim(p_email)) and status='active';
 if p_expires_at is not null and p_expires_at<=now() then raise exception 'Expiry must be in the future'; end if;
 if exists(select 1 from public.organization_members where user_id=target and organization_id=p_org and (status<>'active' or role<>'school_founder')) then
   raise exception 'Existing membership differs: use a dedicated account. No membership was modified'; end if;
 if not exists(select 1 from public.organization_members where user_id=target and organization_id=p_org) then
   insert into public.organization_members(user_id,organization_id,role,status) values(target,p_org,'school_founder','active');
 end if;
 select id into strict founder_role from public.access_roles where slug='school_founder' and is_active;
 insert into public.access_user_roles(user_id,role_id,organization_id,assigned_by,expires_at)
 values(target,founder_role,p_org,auth.uid(),p_expires_at)
 on conflict(user_id,role_id,organization_id) do update set status='active',assigned_by=auth.uid(),assigned_at=now(),expires_at=excluded.expires_at;
end $$;
revoke all on function public.access_assign_founder(text,uuid,timestamptz) from public,anon;
grant execute on function public.access_assign_founder(text,uuid,timestamptz) to authenticated;

-- A later legacy membership edit must not reintroduce operational privileges.
create function public.access_guard_founder_membership() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='active' and new.role in ('owner','admin','teacher','organizer','supervisor','corrector')
 and exists(select 1 from public.access_user_roles ur join public.access_roles r on r.id=ur.role_id
   where ur.user_id=new.user_id and ur.status='active' and r.slug='school_founder'
   and (ur.expires_at is null or ur.expires_at>now())) then
   raise exception 'Revoke Founder supervision before granting operational membership'; end if;
 return new;
end $$;
create trigger access_guard_founder_membership before insert or update on public.organization_members
for each row execute function public.access_guard_founder_membership();

create function public.access_guard_founder_profile() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.platform_role='super_admin' and old.platform_role is distinct from new.platform_role
 and exists(select 1 from public.organization_members where user_id=new.id and role='school_founder') then
   raise exception 'A Founder account cannot also be a platform administrator'; end if;
 return new;
end $$;
create trigger access_guard_founder_profile before update on public.profiles for each row execute function public.access_guard_founder_profile();

-- Protect the read-only ceiling even when a Super Admin uses PostgREST directly.
create function public.access_guard_founder_permissions() returns trigger language plpgsql
set search_path=public,pg_temp as $$
declare k text; begin
 if new.granted and exists(select 1 from public.access_roles where id=new.role_id and slug='school_founder') then
   select key into k from public.access_permissions where id=new.permission_id;
   if k !~ '\.(view|analytics|monitor)$' or k ~ '^(users|students|roles|permissions|proctoring)\.' then
     raise exception 'Founder permission grants must remain privacy-safe and read-only'; end if;
 end if;
 return new;
end $$;
create trigger access_guard_founder_permissions before insert or update on public.access_role_permissions for each row execute function public.access_guard_founder_permissions();
