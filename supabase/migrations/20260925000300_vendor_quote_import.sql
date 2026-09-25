-- ─────────────────────────────────────────────────────────────────────
-- 20260925000300 · 협력사 견적서 불러오기 (설계서 v2.11 §19.5 · Phase 4.7, 2026-09-25 — 묶음 3)
--
-- §19.5 "읽은 결과는 항상 담당자 확인을 거쳐 저장한다 — 파싱 결과를 직접 커밋하지 않는다(오독이 곧 정산 오류)."
--   ① 가져오기(제안) = settlement_imports 한 행(status='parsed' · parsed = 행·부가세 제안 · questions). 앱이 엑셀을 읽어
--      넣는다(표 RLS settlement_imports_write = pm — v2.2에서 이미 열어 둔 자리)
--   ② 확정 = confirm_vendor_quote_import — 고른 행마다 발주 항목(settlement_items, status='ordered', import_id 연결).
--      **금액은 화면이 보낸 값이 아니라 저장된 제안(parsed.rows)에서 읽는다** — 화면은 행 번호·버킷·제목만 고른다.
--      부가세 포함이면 저장 직전 round(v/1.1) 분리 + 원본을 input_amount_raw에(§19.4 — 정수 금액에서 JS Math.round와 같은 값).
--      원가 없는 버킷(s5·rc·ld)은 422(R-S4) · 다른 보드 버킷 422 · 확인 대기(parsed)가 아니면 409 · pm 전용 · 종료 행사 409
--   ③ 원본 보관(Drive, 연결돼 있을 때) — 사용자 JWT로 drive_settlement_file_check(pm·확인 대기) → 서버 함수가 행사 폴더
--      02_견적·정산/협력사 견적서에 올리고 → service 전용 settlement_import_set_file로 기록. 인박스 스캔이 그 원본을 '모르는 파일'로
--      올리지 않게 drive_known_file_ids에 원본 id를 더한다.
-- 활동 로그에는 금액을 싣지 않는다(§19.7 — 파일 이름·건수만).

create or replace function public.confirm_vendor_quote_import(
  p_import uuid, p_vat_included boolean, p_vendor uuid, p_vendor_set boolean, p_rows jsonb
)
returns setof settlement_items language plpgsql security definer set search_path = public as $$
declare
  v_imp settlement_imports;
  v_project uuid;
  v_me uuid;
  v_vendor uuid;
  v_row jsonb;
  v_src jsonb;
  v_idx int;
  v_seen int[] := '{}';
  v_bucket settlement_buckets;
  v_bucket_id uuid;
  v_title text;
  v_amount bigint;
  v_ids uuid[] := '{}';
  v_new uuid;
begin
  select * into v_imp from settlement_imports where id = p_import;
  if not found then raise exception 'NOT_FOUND: 견적서 가져오기를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  select project_id into v_project from settlement_boards where id = v_imp.board_id;
  v_me := app.require_pm(v_project);
  perform app.require_writable(v_project);
  if v_imp.status <> 'parsed' then
    raise exception 'CONFLICT: 이미 확정했거나 버린 견적서입니다 — 다시 불러오세요.' using errcode = 'P0409';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'VALIDATION: 만들 항목이 없습니다 — 한 줄 이상 고르세요.' using errcode = 'P0422';
  end if;
  v_vendor := case when coalesce(p_vendor_set, false) then p_vendor else v_imp.vendor_id end;
  if v_vendor is not null and not exists (select 1 from vendors where id = v_vendor) then
    raise exception 'VALIDATION: 협력사를 찾을 수 없습니다.' using errcode = 'P0422';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    if coalesce(v_row->>'index', '') !~ '^\d+$' then
      raise exception 'VALIDATION: 행 번호가 올바르지 않습니다.' using errcode = 'P0422';
    end if;
    v_idx := (v_row->>'index')::int;
    if v_idx = any (v_seen) then
      raise exception 'VALIDATION: 같은 행을 두 번 보낼 수 없습니다.' using errcode = 'P0422';
    end if;
    v_seen := array_append(v_seen, v_idx);
    select e into v_src from jsonb_array_elements(v_imp.parsed->'rows') e where (e->>'index') = v_idx::text limit 1;
    if v_src is null then
      raise exception 'VALIDATION: 견적서에 없는 행입니다(%번).', v_idx + 1 using errcode = 'P0422';
    end if;
    v_bucket_id := case when (v_row->>'bucket_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then (v_row->>'bucket_id')::uuid end;
    select * into v_bucket from settlement_buckets where id = v_bucket_id;
    if not found or v_bucket.board_id <> v_imp.board_id then
      raise exception 'VALIDATION: 이 정산보드의 버킷이 아닙니다.' using errcode = 'P0422';
    end if;
    if not v_bucket.has_cost then
      raise exception 'VALIDATION: ''%''은 원가가 없는 항목이라 발주·실비를 넣을 수 없습니다.', v_bucket.label using errcode = 'P0422';
    end if;
    v_title := btrim(coalesce(v_row->>'title', v_src->>'title', ''));
    if v_title = '' then raise exception 'VALIDATION: 항목명은 필수입니다.' using errcode = 'P0422'; end if;
    v_amount := (v_src->>'amount')::numeric::bigint;
    insert into settlement_items (
      board_id, bucket_id, title, spec, vendor_id, ordered_amount, input_amount_raw, vat_included_input, status, evidence, import_id
    ) values (
      v_imp.board_id, v_bucket.id, v_title, nullif(btrim(coalesce(v_src->>'spec', '')), ''), v_vendor,
      case when p_vat_included then round(v_amount / 1.1)::bigint else v_amount end,
      case when p_vat_included then v_amount end,
      coalesce(p_vat_included, false), 'ordered', '협력사 견적서 ' || v_imp.file_name, p_import
    ) returning id into v_new;
    v_ids := array_append(v_ids, v_new);
  end loop;

  update settlement_imports set status = 'confirmed', vendor_id = v_vendor where id = p_import;
  perform app.write_log(v_project, 'user:' || v_me, 'settlement.imported', 'settlement_import', p_import,
    jsonb_build_object('file_name', v_imp.file_name, 'count', cardinality(v_ids)));
  return query
    select s.* from unnest(v_ids) with ordinality u(id, n) join settlement_items s on s.id = u.id order by u.n;
end $$;
revoke execute on function public.confirm_vendor_quote_import(uuid, boolean, uuid, boolean, jsonb) from public, anon;
grant execute on function public.confirm_vendor_quote_import(uuid, boolean, uuid, boolean, jsonb) to authenticated;

-- 원본 보관 판정(사용자 JWT) — 그 행사 pm · 확인 대기 · 종료 행사 아님. 폴더 경로에 필요한 값만(금액 없음)
create or replace function public.drive_settlement_file_check(p_import uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_imp settlement_imports; v_p projects;
begin
  select * into v_imp from settlement_imports where id = p_import;
  if not found then raise exception 'NOT_FOUND: 견적서 가져오기를 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  select p.* into v_p from projects p join settlement_boards b on b.project_id = p.id where b.id = v_imp.board_id;
  perform app.require_pm(v_p.id);
  perform app.require_writable(v_p.id);
  if v_imp.status <> 'parsed' then
    raise exception 'CONFLICT: 이미 확정했거나 버린 견적서입니다 — 다시 불러오세요.' using errcode = 'P0409';
  end if;
  return jsonb_build_object(
    'import_id', v_imp.id, 'file_name', v_imp.file_name,
    'project', jsonb_build_object('id', v_p.id, 'code', v_p.code, 'name', v_p.name, 'event_date', v_p.event_date,
                                  'status', v_p.status, 'drive_root_folder_id', v_p.drive_root_folder_id));
end $$;
revoke execute on function public.drive_settlement_file_check(uuid) from public, anon;
grant execute on function public.drive_settlement_file_check(uuid) to authenticated;

-- 원본 파일 id 기록(service 전용 — 서버 함수가 Drive에 올린 뒤)
create or replace function public.settlement_import_set_file(p_import uuid, p_file text)
returns void language sql security definer set search_path = public as $$
  update settlement_imports set drive_file_id = p_file where id = p_import;
$$;
revoke execute on function public.settlement_import_set_file(uuid, text) from public, anon, authenticated;
grant execute on function public.settlement_import_set_file(uuid, text) to service_role;

-- 인박스 대조(20260924000100_drive.sql 재정의): 버전 + 인박스 + **정산 가져오기 원본** — 앱이 보관한 협력사 견적서가
-- 02_견적·정산 스캔에서 '모르는 파일'로 인박스에 뜨지 않게
create or replace function public.drive_known_file_ids(p_project uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x), '{}') from (
    select v.drive_file_id as x from versions v join deliverables d on d.id = v.deliverable_id where d.project_id = p_project
    union
    select u.drive_file_id from unregistered_files u where u.project_id = p_project
    union
    select i.drive_file_id from settlement_imports i join settlement_boards b on b.id = i.board_id
    where b.project_id = p_project and i.drive_file_id is not null
  ) s
$$;
revoke execute on function public.drive_known_file_ids(uuid) from public, anon, authenticated;
grant execute on function public.drive_known_file_ids(uuid) to service_role;
