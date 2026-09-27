# Phase 6.10 초안 보관 — Drive 분류 폴더(보관 분류) — 구현 보류

- 상태: **설계 승인(2026-09-27 밤 버튼 3건) · 구현 보류** — 기획자님 결정 "마스터 시트 대체(Phase 6.11) 뒤에 재개".
- 승인된 설계: 저장소 루트 = 팀 `MICE Biz` 폴더(Vercel `DRIVE_ROOT_FOLDER_ID` 교체 — 기획자님 몫) → 분류 폴더 4개(일반·자체·모객·비모객, 이미 있음)
  → `YYMMDD_고객사_행사명`(행사 ID) → 파트 6종. 연도 층(v2.17)은 퇴역.
  분류 판정 = **자동 + 설정 ③에서 고침**(주최형 → 자체행사 · 대행형+모객형 → MICE Solution(모객) · 대행형+일반형 → MICE Solution(비모객) ·
  일반행사(Customized)는 고를 때만) · 기존 팀 폴더 = **채택**(설정 ③ 기존 폴더 지정 → 행사 ID로 개명 + 빠진 파트 생성 · 앱이 만든 옛 폴더는 손대지 않음).
- 이 폴더의 두 파일은 **레포 코드가 아니다**(`.txt`) — 재개할 때 `src/lib/driveCategory.ts`·`supabase/migrations/…_drive_category.sql`로 되돌리고
  마이그레이션 번호를 그때의 다음 번호로 바꾼다(6.11이 33~35번째를 쓴다). `supabase-schema.test.ts` ①(setup.sql = migrations 결합)이 있어 migrations 폴더에 그대로 두면 실패한다.
- 남은 구현(초안에 없음): `api/_lib/drive/store.ts`(ProjectRow += kind·event_type·drive_category · `setProjectDriveCategory`) · `tree.ts`(분류 폴더 층 · `syncProjectRootPlacement` 분류 이동 · 채택 시 분류 역추론) ·
  `service.ts`(채택 422 문구 '분류 폴더') · 타입·provider 2종(`drive_category` 패치 + ensureTree 트리거) · DriveCard 보관 분류 셀렉트·트리 문구 · 테스트(dod61/86/90 갱신 + 새 DoD) · 설계서 §7.1 개정 · `setup.sql` 재생성.
- 폴더 이름 4개에 회사명이 들어간다(#RULE-NO-COMPANY 예외 — 사용자 제공 실물 폴더 이름). 코드에 옮길 때 그 주석을 유지한다.
