// 견적 계산 단일 출처 (S-2 견적 UI·Excel 내보내기 공용)
// 단가/공식 변경 시 이 한 곳만 수정.
//
// v2.0 이식 (설계서 §17.1): jsx-easy-shift main 6047834 src/lib/calcEstimate.js —
// 함수 시그니처·상수 값·산식 불변, TS 타입만 부여. 골든 벡터 0원 일치가 머지 조건(§17.3·DoD 21).

export const TARGET_MIN = 40;
export const TARGET_MAX = 500; // 대규모 행사 최대 (초과 시 isCustom)
export const GUARANTEE_MIN = 40;
export const BOOTH_UNIT_PRICE = 1_000_000;          // 부스 일반형
// ※ 신규 하드코딩 2건 — pricing_rules DB화(2차) 이관 대상. 호출부에서 건별 단가 오버라이드 가능.
export const BOOTH_PREMIUM_UNIT_PRICE = 2_000_000;  // 부스 고급형 (목공·고급 마감)
export const GEN_ATTENDEE_UNIT_PRICE = 20_000;      // 일반 참관객 관리 (기고객·외부등록자, 쇼업 게런티 아님)
export const SOUVENIR_UNIT_PRICE = 50_000;          // 기념품 기본 단가 (기존 상수 명명화 — 값 무변경)
export const VENUE_PER_PAX_5STAR = 180_000;

/** 엔진 입력 — Configurator config 스키마 승계 (느슨한 형태: 숫자 문자열·누락 허용, 가드는 산식이 수행) */
export interface CalcConfig {
  target?: number | string
  guarantee?: number | string
  venueRental?: number | string | null
  venueName?: string
  displayType?: string
  options?: Record<string, boolean | undefined> | null
  souvenirPrice?: number | string | null
  souvenirQty?: number | string | null
  boothCount?: number | string | null
  boothPremiumCount?: number | string | null
  boothUnitPrice?: number | string | null
  boothPremiumUnitPrice?: number | string | null
  genAttendees?: number | string | null
  [key: string]: unknown
}

/** calcEstimate 반환 형태 — 원본 JS 반환 객체와 1:1 */
export interface EstimateResult {
  isCustom: boolean
  t: number
  g: number
  u: number
  s1: number
  s2: number
  s3: number
  s4: number
  s5: number
  ot: number
  rsvpOrig: number
  rsvpPkg: number
  leadOrig: number
  leadPkg: number
  showup: number
  genManage: number
  genCount: number
  opCost: number
  pk: number
  sysBreakdown: Record<string, number>
  desBreakdown: Record<string, number>
  opsBreakdown: Record<string, number>
  adjusted?: boolean
}

/** 섹션 델타(s1·s2·s3·s4·ot·leadPkg) — applyAdjustments 입력 형식 */
export type AdjustDeltas = Record<string, number | string | undefined>

export const calcVenueRental = (target: number | string | null | undefined): number =>
  Math.round((Number(target) || 0) * VENUE_PER_PAX_5STAR);

// 단가·수량 오버라이드 가드 — 유한수 & 0 이상만 인정. 그 외(NaN·음수·공백)는 fallback.
// 음수를 fallback으로 되돌리는 이유: 비공식 할인 주입 차단.
export const resolveOverride = (raw: unknown, fallback: number): number => {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function calcEstimate(c: CalcConfig): EstimateResult {
  const t = Number(c.target) || 0;
  const g = Number(c.guarantee) || 0;
  if (t > TARGET_MAX) {
    return {
      isCustom: true, t, g, u: t,
      s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, ot: 0,
      rsvpOrig: 0, rsvpPkg: 0, leadOrig: 0, leadPkg: 0, showup: 0, genManage: 0, genCount: 0, opCost: 0, pk: 0,
      sysBreakdown: {}, desBreakdown: {}, opsBreakdown: {},
    };
  }

  // ─── 베뉴 ───
  const s1 = c.venueRental != null ? Number(c.venueRental) : t * VENUE_PER_PAX_5STAR;

  // ─── 시스템 ───
  const video = 2_000_000;
  // 4K 스케일러: target≥100 시 자동 포함 (LED 운용 필수). 옵션 중복 청구 금지.
  // 4K 스케일러/KVM: 100명 이상 + LED 운용 시에만 기본 포함.
  // 100명 이상이어도 빔프로젝터 단독 행사장이 있어 displayType이 명시적으로 "projector"면 제외.
  // (displayType 미지정 구버전 호출은 기존과 동일하게 포함 — v1 호환)
  const scaler4k = t >= 100 && c.displayType !== "projector" ? 2_500_000 : 0;
  const audio = 1_500_000 + Math.ceil(Math.max(0, t - 50) / 100) * 500_000;
  const engineer = 1_000_000;
  const presentation = 1_200_000;
  const kioskCount = t > 200 ? Math.floor(t / 100) : 0;
  const registration = t > 200
    ? 1_000_000 + kioskCount * 1_000_000
    : 1_000_000 + Math.max(0, t - 100) * 5_000;
  const misc = 500_000 + Math.ceil(Math.max(0, t - 50) / 100) * 500_000;
  const s2 = video + scaler4k + audio + engineer + presentation + registration + misc;

  // ─── 디자인 ───
  const env = t <= 50 ? 2_000_000 : t <= 100 ? 2_500_000 : t <= 150 ? 3_000_000 : 3_500_000;
  const web = 1_000_000;
  const kv = 1_000_000;
  const s3 = env + web + kv;

  // ─── 운영 ───
  const desk = Math.ceil(t / 50) * 250_000;
  const ops = 900_000 + Math.ceil(Math.max(0, t - 100) / 100) * 300_000;
  const insurance = 400_000 + Math.ceil(Math.max(0, t - 100) / 100) * 100_000;
  const s4 = desk + ops + insurance;

  // ─── 옵션 ───
  // 4K 스케일러는 t<100 일 때만 옵션으로 추가 가능. t>=100 은 시스템 자동 포함이므로 옵션 중복 금지.
  const opts = c.options || {};
  let ot = 0;
  // 기념품: 단가·수량을 입력값으로 오버라이드 가능 (미지정 시 기존과 동일 — 인당 5만원 × 참석인원)
  const souvenirUnit = resolveOverride(c.souvenirPrice, SOUVENIR_UNIT_PRICE);
  const souvenirQty = resolveOverride(c.souvenirQty, t);
  if (opts.souvenir) ot += souvenirQty * souvenirUnit;
  if (opts.emcee) ot += 1_500_000;
  if (opts.photo) ot += 800_000;
  if (opts.video) ot += 2_000_000;
  if (opts.aving) ot += 2_500_000;
  if (opts.scaler4k && t < 100) ot += 2_500_000;
  // 화면중계: 카메라 중계 시스템(캠 2대+스위칭+오퍼레이터) — LED 화면 선택 시에만 유효.
  // 빔프로젝터에서는 불필요하므로 displayType이 led가 아니면 옵션이 남아 있어도 미과금.
  if (opts.screenRelay && c.displayType === "led") ot += 2_500_000;
  // 전체 녹화·편집: 전 세션 풀 녹화 + 세션별 편집본 (스케치 영상과 별개 산출물)
  if (opts.fullRecording) ot += 3_500_000;
  if (opts.survey) ot += 1_000_000;
  if (opts.photowall_basic) ot += 500_000;
  if (opts.photowall_premium) ot += 2_000_000;
  // RSVP 응대 대행 (패키지 옵션) — 전체 참석인원 × 2만원(평균). 게런티(모객) 보장 아님.
  // 모객 기반 rsvpPkg(게런티×4만원)와 별개의 순수 응대 대행 비용으로, 추가옵션(ot)에 포함된다.
  if (opts.rsvpHandling) ot += t * 20_000;
  // 부스: 일반형(기존)·고급형 2타입. 단가는 입력값으로 오버라이드 가능.
  const boothCount = Number(c.boothCount) || 0;
  const boothPremiumCount = Number(c.boothPremiumCount) || 0;
  const boothUnit = resolveOverride(c.boothUnitPrice, BOOTH_UNIT_PRICE);
  const boothPremiumUnit = resolveOverride(c.boothPremiumUnitPrice, BOOTH_PREMIUM_UNIT_PRICE);
  if (boothCount > 0) ot += boothCount * boothUnit;
  if (boothPremiumCount > 0) ot += boothPremiumCount * boothPremiumUnit;

  // ─── 모객 ───
  const rsvpOrig = g * 50_000;
  const rsvpPkg = g * 40_000;
  const showup = g * 350_000;
  const leadOrig = g * 450_000;
  const leadPkg = rsvpPkg + showup;

  // ─── 일반 참관객 관리 (기고객·외부등록자) ───
  // 쇼업 게런티가 아닌 순수 참가인원 관리 — 인당 2만원 × 관리 인원. 게런티(모객)와 독립.
  const genCount = Math.max(0, Math.round(Number(c.genAttendees) || 0));
  const genManage = genCount * GEN_ATTENDEE_UNIT_PRICE;

  // ─── PCO 기획료 ───
  const opCost = s1 + s2 + s3 + s4 + ot + rsvpPkg + genManage;
  const s5 = Math.floor((opCost * 0.25) / 10_000) * 10_000;

  // ─── 최종 ───
  const pk = s1 + s2 + s3 + s4 + s5 + ot + rsvpPkg + showup + genManage;

  return {
    isCustom: false, t, g, u: t,
    s1, s2, s3, s4, s5, ot,
    rsvpOrig, rsvpPkg, leadOrig, leadPkg, showup, genManage, genCount,
    opCost, pk,
    sysBreakdown: { video, scaler4k, audio, engineer, presentation, registration, misc },
    desBreakdown: { env, web, kv },
    opsBreakdown: { desk, ops, insurance },
  };
}

// ─── 순수 M&C 패키지 견적 (모객·리드비용 제외) ───
// 모객(게런티) 기반 비용(RSVP·쇼업·리드젠)을 전부 제외한 패키지 전용 견적.
// guarantee=0 이면 rsvpPkg·showup·leadPkg·rsvpOrig·leadOrig 가 모두 0 이 되고,
// 운영비(opCost)에서 RSVP가 빠지므로 PCO 기획료(s5)와 총액(pk)이 자동으로
// "베뉴+시스템+디자인+운영+옵션+PCO"만으로 재계산된다.
// 별도 단가/공식 없이 calcEstimate 단일 출처를 그대로 재사용한다.
export function calcMncEstimate(c: CalcConfig): EstimateResult {
  return calcEstimate({ ...c, guarantee: 0 });
}

// ─── 파생 합계: 추가옵션 제외 견적 ───
// 견적서에 "풀 견적"과 "추가옵션 제외 견적"을 함께 표기하기 위한 파생값.
// PCO 기획료는 운영비 × 25%이므로 옵션 제외 시 기획료도 함께 재계산해야 한다.
// calcEstimate({...c, options:{}, boothCount:0, boothPremiumCount:0}).pk 와 동일함을 테스트로 보장.
// (일반 참관객 관리 genManage는 옵션이 아니므로 제외 견적에도 유지된다.)
export function calcPkExcludingOptions(p: EstimateResult | null | undefined): number {
  if (!p || p.isCustom) return 0;
  const s5NoOpt = Math.floor(((p.opCost - p.ot) * 0.25) / 10_000) * 10_000;
  return p.pk - p.ot - (p.s5 - s5NoOpt);
}

// ─── 섹션별 수동 조정 적용 (Excel 다운로드 직전 세부 금액 조정) ───
// adj: { s1, s2, s3, s4, ot, leadPkg } — 각 섹션 소계에 더할 부호 있는 델타(원, 기본 0).
//      memo는 견적서 표기용이며 계산에 영향 없음.
// calcEstimate의 자동 산정값은 그대로 두고, 조정 델타를 반영한 파생 견적을 만든다.
// PCO 기획료(운영비 × 25% · 만원 미만 절사)는 조정된 운영비로 재계산된다 — calcEstimate와 동일 공식.
// 모객(leadPkg) 조정은 운영비(opCost)에 포함되지 않으므로 PCO에 영향을 주지 않는다 (calcEstimate 정의 일치).
// adj가 없거나 모든 델타가 0이면 입력 p를 그대로 반환한다.
export function applyAdjustments(
  p: EstimateResult | null | undefined,
  adj: AdjustDeltas | null | undefined,
): EstimateResult {
  if (!p || p.isCustom || !adj) return p as EstimateResult;
  const d = (k: string) => Number(adj[k]) || 0;
  const keys = ["s1", "s2", "s3", "s4", "ot", "leadPkg"];
  if (keys.every((k) => d(k) === 0)) return p;

  const s1 = p.s1 + d("s1");
  const s2 = p.s2 + d("s2");
  const s3 = p.s3 + d("s3");
  const s4 = p.s4 + d("s4");
  const ot = p.ot + d("ot");
  const leadDelta = d("leadPkg");
  const genManage = p.genManage || 0;
  // 운영비 = s1+s2+s3+s4+ot+rsvpPkg+genManage (모객 leadPkg 조정은 미포함 — calcEstimate와 동일)
  const opCost = s1 + s2 + s3 + s4 + ot + p.rsvpPkg + genManage;
  const s5 = Math.floor((opCost * 0.25) / 10_000) * 10_000;
  const leadPkg = p.leadPkg + leadDelta;
  const pk = s1 + s2 + s3 + s4 + s5 + ot + p.rsvpPkg + p.showup + genManage + leadDelta;

  return { ...p, s1, s2, s3, s4, ot, opCost, s5, leadPkg, pk, adjusted: true };
}
