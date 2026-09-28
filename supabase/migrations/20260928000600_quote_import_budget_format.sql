-- ─────────────────────────────────────────────────────────────────────
-- 20260928000600 · 견적서 가져오기 P형(예산 워크북) (설계서 v2.22.1 §22.1 · Phase 6.19, 2026-09-28 —
--   기획자님 #8 "다양한 견적서 형태를 파악하고 뿌릴 수 있도록" · 실파일 5종 실측: 주최형 워킹버짓(수입·지출 시트)은 견적서가 아니라
--   예산이라 '현금흐름' 시트를 견적으로 읽어 한 덩어리가 됐다)
--
--   · quote_imports.format — 'P' 허용(예산 워크북: '기준안' 열이 금액 · 구분 A~J가 섹션 · 수입 표는 parsed.revenue에 기록만)
--   · 표·정책·권한·RPC 불변 · 파괴적 문장 0(CHECK 재정의만 — 옛 행 'A|B|C|ai' 그대로 유효)

alter table quote_imports drop constraint if exists quote_imports_format_check;
alter table quote_imports add constraint quote_imports_format_check check (format in ('A','B','C','P','ai'));
