// DoD 21 — 엔진 등가: pricing-dataset 전 벡터(14+1)에 대해 이식 엔진 산출이 원본과 0원 차이.
// 정본 기준 = 설계서 §17.3-1 (Configurator README_코웍이식 합격 기준 그대로).
// 추가로 headcount_grid 47행(무옵션·모객제외)도 전량 대조해 구간 산식 회귀를 잠근다.
import { describe, it, expect } from "vitest";
import {
  applyAdjustments,
  calcEstimate,
  calcMncEstimate,
  calcPkExcludingOptions,
  type CalcConfig,
  type EstimateResult,
} from "../engine/calcEstimate";
import dataset from "./fixtures/pricing-dataset.json";

interface GoldenVector {
  id: string;
  desc: string;
  mode: string;
  input: CalcConfig;
  expected: EstimateResult;
  expected_pk_excluding_options?: number;
}

interface GridRow {
  target: number;
  venue_auto: number;
  sys: Record<string, number>;
  des: Record<string, number>;
  ops: Record<string, number>;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  pk: number;
}

const vectors = dataset.golden_vectors as unknown as GoldenVector[];
const adjustmentVector = dataset.adjustment_vector as unknown as {
  desc: string;
  base_input: CalcConfig;
  adjust: Record<string, number>;
  expected: EstimateResult;
};
const grid = dataset.headcount_grid as unknown as GridRow[];

describe("DoD 21 — 골든 벡터 0원 일치", () => {
  it("골든 벡터가 14건이다 (데이터셋 무결성)", () => {
    expect(vectors).toHaveLength(14);
  });

  it.each(vectors.map((v) => ({ id: v.id, v })))("$id — 전 필드 0원 일치", ({ v }) => {
    const result = v.mode === "excludeLeads" ? calcMncEstimate(v.input) : calcEstimate(v.input);
    expect(result).toEqual(v.expected);
    if (v.expected_pk_excluding_options !== undefined) {
      expect(calcPkExcludingOptions(result)).toBe(v.expected_pk_excluding_options);
    }
  });

  it("조정 벡터(+1) — applyAdjustments 산출이 기대값과 0원 일치", () => {
    const p = calcEstimate(adjustmentVector.base_input);
    const a = applyAdjustments(p, adjustmentVector.adjust);
    expect(a).toEqual(adjustmentVector.expected);
  });

  it("headcount_grid 47행 — 무옵션·모객제외 산출이 실측표와 0원 일치", () => {
    expect(grid).toHaveLength(47);
    for (const row of grid) {
      const m = calcEstimate({ target: row.target, guarantee: 0 });
      expect(m.s1, `target=${row.target} s1`).toBe(row.venue_auto);
      expect(m.sysBreakdown, `target=${row.target} sys`).toEqual(row.sys);
      expect(m.desBreakdown, `target=${row.target} des`).toEqual(row.des);
      expect(m.opsBreakdown, `target=${row.target} ops`).toEqual(row.ops);
      expect(m.s2, `target=${row.target} s2`).toBe(row.s2);
      expect(m.s3, `target=${row.target} s3`).toBe(row.s3);
      expect(m.s4, `target=${row.target} s4`).toBe(row.s4);
      expect(m.s5, `target=${row.target} s5`).toBe(row.s5);
      expect(m.pk, `target=${row.target} pk`).toBe(row.pk);
    }
  });
});
