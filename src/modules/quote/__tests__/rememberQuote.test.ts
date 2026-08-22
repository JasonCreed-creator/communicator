// 견적 컨피규레이터 — 모객 포함/제외 모드 정합성.
// 가격 엔진(calcEstimate.ts)은 무변경이며, 토글은 guarantee 오버라이드만 사용한다.
// v2.0 이식: jsx-easy-shift main 6047834 src/lib/__tests__/rememberQuote.test.ts — 케이스 불변.
import { describe, it, expect } from "vitest";
import { calcEstimate, calcMncEstimate, applyAdjustments } from "../engine/calcEstimate";
import { computeQuote, buildCalcInput, effectiveAdjust } from "../engine/quoteMode";

const baseCfg = (over: Record<string, unknown> = {}) => ({
  target: 100,
  guarantee: 80,
  venueRental: null as number | null,
  options: {},
  boothCount: 0,
  ...over,
});

describe("computeQuote — 모객 포함 모드", () => {
  it("총액이 calcEstimate(cfg).pk와 동일하다", () => {
    const cfg = baseCfg();
    expect(computeQuote(cfg, true).pk).toBe(calcEstimate(cfg).pk);
  });

  it("게런티 기반 모객 값(rsvpPkg·showup·leadPkg)이 그대로 산정된다", () => {
    const cfg = baseCfg({ guarantee: 60 });
    const q = computeQuote(cfg, true);
    const e = calcEstimate(cfg);
    expect(q.rsvpPkg).toBe(e.rsvpPkg);
    expect(q.showup).toBe(e.showup);
    expect(q.leadPkg).toBe(e.leadPkg);
    expect(q.leadPkg).toBeGreaterThan(0);
  });
});

describe("computeQuote — 모객 제외 모드", () => {
  it("총액이 calcEstimate({...cfg, guarantee:0}).pk와 동일하다", () => {
    const cfg = baseCfg();
    expect(computeQuote(cfg, false).pk).toBe(calcEstimate({ ...cfg, guarantee: 0 }).pk);
  });

  it("calcMncEstimate와 산식 경로가 동일하다 (엔진 wrapper 재사용 증명)", () => {
    for (const target of [40, 100, 250, 500]) {
      const cfg = baseCfg({ target, guarantee: Math.min(80, target) });
      const q = computeQuote(cfg, false);
      const m = calcMncEstimate(cfg);
      expect(q.pk).toBe(m.pk);
      expect(q.s5).toBe(m.s5);
      expect(q.opCost).toBe(m.opCost);
    }
  });

  it("모객 비용이 전부 0이 된다", () => {
    const q = computeQuote(baseCfg(), false);
    expect(q.rsvpPkg).toBe(0);
    expect(q.showup).toBe(0);
    expect(q.leadPkg).toBe(0);
  });

  it("buildCalcInput은 원본 cfg를 변형하지 않는다", () => {
    const cfg = baseCfg({ guarantee: 77 });
    buildCalcInput(cfg, false);
    expect(cfg.guarantee).toBe(77);
  });
});

describe("모드 간 관계", () => {
  it("포함 총액 − 제외 총액 = 모객(leadPkg) + RSVP로 인한 PCO 증가분", () => {
    const cfg = baseCfg();
    const withLeads = computeQuote(cfg, true);
    const pure = computeQuote(cfg, false);
    // pk(포함) = pk(제외) + rsvpPkg + showup + (s5 차이 — RSVP가 운영비에 포함되므로)
    expect(withLeads.pk - pure.pk).toBe(withLeads.rsvpPkg + withLeads.showup + (withLeads.s5 - pure.s5));
  });

  it("TARGET_MAX 초과 시 양 모드 모두 isCustom", () => {
    const cfg = baseCfg({ target: 501 });
    expect(computeQuote(cfg, true).isCustom).toBe(true);
    expect(computeQuote(cfg, false).isCustom).toBe(true);
  });
});

describe("effectiveAdjust — 조정 델타의 모드 정합", () => {
  it("모객 제외 모드에서는 leadPkg 델타를 무효화한다", () => {
    const adjust = { s1: -500_000, leadPkg: 1_000_000 };
    expect(effectiveAdjust(adjust, false)).toEqual({ s1: -500_000 });
    expect(effectiveAdjust(adjust, true)).toEqual(adjust);
  });

  it("제외 모드 총액에 leadPkg 델타가 반영되지 않는다", () => {
    const cfg = baseCfg();
    const p = computeQuote(cfg, false);
    const adjusted = applyAdjustments(p, effectiveAdjust({ leadPkg: 2_000_000 }, false));
    expect(adjusted.pk).toBe(p.pk);
  });

  it("undefined 조정은 빈 객체로 정규화된다", () => {
    expect(effectiveAdjust(undefined, false)).toEqual({});
    expect(effectiveAdjust(undefined, true)).toEqual({});
  });
});
