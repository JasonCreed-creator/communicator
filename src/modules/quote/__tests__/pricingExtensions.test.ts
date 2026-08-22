/** @vitest-environment jsdom */
// v2.0 이식: jsx-easy-shift main 6047834 src/lib/__tests__/pricingExtensions.test.ts — 케이스 불변.
// (backup 옵션만 제거 — Drive 백업 경로 미이식, 설계서 §17.1)
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { exportEstimate } from "../export/exportEstimate";
import { calcEstimate, calcMncEstimate, calcPkExcludingOptions, applyAdjustments, BOOTH_PREMIUM_UNIT_PRICE, GEN_ATTENDEE_UNIT_PRICE } from "../engine/calcEstimate";
import { selectedVenueRental, type VenueEntry } from "../engine/venueOptions";

/**
 * 2차 고도화 엔진 확장 회귀 테스트.
 *
 * 커버리지:
 * 1. 기념품 단가·수량 오버라이드 (+ 명시적 0 · NaN · 음수 가드)
 * 2. 부스 일반형/고급형 2타입 (+ 단가 오버라이드)
 * 3. 일반 참관객 관리(genManage) — opCost·pk 단일 반영, calcMncEstimate 유지
 * 4. calcPkExcludingOptions 계약 (boothPremiumCount 포함 오라클)
 * 5. applyAdjustments 정합 (genManage 포함 · 레거시 p 하위 호환)
 * 6. Excel 출력 정합 (다중 베뉴 · 참관객 섹션 · 한글금액 수식 · 총액 0원 일치)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

const BASE: Cfg = { target: 100, guarantee: 60, venueRental: 20_000_000, options: {}, boothCount: 0 };

describe("기념품 단가·수량 오버라이드", () => {
  const withSouvenir = (over: Cfg = {}) => calcEstimate({ ...BASE, options: { souvenir: true }, ...over });
  const base = calcEstimate(BASE);

  it("미지정 시 기존과 동일 — 인당 5만원 × 참석인원", () => {
    expect(withSouvenir().ot - base.ot).toBe(100 * 50_000);
  });
  it("단가만 오버라이드 → 참석인원 × 커스텀 단가", () => {
    expect(withSouvenir({ souvenirPrice: 30_000 }).ot - base.ot).toBe(100 * 30_000);
  });
  it("수량만 오버라이드 → 커스텀 수량 × 5만원", () => {
    expect(withSouvenir({ souvenirQty: 40 }).ot - base.ot).toBe(40 * 50_000);
  });
  it("명시적 0은 0으로 반영된다 (기본값 대체 아님)", () => {
    expect(withSouvenir({ souvenirPrice: 0 }).ot - base.ot).toBe(0);
    expect(withSouvenir({ souvenirQty: 0 }).ot - base.ot).toBe(0);
  });
  it("숫자 문자열은 정상 캐스팅된다", () => {
    expect(withSouvenir({ souvenirPrice: "30000", souvenirQty: "10" }).ot - base.ot).toBe(300_000);
  });
  it("NaN 입력은 기본값으로 폴백 — 견적 붕괴 금지", () => {
    const p = withSouvenir({ souvenirPrice: "abc" });
    expect(Number.isFinite(p.pk)).toBe(true);
    expect(p.ot - base.ot).toBe(100 * 50_000);
  });
  it("음수 단가는 기본값으로 폴백 — 비공식 할인 주입 차단", () => {
    expect(withSouvenir({ souvenirPrice: -10_000 }).ot - base.ot).toBe(100 * 50_000);
  });
});

describe("부스 일반형/고급형", () => {
  const base = calcEstimate(BASE);

  it("고급형 기본 단가 = 200만원 × 개수", () => {
    const p = calcEstimate({ ...BASE, boothPremiumCount: 2 });
    expect(p.ot - base.ot).toBe(2 * BOOTH_PREMIUM_UNIT_PRICE);
  });
  it("일반형+고급형 동시 합산", () => {
    const p = calcEstimate({ ...BASE, boothCount: 3, boothPremiumCount: 1 });
    expect(p.ot - base.ot).toBe(3 * 1_000_000 + 1 * BOOTH_PREMIUM_UNIT_PRICE);
  });
  it("타입별 단가 오버라이드 반영", () => {
    const p = calcEstimate({ ...BASE, boothCount: 2, boothUnitPrice: 800_000, boothPremiumCount: 1, boothPremiumUnitPrice: 2_500_000 });
    expect(p.ot - base.ot).toBe(2 * 800_000 + 2_500_000);
  });
  it("음수 단가 오버라이드는 기본값 폴백", () => {
    const p = calcEstimate({ ...BASE, boothCount: 3, boothUnitPrice: -500_000 });
    expect(p.ot - base.ot).toBe(3 * 1_000_000);
  });
});

describe("일반 참관객 관리 (genManage)", () => {
  const base = calcEstimate(BASE);

  it("인당 2만원 × 인원이 opCost·pk에 각 1회 반영된다", () => {
    const p = calcEstimate({ ...BASE, genAttendees: 30 });
    const gen = 30 * GEN_ATTENDEE_UNIT_PRICE;
    expect(p.genManage).toBe(gen);
    expect(p.opCost - base.opCost).toBe(gen);
    // pk 증가분 = genManage + PCO 캐스케이드(운영비 증가 × 25%, 만원 절사 차)
    expect(p.pk - base.pk).toBe(gen + (p.s5 - base.s5));
  });
  it("음수 인원은 0으로 클램프", () => {
    const p = calcEstimate({ ...BASE, genAttendees: -5 });
    expect(p.genManage).toBe(0);
    expect(p.pk).toBe(base.pk);
  });
  it("calcMncEstimate(모객 제외)에서도 genManage는 유지된다 — 게런티와 독립", () => {
    const p = calcMncEstimate({ ...BASE, genAttendees: 30 });
    expect(p.genManage).toBe(30 * GEN_ATTENDEE_UNIT_PRICE);
    expect(p.rsvpPkg).toBe(0);
    expect(p.showup).toBe(0);
  });
  it("isCustom 경로도 genManage/genCount shape을 유지한다", () => {
    const p = calcEstimate({ ...BASE, target: 501, genAttendees: 30 });
    expect(p.isCustom).toBe(true);
    expect(p.genManage).toBe(0);
    expect(p.genCount).toBe(0);
  });
});

describe("calcPkExcludingOptions — 갱신된 계약", () => {
  it("boothPremiumCount 포함 케이스에서 options:{}·boothCount:0·boothPremiumCount:0 오라클과 일치", () => {
    const cfg = { ...BASE, options: { souvenir: true, emcee: true }, boothCount: 1, boothPremiumCount: 2, genAttendees: 30 };
    const p = calcEstimate(cfg);
    const oracle = calcEstimate({ ...cfg, options: {}, boothCount: 0, boothPremiumCount: 0 }).pk;
    expect(calcPkExcludingOptions(p)).toBe(oracle);
  });
});

describe("applyAdjustments — genManage 정합·하위 호환", () => {
  it("조정 후 opCost·pk에 genManage가 유지된다", () => {
    const p = calcEstimate({ ...BASE, genAttendees: 30, options: { emcee: true } });
    const a = applyAdjustments(p, { s1: -1_000_000, ot: 500_000 });
    const expectedOpCost = a.s1 + a.s2 + a.s3 + a.s4 + a.ot + p.rsvpPkg + p.genManage;
    expect(a.opCost).toBe(expectedOpCost);
    expect(a.pk).toBe(a.s1 + a.s2 + a.s3 + a.s4 + a.s5 + a.ot + p.rsvpPkg + p.showup + p.genManage);
  });
  it("genManage 없는 레거시 p 객체도 안전하다 (undefined → 0)", () => {
    const legacy = { ...calcEstimate(BASE) } as Cfg;
    delete legacy.genManage;
    delete legacy.genCount;
    const a = applyAdjustments(legacy as ReturnType<typeof calcEstimate>, { s2: 300_000 });
    expect(Number.isFinite(a.pk)).toBe(true);
    expect(a.opCost).toBe(a.s1 + a.s2 + a.s3 + a.s4 + a.ot + legacy.rsvpPkg);
  });
});

// ─── Excel 출력 정합 ───

async function buildSheet(cfg: Cfg, exportOpts: Record<string, unknown> = {}) {
  const p = calcEstimate(cfg);
  const { blob } = await exportEstimate(cfg, p, { download: false, ...exportOpts });
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { ws: wb.worksheets[0], p };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any): number | null => {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v) return v.result as number;
  return null;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formulaOf = (v: any): string | null =>
  v && typeof v === "object" && "formula" in v ? (v.formula as string) : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scanCol = (ws: any, col: string, max = 80): string[] => {
  const out: string[] = [];
  for (let i = 1; i <= max; i++) {
    const v = ws.getCell(`${col}${i}`).value;
    out.push(typeof v === "string" ? v : "");
  }
  return out;
};

const VENUES: VenueEntry[] = [
  { name: "그랜드볼룸", date: "2026-09-01", rental: 20_000_000 },
  { name: "세컨드홀", date: "", rental: 5_000_000 },
];

describe("exportEstimate — 2차 고도화 정합", () => {
  it("베뉴 택1: 후보 행이 모두 기재되되 선택된 1곳만 합산 (선택 O/X 수식 연동)", async () => {
    const target = 100;
    const vt = selectedVenueRental(VENUES, 0);
    expect(vt).toBe(20_000_000);
    const cfg: Cfg = { ...BASE, target, venues: VENUES, venueSelected: 0, venueRental: vt };
    const { ws, p } = await buildSheet(cfg);
    expect(p.s1).toBe(vt);
    // 사용자 확정 패턴: 후보명·행사일자는 산출 내역(C열)에 결합 표기
    const colC = scanCol(ws, "C");
    expect(colC.some(s => s.includes("후보1 · 그랜드볼룸"))).toBe(true);
    expect(colC.some(s => s.includes("후보2 · 세컨드홀"))).toBe(true);
    expect(colC.some(s => s.includes("행사 일자 2026.09.01"))).toBe(true);
    // 선택(G열): 후보1 O · 후보2 X, 미선택 후보 금액(F)은 0
    const row1 = colC.findIndex(s => s.includes("후보1 · 그랜드볼룸")) + 1;
    const row2 = colC.findIndex(s => s.includes("후보2 · 세컨드홀")) + 1;
    expect(ws.getCell(`G${row1}`).value).toBe("O");
    expect(ws.getCell(`G${row2}`).value).toBe("X");
    expect(num(ws.getCell(`F${row1}`).value)).toBe(20_000_000);
    expect(num(ws.getCell(`F${row2}`).value) ?? 0).toBe(0); // 캐시 0은 직렬화 시 생략될 수 있음
    expect(formulaOf(ws.getCell(`F${row2}`).value) ?? "").toContain(`IF(G${row2}="O"`);
    // 총액(D10) = 섹션 소계 참조 합 = p.pk
    const d10 = ws.getCell("D10").value;
    const refs = (formulaOf(d10) ?? "").split("+");
    const sum = refs.reduce((s, ref) => s + (num(ws.getCell(ref.trim()).value) ?? 0), 0);
    expect(sum).toBe(p.pk);
  });

  it("화면중계는 LED에서만 과금(250만), 전체 녹화·편집은 350만", () => {
    const led = calcEstimate({ ...BASE, displayType: "led", options: { screenRelay: true } });
    const proj = calcEstimate({ ...BASE, displayType: "projector", options: { screenRelay: true } });
    expect(led.ot).toBe(2_500_000);
    expect(proj.ot).toBe(0); // 프로젝터에서는 옵션이 남아 있어도 미과금
    const rec = calcEstimate({ ...BASE, options: { fullRecording: true } });
    expect(rec.ot).toBe(3_500_000);
  });

  it("4K 스케일러: 100명 이상이라도 빔프로젝터면 미포함, LED면 포함", () => {
    const led = calcEstimate({ ...BASE, target: 150, displayType: "led" });
    const proj = calcEstimate({ ...BASE, target: 150, displayType: "projector" });
    const legacy = calcEstimate({ ...BASE, target: 150 }); // displayType 미지정 — v1 호환(포함)
    expect(led.sysBreakdown.scaler4k).toBe(2_500_000);
    expect(proj.sysBreakdown.scaler4k).toBe(0);
    expect(legacy.sysBreakdown.scaler4k).toBe(2_500_000);
    expect(led.s2 - proj.s2).toBe(2_500_000);
  });

  it("일반 참관객: 전용 행 기록 + PCO 운영비 참조에 포함 + 총액 0원 일치", async () => {
    const cfg: Cfg = { ...BASE, genAttendees: 30, options: { emcee: true } };
    const { ws, p } = await buildSheet(cfg);
    const colA = scanCol(ws, "A");
    const genRowIdx = colA.findIndex(s => s.includes("일반 참관객 관리")) + 1;
    expect(genRowIdx).toBeGreaterThan(0);
    expect(num(ws.getCell(`F${genRowIdx}`).value)).toBe(30 * GEN_ATTENDEE_UNIT_PRICE);
    // PCO 운영비(D열) 수식이 참관객 행을 참조한다
    const pcoRowIdx = colA.findIndex(s => s.includes("PCO 기획료") && !s.startsWith("6") && !s.startsWith("5")) + 1;
    const pcoRow = colA.findIndex((s, i) => s === "PCO 기획료" && i > 10) + 1 || pcoRowIdx;
    const pcoFormula = formulaOf(ws.getCell(`D${pcoRow}`).value) ?? "";
    expect(pcoFormula).toContain(`F${genRowIdx}`);
    const d10 = ws.getCell("D10").value;
    const refs = (formulaOf(d10) ?? "").split("+");
    const sum = refs.reduce((s, ref) => s + (num(ws.getCell(ref.trim()).value) ?? 0), 0);
    expect(sum).toBe(p.pk);
  });

  it("excludeLeads + 참관객: RSVP 없이 '참가인원 관리' 섹션으로 출력되고 총액 일치", async () => {
    const cfg: Cfg = { ...BASE, genAttendees: 20 };
    const p = calcMncEstimate(cfg);
    const { blob } = await exportEstimate(cfg, p, { download: false, excludeLeads: true });
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    const colA = scanCol(ws, "A");
    expect(colA.some(s => s.includes("참가인원 관리"))).toBe(true);
    expect(colA.some(s => s.includes("RSVP 운영비"))).toBe(false);
    const d10 = ws.getCell("D10").value;
    const refs = (formulaOf(d10) ?? "").split("+");
    const sum = refs.reduce((s, ref) => s + (num(ws.getCell(ref.trim()).value) ?? 0), 0);
    expect(sum).toBe(p.pk);
  });

  it("기념품 오버라이드·고급형 부스가 옵션 행에 반영된다", async () => {
    const cfg: Cfg = { ...BASE, options: { souvenir: true }, souvenirPrice: 30_000, souvenirQty: 40, boothPremiumCount: 2 };
    const { ws, p } = await buildSheet(cfg);
    const colA = scanCol(ws, "A");
    const souvIdx = colA.findIndex(s => s === "기념품") + 1;
    expect(souvIdx).toBeGreaterThan(0);
    expect(num(ws.getCell(`D${souvIdx}`).value)).toBe(30_000);
    expect(num(ws.getCell(`E${souvIdx}`).value)).toBe(40);
    const premIdx = colA.findIndex(s => s.includes("부스 설치 (고급형)")) + 1;
    expect(premIdx).toBeGreaterThan(0);
    expect(num(ws.getCell(`F${premIdx}`).value)).toBe(2 * BOOTH_PREMIUM_UNIT_PRICE);
    expect(p.ot).toBe(30_000 * 40 + 2 * BOOTH_PREMIUM_UNIT_PRICE);
  });

  it("한글금액이 NUMBERSTRING 수식으로 총액(D10)에 연동된다", async () => {
    const { ws } = await buildSheet({ ...BASE, options: { emcee: true } });
    const b10 = ws.getCell("B10").value;
    const f = formulaOf(b10) ?? "";
    expect(f).toContain("NUMBERSTRING(D10");
    // 캐시 결과 형식: "일금 ...원 정 (137,810,000원)" — 한글금액 뒤 숫자 병기
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(String((b10 as any)?.result ?? "")).toMatch(/^일금 .+원 정 \([\d,]+원\)$/);
  });
});
