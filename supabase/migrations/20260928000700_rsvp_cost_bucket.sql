-- ─────────────────────────────────────────────────────────────────────
-- 20260928000700 · 정산 RSVP 운영비(rc) = 원가 버킷 (설계서 v2.22.2 §19.1·§19.2 · Phase 6.18, 2026-09-28 —
--   기획자님 #7 "정산에서 RSVP에 소요되는 비용도 발주처럼 만들어줄 것")
--
--   · 기존 보드의 rc 버킷 has_cost=false → true (발주·실비 입력 허용 · 트리거 app.guard_settlement_item_cost는 그대로 플래그를 읽는다 ·
--     새 보드는 앱 스냅숏(quoteBucketSpec)이 처음부터 true로 만든다)
--   · 마진 식 불변 — 실비가 없으면 마크업 = 견적액 전액(전과 같은 값) · 금액·항목·정책·RPC 불변 · 파괴적 문장 0(플래그 갱신 1문장)

update settlement_buckets set has_cost = true where code = 'rc' and has_cost = false;
