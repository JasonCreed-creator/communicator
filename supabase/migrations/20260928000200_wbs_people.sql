-- ═══════════════════════════════════════════════════════════════════════════
-- 34. 마스터 시트 대체 — WBS 실무화 · 설계서 v2.21 §27.4 (Phase 6.11 PR-C, 2026-09-28 · DataProvider v17 = 135)
--   · wbs_tasks.assignee_id(사람 배정 — 그 행사 멤버만 · 배정 ≠ 권한 R-M6) · group_name(Lv2 묶음) · source(template|custom)
--   · role_charters.people jsonb = [{person_id, display_role}] — 주소록 사람 + 표시 역할(자유 문구) · 권한 역할 4종 불변
--   · RPC create_wbs_task(pm · code `C-{n}` 자동 · custom) · delete_wbs_task(custom만 — 템플릿은 409) · update_role_charter(pm)
--   · app.replace_wbs_tasks_impl — 재전개는 template 행만 치환(custom 무접촉) + 새 열 보존
--   · remove_member — 이 행사에서 역할이 하나도 남지 않으면 그 사람의 태스크 배정을 푼다
--   · RLS — wbs_tasks update 정책 그대로(status 체크는 앱 계층) · insert/delete는 RPC만 · role_charters 쓰기는 RPC만
-- 기존 행은 그대로 통과한다(source 기본 'template'). 두 번 실행해도 같다.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. 열
alter table wbs_tasks add column if not exists assignee_id uuid references profiles(id) on delete set null;
alter table wbs_tasks add column if not exists group_name text;
alter table wbs_tasks add column if not exists source text not null default 'template';
alter table wbs_tasks drop constraint if exists wbs_tasks_source_check;
alter table wbs_tasks add constraint wbs_tasks_source_check check (source in ('template', 'custom'));
create index if not exists wbs_tasks_assignee on wbs_tasks (assignee_id);
comment on column wbs_tasks.assignee_id is 'v2.21 §27.4 사람 배정 — 그 행사 멤버만(트리거) · 배정 ≠ 권한(R-M6) · 표시·오늘 할 일 내 차례 판정용';
comment on column wbs_tasks.group_name is 'v2.21 §27.4 Lv2 묶음(phase_name이 Lv1) — 템플릿은 null, 행사마다 사람이 묶는다';
comment on column wbs_tasks.source is 'v2.21 §27.4 template = 템플릿 전개(재전개가 되살림 · 삭제 불가) · custom = 행사별(재전개 무접촉 · 삭제 가능)';

alter table role_charters add column if not exists people jsonb;
alter table role_charters drop constraint if exists role_charters_people_shape;
alter table role_charters add constraint role_charters_people_shape check (people is null or jsonb_typeof(people) = 'array');
comment on column role_charters.people is 'v2.21 §27.4 [{person_id, display_role}] — 주소록 사람 + 표시 역할(영업·모객·총괄·Sub·현장 지원 등 자유 문구) · 행사 멤버가 아니어도 됨 · 권한 역할(role) 불변';

-- 2. 배정 대상은 그 행사 멤버만 — 트리거(RLS 직접 update·RPC·재전개 upsert 어느 경로든 같은 규칙)
create or replace function app.wbs_task_assignee_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id or new.project_id is distinct from old.project_id) then
    if not exists (select 1 from project_members m where m.project_id = new.project_id and m.user_id = new.assignee_id) then
      raise exception 'VALIDATION: 담당자는 이 행사 멤버여야 합니다.' using errcode = 'P0422';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists wbs_tasks_assignee_guard on wbs_tasks;
create trigger wbs_tasks_assignee_guard before insert or update on wbs_tasks
  for each row execute function app.wbs_task_assignee_guard();

-- 3. 재전개 — template 행만 치환(custom 무접촉) · 새 열(assignee_id·group_name·source) 보존
create or replace function app.replace_wbs_tasks_impl(p_project uuid, p_tasks jsonb, p_deliverables jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_deliverables is not null and jsonb_array_length(p_deliverables) > 0 then
    insert into deliverables (id, project_id, area, category, title, status, assignee_id, due_date, requires_approval, partner_id)
    select d.id, p_project, d.area, d.category, d.title, coalesce(d.status, 'requested'), d.assignee_id, d.due_date, coalesce(d.requires_approval, true), d.partner_id
    from jsonb_populate_recordset(null::deliverables, p_deliverables) d
    on conflict (id) do nothing;
  end if;
  delete from wbs_tasks where project_id = p_project and source = 'template'
    and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_tasks) e);
  insert into wbs_tasks (id, project_id, phase_no, phase_name, code, title, offset_start, offset_end, start_date, end_date, role, origin_role,
                         status, done_at, linked_deliverable_id, target, direction, partner_id, note, sort_order, assignee_id, group_name, source)
  select t.id, p_project, t.phase_no, t.phase_name, t.code, t.title, t.offset_start, t.offset_end, t.start_date, t.end_date, t.role, t.origin_role,
         coalesce(t.status, 'todo'), t.done_at, t.linked_deliverable_id, t.target, coalesce(t.direction, 'internal'), t.partner_id, t.note, coalesce(t.sort_order, 0),
         t.assignee_id, nullif(btrim(t.group_name), ''), coalesce(t.source, 'template')
  from jsonb_populate_recordset(null::wbs_tasks, p_tasks) t
  on conflict (id) do update set
    phase_no = excluded.phase_no, phase_name = excluded.phase_name, code = excluded.code, title = excluded.title,
    offset_start = excluded.offset_start, offset_end = excluded.offset_end, start_date = excluded.start_date, end_date = excluded.end_date,
    role = excluded.role, origin_role = excluded.origin_role, status = excluded.status, done_at = excluded.done_at,
    linked_deliverable_id = excluded.linked_deliverable_id, target = excluded.target, direction = excluded.direction,
    partner_id = excluded.partner_id, note = excluded.note, sort_order = excluded.sort_order,
    assignee_id = excluded.assignee_id, group_name = excluded.group_name, source = excluded.source;
end $$;

-- 4. 행사별 태스크 추가(pm) — code `C-{n}`(그 행사의 custom 순번 · 유일 인덱스 uq_wbs_code_per_project 안에서) · source 'custom' ·
--    오프셋 = 실날짜 − 행사일 · 단계 이름 = 전개된 태스크 → 없으면 넘어온 값 · 담당자는 그 행사 멤버만
create or replace function public.create_wbs_task(p_project uuid, p_input jsonb)
returns wbs_tasks language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_project projects;
  v_title text;
  v_phase int;
  v_phase_name text;
  v_start date;
  v_end date;
  v_role member_role;
  v_assignee uuid;
  v_n int;
  v_row wbs_tasks%rowtype;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception 'VALIDATION: 태스크 내용을 보내 주세요.' using errcode = 'P0422';
  end if;
  v_me := app.require_pm(p_project);
  v_project := app.require_writable(p_project);
  if v_project.event_date is null then
    raise exception 'VALIDATION: 행사일이 있어야 태스크를 추가할 수 있습니다.' using errcode = 'P0422';
  end if;
  v_title := btrim(coalesce(p_input->>'title', ''));
  if v_title = '' then raise exception 'VALIDATION: 태스크 제목은 필수입니다.' using errcode = 'P0422'; end if;
  if coalesce(p_input->>'phase_no', '') !~ '^\d+$' then
    raise exception 'VALIDATION: 단계를 찾을 수 없습니다.' using errcode = 'P0422';
  end if;
  v_phase := (p_input->>'phase_no')::int;
  if coalesce(p_input->>'start_date', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_input->>'end_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'VALIDATION: 시작일·종료일을 입력하세요.' using errcode = 'P0422';
  end if;
  v_start := (p_input->>'start_date')::date;
  v_end := (p_input->>'end_date')::date;
  if v_end < v_start then raise exception 'VALIDATION: 종료일은 시작일보다 앞설 수 없습니다.' using errcode = 'P0422'; end if;
  if not coalesce(p_input->>'role', '') in ('pm', 'design', 'ops', 'reg') then
    raise exception 'VALIDATION: 담당 역할이 올바르지 않습니다.' using errcode = 'P0422';
  end if;
  v_role := (p_input->>'role')::member_role;
  v_assignee := nullif(p_input->>'assignee_id', '')::uuid;
  if v_assignee is not null and not exists (select 1 from project_members m where m.project_id = p_project and m.user_id = v_assignee) then
    raise exception 'VALIDATION: 담당자는 이 행사 멤버여야 합니다.' using errcode = 'P0422';
  end if;
  select t.phase_name into v_phase_name from wbs_tasks t where t.project_id = p_project and t.phase_no = v_phase order by t.sort_order limit 1;
  if v_phase_name is null then v_phase_name := nullif(btrim(coalesce(p_input->>'phase_name', '')), ''); end if;
  if v_phase_name is null then raise exception 'VALIDATION: 단계를 찾을 수 없습니다.' using errcode = 'P0422'; end if;
  select coalesce(max((substring(t.code from '^C-(\d+)$'))::int), 0) + 1 into v_n from wbs_tasks t where t.project_id = p_project and t.code ~ '^C-\d+$';
  insert into wbs_tasks (project_id, phase_no, phase_name, code, title, offset_start, offset_end, start_date, end_date, role, origin_role,
                         status, done_at, linked_deliverable_id, target, direction, partner_id, note, sort_order, assignee_id, group_name, source)
  values (p_project, v_phase, v_phase_name, 'C-' || v_n, v_title, v_start - v_project.event_date, v_end - v_project.event_date, v_start, v_end, v_role, null,
          'todo', null, null, nullif(btrim(coalesce(p_input->>'target', '')), ''), 'internal', null, nullif(btrim(coalesce(p_input->>'note', '')), ''),
          (select coalesce(max(t.sort_order), 0) + 1 from wbs_tasks t where t.project_id = p_project),
          v_assignee, nullif(btrim(coalesce(p_input->>'group_name', '')), ''), 'custom')
  returning * into v_row;
  perform app.write_log(p_project, 'user:' || v_me, 'wbs.task_created', 'wbs_task', v_row.id, jsonb_build_object('code', v_row.code, 'title', v_row.title));
  return v_row;
end $$;
revoke execute on function public.create_wbs_task(uuid, jsonb) from public, anon;
grant execute on function public.create_wbs_task(uuid, jsonb) to authenticated;

-- 5. 행사별(custom) 태스크 지우기(pm) — 템플릿 태스크는 409(재전개가 되살리므로 완료 처리로)
create or replace function public.delete_wbs_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t wbs_tasks%rowtype; v_me uuid;
begin
  select * into v_t from wbs_tasks where id = p_task;
  if not found then raise exception 'NOT_FOUND: WBS 태스크를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_pm(v_t.project_id);
  perform app.require_writable(v_t.project_id);
  if v_t.source <> 'custom' then
    raise exception 'CONFLICT: 템플릿 태스크는 지울 수 없습니다 — 완료 처리로 정리하세요(재전개가 되살립니다).' using errcode = 'P0409';
  end if;
  delete from wbs_tasks where id = p_task;
  perform app.write_log(v_t.project_id, 'user:' || v_me, 'wbs.task_deleted', 'wbs_task', v_t.id, jsonb_build_object('code', v_t.code, 'title', v_t.title));
end $$;
revoke execute on function public.delete_wbs_task(uuid) from public, anon;
grant execute on function public.delete_wbs_task(uuid) to authenticated;

-- 6. R&R 카드 편집(pm) — 제목·책임·사람. 사람 = 주소록(profiles)에 있는 사람만 · 같은 사람 두 번 금지 · 표시 역할 공백 정리(빈 문구 허용)
create or replace function public.update_role_charter(p_charter uuid, p_patch jsonb)
returns role_charters language plpgsql security definer set search_path = public as $$
declare
  v_c role_charters%rowtype;
  v_me uuid;
  v_changed text[] := '{}';
  v_text text;
  v_items jsonb;
  v_people jsonb;
  v_el jsonb;
  v_pid uuid;
  v_seen uuid[] := '{}';
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'VALIDATION: 고칠 내용을 보내 주세요.' using errcode = 'P0422';
  end if;
  select * into v_c from role_charters where id = p_charter;
  if not found then raise exception 'NOT_FOUND: R&R 카드를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_pm(v_c.project_id);
  perform app.require_writable(v_c.project_id);

  if p_patch ? 'title' then
    v_text := btrim(coalesce(p_patch->>'title', ''));
    if v_text = '' then raise exception 'VALIDATION: R&R 카드 제목은 필수입니다.' using errcode = 'P0422'; end if;
    if v_text is distinct from v_c.title then v_c.title := v_text; v_changed := array_append(v_changed, 'title'); end if;
  end if;

  if p_patch ? 'items' then
    if jsonb_typeof(p_patch->'items') <> 'array' then raise exception 'VALIDATION: 책임 목록이 올바르지 않습니다.' using errcode = 'P0422'; end if;
    select coalesce(jsonb_agg(to_jsonb(btrim(x.v))), '[]'::jsonb) into v_items
    from jsonb_array_elements_text(p_patch->'items') as x(v) where btrim(x.v) <> '';
    v_c.items := v_items; v_changed := array_append(v_changed, 'items');
  end if;

  if p_patch ? 'people' then
    if jsonb_typeof(p_patch->'people') = 'null' then
      v_people := null;
    elsif jsonb_typeof(p_patch->'people') = 'array' then
      v_people := '[]'::jsonb;
      for v_el in select * from jsonb_array_elements(p_patch->'people') loop
        if jsonb_typeof(v_el) <> 'object' or coalesce(v_el->>'person_id', '') !~ '^[0-9a-fA-F-]{36}$' then
          raise exception 'VALIDATION: 주소록에 없는 사람입니다.' using errcode = 'P0422';
        end if;
        v_pid := (v_el->>'person_id')::uuid;
        if not exists (select 1 from profiles p where p.id = v_pid) then
          raise exception 'VALIDATION: 주소록에 없는 사람입니다.' using errcode = 'P0422';
        end if;
        if v_pid = any (v_seen) then raise exception 'VALIDATION: 같은 사람을 두 번 넣을 수 없습니다.' using errcode = 'P0422'; end if;
        v_seen := array_append(v_seen, v_pid);
        v_people := v_people || jsonb_build_object('person_id', v_pid, 'display_role', btrim(coalesce(v_el->>'display_role', '')));
      end loop;
    else
      raise exception 'VALIDATION: 사람 목록이 올바르지 않습니다.' using errcode = 'P0422';
    end if;
    v_c.people := v_people; v_changed := array_append(v_changed, 'people');
  end if;

  if array_length(v_changed, 1) is null then return v_c; end if;
  update role_charters set title = v_c.title, items = v_c.items, people = v_c.people where id = p_charter returning * into v_c;
  perform app.write_log(v_c.project_id, 'user:' || v_me, 'rr.updated', 'role_charter', v_c.id, jsonb_build_object('role', v_c.role, 'changed', to_jsonb(v_changed)));
  return v_c;
end $$;
revoke execute on function public.update_role_charter(uuid, jsonb) from public, anon;
grant execute on function public.update_role_charter(uuid, jsonb) to authenticated;

-- 7. remove_member — 20260927000600 정의 + 이 행사에서 역할이 하나도 남지 않으면 태스크 배정 해제(배정 대상은 그 행사 멤버만)
create or replace function public.remove_member(p_project uuid, p_member uuid, p_role member_role default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_count int;
begin
  v_me := app.require_pm(p_project);
  perform app.require_writable(p_project);
  select count(*) into v_count from project_members where project_id = p_project and user_id = p_member and (p_role is null or role = p_role);
  if v_count = 0 then raise exception 'NOT_FOUND: 담당자를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  if exists (select 1 from project_members where project_id = p_project and user_id = p_member and role = 'pm' and (p_role is null or p_role = 'pm'))
     and (select count(*) from project_members where project_id = p_project and role = 'pm') <= 1 then
    raise exception 'CONFLICT: 마지막 PM은 삭제할 수 없습니다 — 먼저 다른 PM을 지정하세요.' using errcode = 'P0409';
  end if;
  delete from project_members where project_id = p_project and user_id = p_member and (p_role is null or role = p_role);
  if not exists (select 1 from project_members where project_id = p_project and user_id = p_member) then
    update wbs_tasks set assignee_id = null where project_id = p_project and assignee_id = p_member;
  end if;
  perform app.write_log(p_project, 'user:' || v_me, 'member.removed', 'project', p_project,
    jsonb_build_object('user_id', p_member) || case when p_role is null then '{}'::jsonb else jsonb_build_object('role', p_role) end);
end $$;
revoke execute on function public.remove_member(uuid, uuid, member_role) from public, anon;
grant execute on function public.remove_member(uuid, uuid, member_role) to authenticated;

-- 8. RLS — 태스크 추가·삭제와 R&R 쓰기는 definer RPC 한 경로(정책 부재 + RPC = projects 삭제 전례). update 정책은 그대로
drop policy if exists wbs_tasks_insert on wbs_tasks;
drop policy if exists wbs_tasks_delete on wbs_tasks;
drop policy if exists role_charters_write on role_charters;
