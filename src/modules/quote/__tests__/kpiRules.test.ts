// v2.0 이식: jsx-easy-shift main 6047834 src/lib/__tests__/kpiRules.test.ts — 케이스 불변.
import { describe, it, expect } from "vitest";
import {
  kpiDownRatio,
  kpiMinAck,
  kpiTier,
  KPI_TIER_COLORS,
  kpiAckRatioPercent,
  KPI_MIN_FLOOR,
} from "../engine/kpiRules";

/**
 * Golden tests for KPI 하방비율 (모객 보장 인원 기반).
 *
 * 단계 정의 (kpiRules.ts):
 *   g ≤  50: 0%  (1단계 green) — kpiMinAck = max(40, g)
 *   g ≤ 100: 15% (2단계 amber) — kpiMinAck = max(40, ceil(g × 0.85))
 *   g > 100: 20% (3단계 red)   — kpiMinAck = max(40, ceil(g × 0.80))
 *
 * 본 테스트는 회귀 방지용 lock. 비즈니스 룰 변경 시 의도적 갱신 필요.
 */

describe("kpiDownRatio", () => {
  it.each([
    { g: 0, expected: 0 },
    { g: 40, expected: 0 },
    { g: 50, expected: 0 },
    { g: 51, expected: 0.15 },
    { g: 80, expected: 0.15 },
    { g: 100, expected: 0.15 },
    { g: 101, expected: 0.20 },
    { g: 200, expected: 0.20 },
    { g: 500, expected: 0.20 },
  ])("g=$g → ratio=$expected", ({ g, expected }) => {
    expect(kpiDownRatio(g)).toBe(expected);
  });
});

describe("kpiMinAck (실제 KPI 달성선)", () => {
  it.each([
    // 1단계 (0% 하방): kpiMinAck = max(40, g)
    { g: 0, expected: 40 },
    { g: 39, expected: 40 },
    { g: 40, expected: 40 },
    { g: 45, expected: 45 },
    { g: 50, expected: 50 },
    // 2단계 (15% 하방): kpiMinAck = max(40, ceil(g × 0.85))
    { g: 51, expected: 44 }, // ceil(43.35) = 44
    { g: 60, expected: 51 }, // ceil(51) = 51
    { g: 80, expected: 68 }, // ceil(68) = 68
    { g: 100, expected: 85 }, // ceil(85) = 85
    // 3단계 (20% 하방): kpiMinAck = max(40, ceil(g × 0.80))
    { g: 101, expected: 81 }, // ceil(80.8) = 81
    { g: 150, expected: 120 }, // ceil(120) = 120
    { g: 200, expected: 160 },
    { g: 300, expected: 240 },
    { g: 500, expected: 400 },
  ])("g=$g → kpiMinAck=$expected", ({ g, expected }) => {
    expect(kpiMinAck(g)).toBe(expected);
  });

  it("항상 KPI_MIN_FLOOR(40) 이상", () => {
    for (let g = 0; g <= 500; g++) {
      expect(kpiMinAck(g)).toBeGreaterThanOrEqual(KPI_MIN_FLOOR);
    }
  });
});

describe("kpiTier", () => {
  it.each([
    { g: 0, expected: 1 },
    { g: 40, expected: 1 },
    { g: 50, expected: 1 },
    { g: 51, expected: 2 },
    { g: 100, expected: 2 },
    { g: 101, expected: 3 },
    { g: 500, expected: 3 },
  ])("g=$g → tier=$expected", ({ g, expected }) => {
    expect(kpiTier(g)).toBe(expected);
  });
});

describe("kpiAckRatioPercent", () => {
  it.each([
    { g: 40, expected: 100 },
    { g: 50, expected: 100 },
    { g: 80, expected: 85 },
    { g: 100, expected: 85 },
    { g: 101, expected: 80 },
    { g: 200, expected: 80 },
  ])("g=$g → ratio%=$expected", ({ g, expected }) => {
    expect(kpiAckRatioPercent(g)).toBe(expected);
  });
});

describe("KPI_TIER_COLORS", () => {
  it("3개 컬러 frozen 배열", () => {
    expect(KPI_TIER_COLORS).toHaveLength(3);
    expect(KPI_TIER_COLORS[0]).toBe("#4CAF50"); // green (1단계)
    expect(KPI_TIER_COLORS[1]).toBe("#FFA000"); // amber (2단계)
    expect(KPI_TIER_COLORS[2]).toBe("#E53935"); // red (3단계)
  });

  it("tier 인덱스(1~3) → 컬러 매핑 정합", () => {
    for (const g of [40, 80, 150]) {
      const tier = kpiTier(g);
      expect(KPI_TIER_COLORS[tier - 1]).toBeDefined();
    }
  });
});

describe("known non-monotonic boundaries (current spec, intentional)", () => {
  // 단계 경계에서 kpiMinAck이 감소하는 known issue.
  // 비즈니스 룰 변경 시 본 테스트는 의도적으로 깨질 것.
  it("g=50 → 50명, g=51 → 44명 (6 감소)", () => {
    expect(kpiMinAck(50)).toBe(50);
    expect(kpiMinAck(51)).toBe(44);
  });

  it("g=100 → 85명, g=101 → 81명 (4 감소)", () => {
    expect(kpiMinAck(100)).toBe(85);
    expect(kpiMinAck(101)).toBe(81);
  });
});
