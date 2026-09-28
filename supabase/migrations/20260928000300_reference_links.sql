-- ─────────────────────────────────────────────────────────────────────
-- 20260928000300 · 참고 문서 링크 (설계서 v2.21 §27.3 · Phase 6.11 PR-B, 2026-09-28 — 마스터 시트 대체 묶음 B)
--
--   · projects.reference_links — [{kind kickoff|request|proposal|contract|other, title, url, added_at}] · https 주소만 · 행사당 상한 20.
--     마스터 시트 '개요' 탭의 킥오프·요청서·제안서·계약 링크 자리. 앱은 링크를 열기만 한다(파일을 읽지 않는다 — 저장소 밖 링크도 된다).
--   · 쓰기 = pm의 projects update(RLS projects_update 그대로) — RPC 0 · 서버 함수 0.
--   · 발주처(client_status·client_queue)·파트너(partner_portal)·랜딩 응답은 열을 고르는 jsonb_build_object라 이 열이 흐르지 않는다(변경 0).
--   · 파괴적 문장 0(열 추가 + 모양 CHECK만) — 운영 DB 적용이 확인 창 없이 지나가게.
-- 금액·연락처는 이 열에 없다(링크·제목·종류·시각뿐).

alter table projects add column if not exists reference_links jsonb;

-- 모양 검사 — 배열 · 원소는 객체 · kind 5종 · url은 https · 상한 20 (앱의 normalizeReferenceLinks와 같은 규칙)
create or replace function app.reference_links_ok(p jsonb)
returns boolean language sql immutable as $$
  select p is null or (
    jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 20
    and not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'object'
         or coalesce(e->>'kind', '') not in ('kickoff', 'request', 'proposal', 'contract', 'other')
         or coalesce(e->>'url', '') !~ '^https://.'
    )
  )
$$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_reference_links_shape') then
    alter table projects add constraint projects_reference_links_shape check (app.reference_links_ok(reference_links));
  end if;
end $$;

comment on column projects.reference_links is 'v2.21 §27.3 참고 문서 링크 [{kind,title,url,added_at}] — https만 · 상한 20 · 내부 화면에만(발주처·파트너·랜딩 0)';

