-- ─────────────────────────────────────────────────────────────────────
-- 20260925000100 · 항목 고치기·지우기 (설계서 v2.10 §8 · Phase 4.5, 2026-09-25)
-- 사용자 지시 "이미 등록한 항목을 수정/삭제하는 기능도 만들어야 함 — 지금은 항목추가로 쌓이기만 해".
-- 둘 다 security definer RPC다(DataProvider v14 updateDeliverable·deleteDeliverable).
--   update_deliverable — 표 RLS(deliverables_update = can_write_area)는 열 단위 권한을 가르지 못한다. 담당자·가이드는 PM 전용이고,
--     정형 문서(큐시트·시나리오·운영가이드) 종류 변경 금지·담당자 멤버 검사를 이 한 곳에서 판정한다. 상태 열은 건드리지 않는다
--     (전이는 §5 전이표 경로만).
--   delete_deliverable — unregistered_files.linked_deliverable_id FK(on delete 규칙 없음)가 맨 DELETE를 막는다. 인박스 연결을
--     닫고(dismissed) 같은 트랜잭션에서 지운다. 버전 파일은 처리됨 인박스 행으로 남겨 스캔이 다시 올리지 않게 한다.
--     버전·컨펌·코멘트·큐·시나리오 블록·가이드 섹션은 FK cascade, WBS 연결은 set null.
--     반환값의 drive_folder_id로 앱이 Drive 항목 폴더를 행사 99_archive로 옮긴다(파일은 지우지 않는다).
--   PM만 지운다 · 모든 상태(사용자 결정 2026-09-25 — 화면이 항목 이름 입력으로 확인) · 종료 행사는 둘 다 409.

create or replace function public.update_deliverable(p_deliverable uuid, p_patch jsonb)
returns deliverables language plpgsql security definer set search_path = public as $$
declare
  v_d deliverables%rowtype;
  v_me uuid;
  v_changed text[] := '{}';
  v_text text;
  v_refs jsonb;
  v_qty int;
  v_structured constant text[] := array['큐시트', '시나리오', '운영가이드'];
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'VALIDATION: 고칠 내용을 보내 주세요.' using errcode = 'P0422';
  end if;
  select * into v_d from deliverables where id = p_deliverable;
  if not found then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.current_profile_id();
  if v_me is null then raise exception 'FORBIDDEN: 로그인이 필요합니다.' using errcode = 'P0403'; end if;
  if not app.can_write_area(v_d.project_id, v_d.area) then
    raise exception 'FORBIDDEN: 이 항목을 고칠 권한이 없습니다(PM 또는 해당 영역 담당).' using errcode = 'P0403';
  end if;
  perform app.require_writable(v_d.project_id);
  if not app.is_pm(v_d.project_id)
     and p_patch ?| array['assignee_id', 'brief', 'brief_refs', 'spec_size', 'spec_qty', 'spec_location', 'spec_type'] then
    raise exception 'FORBIDDEN: 담당자·가이드는 PM만 고칠 수 있습니다.' using errcode = 'P0403';
  end if;

  if p_patch ? 'title' then
    v_text := btrim(coalesce(p_patch->>'title', ''));
    if v_text = '' then raise exception 'VALIDATION: 제목은 비울 수 없습니다.' using errcode = 'P0422'; end if;
    if v_text is distinct from v_d.title then v_d.title := v_text; v_changed := array_append(v_changed, 'title'); end if;
  end if;

  if p_patch ? 'category' then
    v_text := btrim(coalesce(p_patch->>'category', ''));
    if v_text = '' then raise exception 'VALIDATION: 카테고리는 비울 수 없습니다.' using errcode = 'P0422'; end if;
    if v_text is distinct from v_d.category then
      if v_d.category = any(v_structured) or v_text = any(v_structured) then
        raise exception 'CONFLICT: 큐시트·시나리오·운영가이드 항목은 종류를 바꿀 수 없습니다 — 새 항목으로 만드세요.' using errcode = 'P0409';
      end if;
      v_d.category := v_text; v_changed := array_append(v_changed, 'category');
    end if;
  end if;

  if p_patch ? 'due_date' then
    v_text := p_patch->>'due_date';
    if v_text is not null and v_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'VALIDATION: 마감일 형식이 올바르지 않습니다(YYYY-MM-DD).' using errcode = 'P0422';
    end if;
    if v_text::date is distinct from v_d.due_date then v_d.due_date := v_text::date; v_changed := array_append(v_changed, 'due_date'); end if;
  end if;

  if p_patch ? 'assignee_id' then
    v_text := p_patch->>'assignee_id';
    if v_text is not null and (
      v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not exists (select 1 from project_members where project_id = v_d.project_id and user_id = v_text::uuid)
    ) then
      raise exception 'VALIDATION: 담당자는 이 행사 멤버여야 합니다.' using errcode = 'P0422';
    end if;
    if v_text::uuid is distinct from v_d.assignee_id then
      v_d.assignee_id := v_text::uuid; v_changed := array_append(v_changed, 'assignee_id');
    end if;
  end if;

  if p_patch ? 'brief' then
    v_text := nullif(btrim(coalesce(p_patch->>'brief', '')), '');
    if v_text is distinct from v_d.brief then v_d.brief := v_text; v_changed := array_append(v_changed, 'brief'); end if;
  end if;
  if p_patch ? 'brief_refs' then
    v_refs := case
      when jsonb_typeof(p_patch->'brief_refs') = 'array' and jsonb_array_length(p_patch->'brief_refs') > 0 then p_patch->'brief_refs'
    end;
    if v_refs is distinct from v_d.brief_refs then v_d.brief_refs := v_refs; v_changed := array_append(v_changed, 'brief_refs'); end if;
  end if;
  if p_patch ? 'spec_size' then
    v_text := nullif(btrim(coalesce(p_patch->>'spec_size', '')), '');
    if v_text is distinct from v_d.spec_size then v_d.spec_size := v_text; v_changed := array_append(v_changed, 'spec_size'); end if;
  end if;
  if p_patch ? 'spec_qty' then
    if jsonb_typeof(p_patch->'spec_qty') not in ('number', 'null')
       or (jsonb_typeof(p_patch->'spec_qty') = 'number'
           and ((p_patch->>'spec_qty')::numeric < 0 or (p_patch->>'spec_qty')::numeric <> trunc((p_patch->>'spec_qty')::numeric))) then
      raise exception 'VALIDATION: 수량은 0 이상의 정수여야 합니다.' using errcode = 'P0422';
    end if;
    v_qty := case when jsonb_typeof(p_patch->'spec_qty') = 'number' then (p_patch->>'spec_qty')::numeric::int end;
    if v_qty is distinct from v_d.spec_qty then v_d.spec_qty := v_qty; v_changed := array_append(v_changed, 'spec_qty'); end if;
  end if;
  if p_patch ? 'spec_location' then
    v_text := nullif(btrim(coalesce(p_patch->>'spec_location', '')), '');
    if v_text is distinct from v_d.spec_location then v_d.spec_location := v_text; v_changed := array_append(v_changed, 'spec_location'); end if;
  end if;
  if p_patch ? 'spec_type' then
    v_text := nullif(btrim(coalesce(p_patch->>'spec_type', '')), '');
    if v_text is distinct from v_d.spec_type then v_d.spec_type := v_text; v_changed := array_append(v_changed, 'spec_type'); end if;
  end if;

  if coalesce(array_length(v_changed, 1), 0) = 0 then return v_d; end if;

  update deliverables set
    title = v_d.title, category = v_d.category, due_date = v_d.due_date, assignee_id = v_d.assignee_id,
    brief = v_d.brief, brief_refs = v_d.brief_refs, spec_size = v_d.spec_size, spec_qty = v_d.spec_qty,
    spec_location = v_d.spec_location, spec_type = v_d.spec_type
  where id = p_deliverable
  returning * into v_d;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'deliverable.updated', 'deliverable', p_deliverable,
    jsonb_build_object('fields', to_jsonb(v_changed)));
  return v_d;
end $$;
revoke execute on function public.update_deliverable(uuid, jsonb) from public, anon;
grant execute on function public.update_deliverable(uuid, jsonb) to authenticated;

create or replace function public.delete_deliverable(p_deliverable uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_d deliverables%rowtype;
  v_me uuid;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if not found then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_pm(v_d.project_id);
  perform app.require_writable(v_d.project_id);
  -- 이 항목의 버전으로 등록된 직접 업로드 파일 — 항목 폴더는 보관(99_archive)되므로 인박스에 다시 띄우지 않는다
  update unregistered_files set linked_deliverable_id = null, dismissed = true where linked_deliverable_id = p_deliverable;
  -- 버전 파일 중 행사 폴더의 다른 자리에 있는 것(링크 등록 = 제자리 참조 · 공통 영역 = 파트 폴더)은 보관되지 않는다.
  -- 버전이 지워지면 스캔이 그 파일을 '처음 보는 파일'로 인박스에 다시 올리므로, 처리됨(dismissed) 행으로 남겨 아는 파일로 둔다.
  insert into unregistered_files (project_id, drive_file_id, file_name, detected_folder, dismissed)
  select distinct on (v.drive_file_id) v_d.project_id, v.drive_file_id, v.file_name, '삭제된 항목: ' || v_d.title, true
  from versions v
  where v.deliverable_id = p_deliverable and not starts_with(v.drive_file_id, 'pending:')
  on conflict (drive_file_id) do nothing;
  delete from deliverables where id = p_deliverable;
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'deliverable.deleted', 'deliverable', p_deliverable,
    jsonb_build_object('title', v_d.title, 'category', v_d.category, 'area', v_d.area, 'status', v_d.status));
  return jsonb_build_object(
    'id', v_d.id, 'project_id', v_d.project_id, 'area', v_d.area, 'title', v_d.title, 'drive_folder_id', v_d.drive_folder_id
  );
end $$;
revoke execute on function public.delete_deliverable(uuid) from public, anon;
grant execute on function public.delete_deliverable(uuid) to authenticated;
