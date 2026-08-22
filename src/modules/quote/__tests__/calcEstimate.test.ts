// v2.0 이식: jsx-easy-shift main 6047834 src/lib/__tests__/calcEstimate.test.ts — 케이스 불변.
import { describe, it, expect } from "vitest";
import { calcEstimate, calcMncEstimate, calcPkExcludingOptions, applyAdjustments, TARGET_MAX } from "../engine/calcEstimate";

/**
 * Golden tests — 견적서 상단 "추가옵션 제외" 합계 (exportEstimate에서 사용).
 *
 * 불변식: calcPkExcludingOptions(calcEstimate(c))
 *       === calcEstimate({...c, options: {}, boothCount: 0}).pk
 *
 * PCO 기획료(운영비 × 25% · 만원 미만 절사)가 옵션 금액에 연동되므로
 * 단순히 pk - ot 가 아니라 기획료 재계산까지 일치해야 한다.
 */

const ALL_OPTIONS = {
  souvenir: true, emcee: true, photo: false, video: true,
  aving: true, scaler4k: true, survey: true,
  photowall_basic: false, photowall_premium: true,
};

describe("calcPkExcludingOptions", () => {
  const cases = [
    { name: "옵션 없음", cfg: { target: 50, guarantee: 45, options: {}, boothCount: 0 } },
    { name: "소규모 + 전체옵션", cfg: { target: 40, guarantee: 40, options: ALL_OPTIONS, boothCount: 2 } },
    { name: "100명 미만 + scaler4k 옵션", cfg: { target: 80, guarantee: 60, options: { scaler4k: true, emcee: true } } },
    { name: "100명 이상 (scaler4k 시스템 자동포함)", cfg: { target: 150, guarantee: 100, options: { souvenir: true, scaler4k: true }, boothCount: 1 } },
    { name: "샘플 견적 규모 (300명 · 대관료 직접입력)", cfg: { target: 300, guarantee: 80, venueRental: 36_000_000, options: { souvenir: true, emcee: true, video: true }, boothCount: 3 } },
    { name: "최대 규모", cfg: { target: TARGET_MAX, guarantee: 200, options: ALL_OPTIONS, boothCount: 10 } },
  ];

  it.each(cases)("$name — 옵션 제거 후 재계산 견적과 0원 일치", ({ cfg }) => {
    const p = calcEstimate(cfg);
    const noOpt = calcEstimate({ ...cfg, options: {}, boothCount: 0 });
    expect(calcPkExcludingOptions(p)).toBe(noOpt.pk);
  });

  it("옵션이 없으면 풀 견적과 동일", () => {
    const p = calcEstimate({ target: 120, guarantee: 90, options: {}, boothCount: 0 });
    expect(p.ot).toBe(0);
    expect(calcPkExcludingOptions(p)).toBe(p.pk);
  });

  it("옵션이 있으면 풀 견적보다 작다", () => {
    const p = calcEstimate({ target: 100, guarantee: 80, options: { emcee: true }, boothCount: 0 });
    expect(p.ot).toBeGreaterThan(0);
    expect(calcPkExcludingOptions(p)).toBeLessThan(p.pk);
  });

  it("isCustom(별도 협의 모드)이면 0", () => {
    const p = calcEstimate({ target: TARGET_MAX + 1, guarantee: 100, options: ALL_OPTIONS });
    expect(p.isCustom).toBe(true);
    expect(calcPkExcludingOptions(p)).toBe(0);
  });

  it("null/undefined 입력은 0", () => {
    expect(calcPkExcludingOptions(null)).toBe(0);
    expect(calcPkExcludingOptions(undefined)).toBe(0);
  });
});

describe("calcEstimate 합계 불변식 (회귀 잠금)", () => {
  it.each([40, 50, 99, 100, 150, 200, 201, 300, 500])(
    "target=%i — pk = s1+s2+s3+s4+s5+ot+rsvpPkg+showup",
    (target) => {
      const p = calcEstimate({ target, guarantee: Math.min(target, 80), options: ALL_OPTIONS, boothCount: 2 });
      expect(p.pk).toBe(p.s1 + p.s2 + p.s3 + p.s4 + p.s5 + p.ot + p.rsvpPkg + p.showup);
      expect(p.opCost).toBe(p.s1 + p.s2 + p.s3 + p.s4 + p.ot + p.rsvpPkg);
    },
  );

  it("대관료 직접 입력 시 s1은 입력값 그대로 (자동 산정으로 덮어쓰지 않음)", () => {
    const p = calcEstimate({ target: 300, guarantee: 80, venueRental: 36_000_000, options: {} });
    expect(p.s1).toBe(36_000_000);
    expect(p.s1).not.toBe(300 * 180_000);
  });
});

describe("calcMncEstimate — 순수 패키지 (모객·리드 제외)", () => {
  const bases = [
    { target: 50, guarantee: 45, options: {} },
    { target: 120, guarantee: 90, options: { emcee: true }, boothCount: 1 },
    { target: 300, guarantee: 80, venueRental: 36_000_000, options: { souvenir: true, video: true }, boothCount: 3 },
    { target: TARGET_MAX, guarantee: 200, options: { emcee: true, survey: true } },
  ];

  it.each(bases)("모객(RSVP·쇼업·리드젠) 필드가 모두 0", (cfg) => {
    const m = calcMncEstimate(cfg);
    expect(m.rsvpOrig).toBe(0);
    expect(m.rsvpPkg).toBe(0);
    expect(m.showup).toBe(0);
    expect(m.leadOrig).toBe(0);
    expect(m.leadPkg).toBe(0);
    expect(m.g).toBe(0);
  });

  it.each(bases)("총액 = s1+s2+s3+s4+s5+ot (모객 미포함) · PCO는 RSVP 없이 재계산", (cfg) => {
    const m = calcMncEstimate(cfg);
    expect(m.pk).toBe(m.s1 + m.s2 + m.s3 + m.s4 + m.s5 + m.ot);
    expect(m.opCost).toBe(m.s1 + m.s2 + m.s3 + m.s4 + m.ot);
    expect(m.s5).toBe(Math.floor((m.opCost * 0.25) / 10_000) * 10_000);
  });

  it.each(bases)("guarantee를 강제로 0으로 둔 calcEstimate와 완전히 동일", (cfg) => {
    expect(calcMncEstimate(cfg)).toEqual(calcEstimate({ ...cfg, guarantee: 0 }));
  });

  it("guarantee가 있어도 패키지 견적은 게런티 값을 무시한다", () => {
    const a = calcMncEstimate({ target: 100, guarantee: 100, options: {} });
    const b = calcMncEstimate({ target: 100, guarantee: 40, options: {} });
    expect(a.pk).toBe(b.pk);
  });
});

describe("rsvpHandling 옵션 — 전체 참석 × 2만원(게런티 아님)", () => {
  it("옵션 ON 시 ot에 target×20,000이 가산된다", () => {
    const off = calcEstimate({ target: 200, guarantee: 0, options: {} });
    const on = calcEstimate({ target: 200, guarantee: 0, options: { rsvpHandling: true } });
    expect(on.ot - off.ot).toBe(200 * 20_000);
  });

  it("rsvpHandling은 운영비(opCost)에 포함되어 PCO·총액에 연동된다", () => {
    const m = calcMncEstimate({ target: 150, options: { rsvpHandling: true } });
    expect(m.ot).toBe(150 * 20_000);
    expect(m.opCost).toBe(m.s1 + m.s2 + m.s3 + m.s4 + m.ot);
    expect(m.pk).toBe(m.s1 + m.s2 + m.s3 + m.s4 + m.s5 + m.ot);
  });

  it("게런티 기반 rsvpPkg와는 무관 (모객 보장 아님)", () => {
    const m = calcMncEstimate({ target: 100, guarantee: 100, options: { rsvpHandling: true } });
    expect(m.rsvpPkg).toBe(0); // 모객 RSVP는 여전히 0
    expect(m.ot).toBe(100 * 20_000); // 응대 대행만 옵션에 반영
  });
});

describe("applyAdjustments — 섹션별 수동 조정", () => {
  const cfg = { target: 150, guarantee: 100, options: { souvenir: true, emcee: true }, boothCount: 1 };

  it("조정이 없거나 모든 델타가 0이면 입력 p를 그대로 반환", () => {
    const p = calcEstimate(cfg);
    expect(applyAdjustments(p, undefined)).toBe(p);
    expect(applyAdjustments(p, {})).toBe(p);
    expect(applyAdjustments(p, { s1: 0, s2: 0 })).toBe(p);
  });

  it("베뉴(-300만) 조정 시 소계·운영비·PCO·총액이 일관되게 재계산", () => {
    const p = calcEstimate(cfg);
    const a = applyAdjustments(p, { s1: -3_000_000 });
    expect(a.s1).toBe(p.s1 - 3_000_000);
    // 운영비·PCO(25%·만원절사) 재계산
    expect(a.opCost).toBe(a.s1 + a.s2 + a.s3 + a.s4 + a.ot + p.rsvpPkg);
    expect(a.s5).toBe(Math.floor((a.opCost * 0.25) / 10_000) * 10_000);
    // 총액 불변식 유지
    expect(a.pk).toBe(a.s1 + a.s2 + a.s3 + a.s4 + a.s5 + a.ot + p.rsvpPkg + p.showup);
    expect(a.pk).toBeLessThan(p.pk);
  });

  it("추가옵션 조정은 운영비에 포함되어 PCO에 연동된다", () => {
    const p = calcEstimate(cfg);
    const a = applyAdjustments(p, { ot: -1_000_000 });
    expect(a.ot).toBe(p.ot - 1_000_000);
    expect(a.s5).toBeLessThanOrEqual(p.s5); // 운영비 감소 → PCO 감소(또는 절사로 동일)
    expect(a.opCost).toBe(p.opCost - 1_000_000);
  });

  it("모객(leadPkg) 조정은 운영비/PCO에 영향 없이 총액에만 반영", () => {
    const p = calcEstimate(cfg);
    const a = applyAdjustments(p, { leadPkg: -2_000_000 });
    expect(a.s5).toBe(p.s5); // PCO 불변
    expect(a.opCost).toBe(p.opCost);
    expect(a.leadPkg).toBe(p.leadPkg - 2_000_000);
    expect(a.pk).toBe(p.pk - 2_000_000);
  });

  it("isCustom(별도 협의 모드)이면 조정 무시", () => {
    const p = calcEstimate({ target: TARGET_MAX + 1, guarantee: 100, options: {} });
    expect(applyAdjustments(p, { s1: -1_000_000 })).toBe(p);
  });
});
