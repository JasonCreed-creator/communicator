-- ═══════════════════════════════════════════════════════════════════════════
-- 23. 운영가이드 현장 운영 섹션 — 설계서 v2.13 §23.5 (Phase 3.24 PR-A, 2026-09-26)
--   · guide_sections.data jsonb  — 표로 채우는 섹션의 데이터(type = kind). content는 앱이 data에서 만든 글
--   · kind 9종 추가  — setup·staffing·radio·raci·dayplan·checklists·registration·vip·safety
--   · 모양 검사  — data는 객체 · data.type = kind · 표 섹션 9종은 data 필수 · emergency는 선택(옛 문서 = 마크다운)
--   · save_guide_sections  — data 열을 함께 저장(권한·종료 가드·로그는 그대로)
-- 기존 행(zone·role·emergency·contacts·custom, data 없음)은 그대로 통과한다. 두 번 실행해도 같다.
-- ═══════════════════════════════════════════════════════════════════════════

alter table guide_sections add column if not exists data jsonb;

alter table guide_sections drop constraint if exists guide_sections_kind_check;
alter table guide_sections add constraint guide_sections_kind_check check (kind in (
  'zone','role','emergency','contacts','custom',
  'setup','staffing','radio','raci','dayplan','checklists','registration','vip','safety'
));

alter table guide_sections drop constraint if exists guide_sections_data_shape;
alter table guide_sections add constraint guide_sections_data_shape check (
  case
    when kind in ('setup','staffing','radio','raci','dayplan','checklists','registration','vip','safety')
      then data is not null and jsonb_typeof(data) = 'object' and data->>'type' = kind
    when kind = 'emergency'
      then data is null or (jsonb_typeof(data) = 'object' and data->>'type' = 'emergency')
    else data is null
  end
);

create or replace function public.save_guide_sections(p_deliverable uuid, p_sections jsonb)
returns setof guide_sections language plpgsql security definer set search_path = public as $$
declare v_d deliverables; v_me uuid;
begin
  select * into v_d from deliverables where id = p_deliverable;
  if v_d.id is null then raise exception 'NOT_FOUND: 항목을 찾을 수 없습니다.' using errcode = 'P0404'; end if;
  v_me := app.require_roles(v_d.project_id, '이 편집은 PM·운영 담당만 가능합니다.', 'pm', 'ops');
  if v_d.category <> '운영가이드' then raise exception 'CONFLICT: 운영가이드 항목이 아닙니다.' using errcode = 'P0409'; end if;
  perform app.require_writable(v_d.project_id);
  delete from guide_sections where deliverable_id = p_deliverable;
  insert into guide_sections (id, deliverable_id, kind, title, content, source_ref, source_stale, sort_order, data)
  select coalesce((e->>'id')::uuid, gen_random_uuid()), p_deliverable, e->>'kind', e->>'title', e->>'content', e->>'source_ref',
         coalesce((e->>'source_stale')::boolean, false), ord::int,
         case when jsonb_typeof(e->'data') = 'object' then e->'data' else null end
  from jsonb_array_elements(p_sections) with ordinality as x(e, ord);
  perform app.write_log(v_d.project_id, 'user:' || v_me, 'guide.saved', 'deliverable', p_deliverable, jsonb_build_object('count', jsonb_array_length(p_sections)));
  return query select * from guide_sections where deliverable_id = p_deliverable order by sort_order;
end $$;
revoke execute on function public.save_guide_sections(uuid, jsonb) from public, anon;
grant execute on function public.save_guide_sections(uuid, jsonb) to authenticated;
