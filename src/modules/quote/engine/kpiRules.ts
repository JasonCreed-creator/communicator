// 모객 KPI 하방비율 (Buffer): 모객 게런티 인원 구간별 KPI 인정 비율.
// S-2 견적 UI에서 공유 (단일 소스).
//
// v2.0 이식 (설계서 §17.1): jsx-easy-shift main 6047834 src/lib/kpiRules.ts — 값·산식 불변.
//
// ※ 본 모듈은 "게런티 → KPI 달성 인정선" 변환만 다룬다.
// ※ "쇼업률"(등록자 중 실제 참석 비율, projects.kpi_show_rate)은 별개 개념 — 본 파일에서 다루지 않음.
//
// 단계 정의:
//   g ≤  50:  0% (1단계) — 최소 인정선 40명 적용 (kpiMinAck = max(40, g))
//   g ≤ 100: 15% (2단계) — 게런티의 85% 이상 모집 시 인정
//   g > 100: 20% (3단계) — 게런티의 80% 이상 모집 시 인정

export const KPI_MIN_FLOOR = 40;

export const kpiDownRatio = (g: number): number =>
  g <= 50 ? 0 : g <= 100 ? 0.15 : 0.20;

export const kpiMinAck = (g: number): number =>
  Math.max(KPI_MIN_FLOOR, Math.ceil(g * (1 - kpiDownRatio(g))));

export const kpiTier = (g: number): 1 | 2 | 3 =>
  g <= 50 ? 1 : g <= 100 ? 2 : 3;

export const KPI_TIER_COLORS = ["#4CAF50", "#FFA000", "#E53935"] as const;

export const kpiAckRatioPercent = (g: number): number =>
  Math.round((1 - kpiDownRatio(g)) * 100);
