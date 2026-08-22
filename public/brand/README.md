# 브랜드 자산

디자인지시서 v1 §7 (`docs/mice-communicator-디자인지시서-v1.md`) 기준.

- `remember-logo-offwhite.png` — 사이드바·다크 바 등 다크 컨텍스트 전용
- `remember-logo-black.png` — 라이트 컨텍스트·인쇄 전용
- 높이 20~24px로만 스케일한다. 비율 왜곡·재염색 금지.
- 두 자산 모두 `BrandLogo` 컴포넌트(variant='offwhite'|'black')를 통해서만 사용하며,
  이미지 로드 실패 시에만 텍스트 워드마크로 폴백한다.
