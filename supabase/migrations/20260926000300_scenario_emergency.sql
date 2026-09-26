-- ═══════════════════════════════════════════════════════════════════════════
-- 24. 시나리오 비상 예비 멘트 — 설계서 v2.13 §23.6 (Phase 3.24 PR-B, 2026-09-26)
--   · scenario_blocks.kind에 'emergency' 추가 — 세션과 무관하게 현장에서 무대감독 콜이 오면 읽는 멘트
--     (상황 이름 = note · 멘트 = script · session_id·time은 비워 둔다 — 앱이 그렇게 만든다)
-- 표·함수·권한은 그대로다(save_scenario_blocks는 kind를 검사하지 않고 표 CHECK에 맡긴다). 기존 행은 그대로 통과한다.
-- 두 번 실행해도 같다.
-- ═══════════════════════════════════════════════════════════════════════════

alter table scenario_blocks drop constraint if exists scenario_blocks_kind_check;
alter table scenario_blocks add constraint scenario_blocks_kind_check check (kind in (
  'mc','video','protocol','transition','custom','emergency'
));
