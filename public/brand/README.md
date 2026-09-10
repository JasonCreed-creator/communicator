# 브랜드 자산

디자인지시서 v1 §7 (`docs/mice-communicator-디자인지시서-v1.md`) 기준.

- `remember-logo-offwhite.png` — 사이드바·다크 바 등 다크 컨텍스트 전용
- `remember-logo-black.png` — 라이트 컨텍스트·인쇄 전용
- 높이 20~24px로만 스케일한다. 비율 왜곡·재염색 금지.
- 두 자산 모두 `BrandLogo` 컴포넌트(variant='offwhite'|'black')를 통해서만 사용하며,
  이미지 로드 실패 시에만 텍스트 워드마크로 폴백한다.

## 직인 (견적서 전용 — 2026-09-10)

- `remember-seal.png` — 견적서(Excel·구글 시트) 공급자 행의 **"(인)" 칸 위에 자동 삽입**된다(`exportEstimate.ts`).
  파일이 없으면 직인 없이 "(인)" 글자만 나가고, **이 경로에 파일을 넣는 순간 다음 내보내기부터 반영**된다(코드 수정 불요).
- 규격: **정사각형 PNG, 투명 배경**, 300×300px 이상(렌더 크기 60px ≈ 16mm — 여백 없이 도장 외곽선까지 꽉 차게 자를 것).
  JPG(흰 배경)는 "(인)" 글자를 가리므로 쓰지 않는다.
- 데모 아티팩트는 이 파일도 빌드 시 인라인한다(`demo/plugins.ts`) — 없으면 빈 data: URI로 대체돼 직인 미삽입.
- 검증: `src/modules/quote/__tests__/exportEstimate.test.ts` "리멤버 기본 레이아웃 직인" — H7 중심 앵커(60×60px).

