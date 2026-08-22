// 모객 포함/제외 산출 헬퍼 — 가격 엔진(calcEstimate.ts)은 무변경으로 재사용한다.
// 제외 모드는 guarantee:0 오버라이드만 사용하며, 이는 calcMncEstimate와 동일 산식 경로다
// (동일성은 __tests__/rememberQuote.test.ts에서 보장).
//
// v2.0 이식 (설계서 §17.1): jsx-easy-shift main 6047834
// src/components/remember-quote/quoteMode.ts — 로직 불변, import 경로만 조정.
// EstimateResult는 엔진 정본 타입을 재노출한다(원본은 부분 타입을 자체 정의 — TS 타입 부여 범위).
import { calcEstimate, type EstimateResult } from "./calcEstimate";

export type { EstimateResult } from "./calcEstimate";

export type QuoteConfig = {
  target: number;
  guarantee: number;
  venueRental?: number | null;
  options?: Record<string, boolean>;
  boothCount?: number;
  [key: string]: unknown;
};

// 섹션 델타(s1·s2·s3·s4·ot·leadPkg) — applyAdjustments(calcEstimate.ts) 입력 형식
export type QuoteAdjust = Record<string, number>;

export const buildCalcInput = (cfg: QuoteConfig, includeLeads: boolean): QuoteConfig =>
  includeLeads ? cfg : { ...cfg, guarantee: 0 };

export const computeQuote = (cfg: QuoteConfig, includeLeads: boolean): EstimateResult =>
  calcEstimate(buildCalcInput(cfg, includeLeads)) as EstimateResult;

// 모객 제외 모드에서는 leadPkg 조정 델타를 무효화한다 (토글 전환 시 잔존 델타로
// 총액이 틀어지는 것을 방지).
export const effectiveAdjust = (adjust: QuoteAdjust | undefined, includeLeads: boolean): QuoteAdjust => {
  const a = adjust || {};
  if (includeLeads) return a;
  const { leadPkg: _omit, ...rest } = a;
  return rest;
};
