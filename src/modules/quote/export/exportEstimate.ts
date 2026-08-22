// 견적서 Excel 내보내기 (ExcelJS) — S-2 견적 화면 전용.
//
// v2.0 이식 (설계서 §17.1): jsx-easy-shift main 6047834 src/lib/exportEstimate.js.
// 로직·레이아웃·수식 불변(TS 타입 부여·import 경로만). 예외 2건(§17.1·세션 브리프):
//   1) Drive 자동 백업 경로 전체 제거 — 자동 외부 업로드 없음(§8 GET /quotes/{id}/export.xlsx,
//      Phase 5에서 Drive 저장은 명시 버튼). "외부 fetch 호출 0건"은 DoD 22 테스트로 증명.
//   2) 로고 자산은 public/brand png 사용 — 블랙 헤더 밴드 위이므로 offwhite(크림/화이트) 판.
import { kpiMinAck, kpiAckRatioPercent, kpiTier } from "../engine/kpiRules";
import {
  TARGET_MAX,
  VENUE_PER_PAX_5STAR,
  BOOTH_UNIT_PRICE,
  BOOTH_PREMIUM_UNIT_PRICE,
  GEN_ATTENDEE_UNIT_PRICE,
  SOUVENIR_UNIT_PRICE,
  LED_OPERATING_PRICE,
  SCREEN_RELAY_PRICE,
  SCREEN_RELAY_CAMERAS,
  ONLINE_RELAY_ADDON_PRICE,
  ONLINE_RELAY_TOTAL_PRICE,
  ONLINE_RELAY_CAMERAS,
  FULL_RECORDING_PRICE,
  resolveOverride,
  type EstimateResult,
} from "../engine/calcEstimate";

// 리멤버 워드마크(크림/화이트 — 블랙 헤더 밴드용). PROGRESS 결정 로그: 로고 상시 노출은
// 사용자 명시 지시(#RULE-NO-COMPANY 예외) — 자산은 public/brand 주입, 로드 실패 시 로고 없이 출력.
const REMEMBER_LOGO_URL = "/brand/remember-logo-offwhite.png";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Cell = any;
type Sheet = any;

let ExcelJSModule: any = null;
let fileSaverModule: any = null;

// 로고 base64 캐시. 실패 시 로고 없이 출력한다.
let _logoB64: string | null = null;
async function loadLogoBase64(): Promise<string> {
  if (_logoB64 !== null) return _logoB64;
  try {
    const res = await fetch(REMEMBER_LOGO_URL);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    _logoB64 = btoa(bin);
  } catch {
    _logoB64 = "";
  }
  return _logoB64;
}

const OG = "FFFF6B00"; // 브랜드 오렌지 #FF6B00 (ARGB 포맷)
const YL = "FFFFF2CC";
const WH = "FFFFFFFF";
const BK = "FF000000";

const thinBorder = { style: "thin", color: { argb: "FF000000" } };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

// 기본 브랜드 = 리멤버 단독 (단일 출처 — S-2 공용).
// 화이트라벨이 필요하면 options.brand 로 공급자/제목/파일명을 주입한다. ko/en 필드를 각각 제공한다.
// titleKoMnc/titleEnMnc 필드명은 호환 유지용이며(excludeLeads=모객 제외 시 제목 슬롯),
// 필드명 개명은 2차에서 mncLayout 분기 정리와 일괄 진행한다.
const REMEMBER_BRAND = {
  titleKo: "리멤버 MICE 솔루션 견적서",
  titleEn: "Remember MICE Solution — Estimate",
  titleKoMnc: "리멤버 MICE 패키지 견적서",
  titleEnMnc: "Remember MICE Package — Estimate",
  sheetName: "리멤버MICE솔루션",
  supplierKo: "㈜리멤버앤컴퍼니                      (인)",
  supplierEn: "Remember & Company                    (Seal)",
  addressKo: "서울시 강남구 테헤란로 134",
  addressEn: "134 Teheran-ro, Gangnam-gu, Seoul, Korea",
  filePrefix: "리멤버견적서",
  filePrefixEn: "Remember_Estimate",
  defaultProjectKo: "리멤버 MICE 컨퍼런스",
  defaultProjectEn: "Remember MICE Conference",
};

export type ExportBrand = Record<string, any>;

export interface ExportEstimateOptions {
  /** 로컬 저장 여부 (테스트·미리보기는 false) */
  download?: boolean;
  /** 섹션별 수동 조정 델타 */
  adjustments?: Record<string, any>;
  /** 모객(RSVP·쇼업·리드젠) 섹션 제외 — 순수 패키지 견적 */
  excludeLeads?: boolean;
  /** "ko" | "en" — 해외 클라이언트용 영문 견적서 */
  lang?: "ko" | "en";
  /** 공급자/제목/파일명 화이트라벨 (미지정 시 리멤버 기본) */
  brand?: ExportBrand | null;
}

function koreanAmount(n: number): string {
  const num = Math.round(n);
  if (num === 0) return "영";
  let result = "";
  const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const parts: { val: number; unit: string }[] = [];
  const units = ["", "만", "억"];
  let remaining = num;
  let idx = 0;
  while (remaining > 0) {
    const part = remaining % 10000;
    if (part > 0) parts.unshift({ val: part, unit: units[idx] || "" });
    remaining = Math.floor(remaining / 10000);
    idx++;
  }
  for (const p of parts) {
    const t = Math.floor(p.val / 1000), h = Math.floor((p.val % 1000) / 100);
    const te = Math.floor((p.val % 100) / 10), o = p.val % 10;
    if (t) result += digits[t] + "천";
    if (h) result += digits[h] + "백";
    if (te) result += digits[te] + "십";
    if (o) result += digits[o];
    result += p.unit;
  }
  return result;
}

interface CellOpts {
  align?: string;
  bold?: boolean;
  size?: number;
  fontColor?: string;
  bg?: string;
  numFmt?: string;
}

function setCell(ws: Sheet, r: number, c: number, val: any, opts: CellOpts = {}): Cell {
  const cell = ws.getCell(r, c);
  cell.value = val;
  cell.border = borders;
  cell.alignment = { vertical: "middle", wrapText: true, ...(opts.align ? { horizontal: opts.align } : {}) };
  if (opts.bold) cell.font = { ...(cell.font || {}), bold: true, size: opts.size || 10 };
  else cell.font = { size: opts.size || 10 };
  if (opts.fontColor) cell.font = { ...cell.font, color: { argb: opts.fontColor } };
  if (opts.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg } };
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  return cell;
}

function itemHeaders(ws: Sheet, r: number, headers: string[]): void {
  headers.forEach((v, i) => {
    if (i === 6) {
      ws.mergeCells(r, 7, r, 8);
      setCell(ws, r, 7, v, { bold: true, bg: "FF333333", fontColor: WH, align: "center" });
    } else {
      setCell(ws, r, i + 1, v, { bold: true, bg: "FF333333", fontColor: WH, align: "center" });
    }
  });
}

// 단가(D)·수량(E)이 모두 숫자이고 D×E가 전달된 금액과 일치할 때만 금액(F)에 =D*E 수식.
// 불일치하면 엔진이 계산한 금액을 정적으로 기록한다 — 엑셀 재계산이 컨피규레이터
// 설정값을 덮어쓰는 것을 방지 (예: 대관료 직접 입력 시).
function itemRow(ws: Sheet, r: number, data: any[]): void {
  data.forEach((v, i) => {
    if (i === 6) {
      ws.mergeCells(r, 7, r, 8);
      setCell(ws, r, 7, v || "");
    } else if (i === 5 && typeof data[3] === "number" && typeof data[4] === "number"
      && typeof v === "number" && Math.round(data[3] * data[4]) === Math.round(v)) {
      const cell = ws.getCell(r, 6);
      cell.value = { formula: `D${r}*E${r}`, result: v };
      cell.numFmt = "#,##0";
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.border = borders;
      cell.font = { size: 10 };
    } else {
      const isNum = i >= 3 && i <= 5 && typeof v === "number";
      setCell(ws, r, i + 1, v ?? "", isNum ? { numFmt: "#,##0", align: "right" } : {});
    }
  });
}

// itemRange가 있으면 SUM(F{from}:F{to}) 수식으로 합계.
function totalRow(
  ws: Sheet,
  r: number,
  total: number,
  itemRange: { from: number; to: number } | null,
  subtotalLabel: string,
): void {
  ws.mergeCells(r, 1, r, 5);
  setCell(ws, r, 1, subtotalLabel, { bold: true, bg: "FFF0F0F0", align: "right" });
  if (itemRange && itemRange.from && itemRange.to >= itemRange.from) {
    const cell = ws.getCell(r, 6);
    cell.value = { formula: `SUM(F${itemRange.from}:F${itemRange.to})`, result: total };
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
    cell.numFmt = "₩#,##0";
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = borders;
  } else {
    setCell(ws, r, 6, total, { bold: true, numFmt: "₩#,##0", align: "right", bg: "FFF0F0F0" });
  }
  ws.mergeCells(r, 7, r, 8);
  setCell(ws, r, 7, "", { bg: "FFF0F0F0" });
}

// 섹션 헤더의 우측 "소계" 셀(F)을 그 섹션 totalRow의 F 셀로 연결.
function linkSectionTitle(ws: Sheet, titleRow: number, totalR: number, total: number): void {
  ws.getCell(titleRow, 6).value = { formula: `F${totalR}`, result: total };
}

/**
 * @param cfg  견적 설정값 (엔진 config 형태 — venues 배열·venueSelected 포함 가능)
 * @param p    calcEstimate 결과 (조정 전 원본)
 * @param options ExportEstimateOptions
 * @throws {Error} p.isCustom (TARGET_MAX 초과) 시. 호출처가 안내 문구로 처리.
 */
export async function exportEstimate(
  cfg: Record<string, any>,
  p: EstimateResult,
  options: ExportEstimateOptions = {},
): Promise<{ fn: string; blob: Blob }> {
  const {
    download = true, adjustments = {},
    excludeLeads = false, lang = "ko", brand = null,
  } = options;
  if (p && p.isCustom) {
    throw new Error(`${TARGET_MAX}명 초과 행사는 별도 협의 모드입니다. 견적서는 영업 담당자가 별도 발행합니다.`);
  }
  const en = lang === "en";
  const B: ExportBrand = brand || REMEMBER_BRAND;

  // ─── 팔레트 (M&C 화이트라벨은 네이비+골드, 그 외 리멤버 오렌지) ───
  const MNC = !!B.mncLayout;
  const PAL: any = MNC
    ? { navy: "FF223049", navy2: "FF2C3B57", gold: "FFB1842B", goldSoft: "FFF4EEDC", cream: "FFF6ECD2", ink: "FF1B2333", muted: "FF5B6982", line: "FFCAD3E1", stripe: "FFF7F9FC" }
    : null;
  // 섹션 제목·소계 밴드 (M&C: 골드 제목 + 네이비 소계 / 리멤버: 옐로우 + 블랙)
  function sectionTitle(ws: Sheet, r: number, title: string, sectionTotal: number, subtotalLabel?: string): void {
    void subtotalLabel;
    const titleBg = MNC ? PAL.goldSoft : YL;
    const titleTx = MNC ? PAL.ink : undefined;
    const bandBg = MNC ? PAL.navy : BK;
    const bandTx = MNC ? PAL.cream : WH;
    ws.mergeCells(r, 1, r, 2);
    setCell(ws, r, 1, title, { bold: true, bg: titleBg, ...(titleTx ? { fontColor: titleTx } : {}) });
    // 감수 반영: 밴드 내 "소계" 라벨 제거(하단 소계행과 중복) + 우측 꼬리 블랙 통일(줄무늬 제거)
    for (let i = 3; i <= 4; i++) setCell(ws, r, i, "", { bold: true, bg: bandBg, fontColor: bandTx, align: "center" });
    ws.mergeCells(r, 4, r, 5);
    setCell(ws, r, 6, sectionTotal, { bold: true, bg: bandBg, fontColor: bandTx, numFmt: "₩#,##0", align: "right" });
    ws.mergeCells(r, 7, r, 8);
    setCell(ws, r, 7, "", { bg: bandBg });
  }
  function labelCell(ws: Sheet, r: number, c: number, val: any): void {
    if (MNC) setCell(ws, r, c, val, { bold: true, fontColor: PAL.cream, bg: PAL.navy, align: "center" });
    else setCell(ws, r, c, val, { bold: true, fontColor: WH, bg: OG, align: "center" });
  }

  // ─── 로케일 헬퍼 ───
  const won = (n: number) => en ? `KRW ${Math.round(n).toLocaleString("en-US")}` : `${Math.round(n).toLocaleString("ko-KR")}원`;
  const pax = (n: number) => en ? `${n} pax` : `${n}명`;
  // SPEC/산정식 컬럼은 클라이언트에게 노출되므로 개발 수식(ceil/floor/max)이 아닌
  // "기본료 + 인원 규모 가산" 형태의 설명 문구로 기재한다.
  const basePlusSpec = (base: number, total: number) => en
    ? (total > base ? `Base ${won(base)} + headcount add ${won(total - base)}` : `Base ${won(base)}`)
    : (total > base ? `기본 ${won(base)} + 인원 규모 가산 ${won(total - base)}` : `기본 ${won(base)}`);

  // ─── 정적 라벨 (로케일) ───
  const T = en ? {
    headers: ["ITEM", "DESCRIPTION", "SPEC", "UNIT PRICE", "QTY", "AMOUNT", "REMARKS"],
    subtotal: "Subtotal",
    projectTitle: "Project Title",
    attendee: "Attendees",
    venue: "Venue",
    note: "Note",
    noteVal: "Based on 1 full day",
    issued: "Issued",
    proposalDate: "Date",
    validity: "Validity",
    validityVal: "30 days from issue date",
    supplier: "Supplier",
    address: "Address",
    manager: "Manager",
    grandTotal: "Total (VAT excl.)",
    vatExclParen: "(KRW / VAT excl.)",
    vatIncl: "VAT incl.",
    exclOptTotal: "Excl. Add-ons (VAT excl.)",
    adjust: "Adjustment",
    adjustDesc: "Amount adjustment",
    adjustSpec: "Manual pre-download adjustment",
    discountApplied: "Discount applied",
    additionApplied: "Addition applied",
    optGuide: "✅ Enter O=include / X=exclude in the 'SELECT' column — amount, PCO fee and total recalculate automatically.",
    notice: "* This quote is for reference only; cost may vary by venue conditions. A finalized quote takes 1–2 business days.",
    fbIncluded: "F&B Included",
    fbRentalRatio: "80% of rental",
  } : {
    headers: ["항목", "내용", "산출 내역", "단가", "수량", "금액", "비고"],
    subtotal: "소계",
    projectTitle: "프로젝트명",
    attendee: "참석 인원",
    venue: "베뉴",
    note: "비  고",
    noteVal: "1일 full day 기준",
    issued: "견적일시",
    proposalDate: "제안일자",
    validity: "유효기간",
    validityVal: "제안일자로 부터 30일",
    supplier: "공 급 자",
    address: "주     소",
    manager: "담 당 자",
    grandTotal: "총 견적금액(VAT별도)",
    vatExclParen: "(￦/ V.A.T 별도)",
    vatIncl: "VAT 포함",
    exclOptTotal: "추가옵션 제외(VAT별도)",
    adjust: "조정",
    adjustDesc: "금액 조정",
    adjustSpec: "다운로드 직전 수동 조정",
    discountApplied: "할인 반영",
    additionApplied: "추가 반영",
    optGuide: "✅ 오른쪽 '선택' 칸에 O=포함 / X=제외 입력 시 금액·PCO 기획료·총액이 자동 재계산됩니다.",
    notice: "※ 본 견적은 참고용이며, 베뉴 컨디션에 따라 비용은 변동될 수 있습니다. 정확한 견적을 위해 1~2일 소요됩니다.",
    fbIncluded: "F&B 포함",
    fbRentalRatio: "대관료의 80%",
  };
  // 한글금액 뒤에 숫자금액을 괄호 병기 — "일금 ...원 정 (137,810,000원)" 관행 표기
  const amountInWords = (n: number) => en
    ? `${Math.round(n).toLocaleString("en-US")} KRW only`
    : `일금 ${koreanAmount(n)}원 정 (${Math.round(n).toLocaleString("ko-KR")}원)`;

  // ─── 다운로드 직전 섹션별 수동 조정 ───
  const adj: Record<string, any> = adjustments || {};
  const adjOf = (k: string) => Number(adj[k]) || 0;
  const adjMemo = (k: string) => (adj.memo && adj.memo[k]) || "";
  const s1T = p.s1 + adjOf("s1");
  const s2T = p.s2 + adjOf("s2");
  const s3T = p.s3 + adjOf("s3");
  const s4T = p.s4 + adjOf("s4");
  const otT = p.ot + adjOf("ot");
  const genManageT = p.genManage || 0; // 일반 참관객 관리 — calcEstimate와 동일하게 운영비·총액에 포함
  const opCostT = s1T + s2T + s3T + s4T + otT + p.rsvpPkg + genManageT;
  const s5T = Math.floor((opCostT * 0.25) / 10_000) * 10_000;
  const leadPkgT = p.leadPkg + adjOf("leadPkg");
  const pkT = s1T + s2T + s3T + s4T + s5T + otT + p.rsvpPkg + p.showup + genManageT + adjOf("leadPkg");
  const s5NoOptT = Math.floor(((opCostT - otT) * 0.25) / 10_000) * 10_000;
  const pkNoOptT = pkT - otT - (s5T - s5NoOptT);

  // 섹션 끝에 "조정" 라인을 추가하고 갱신된 마지막 항목 행 번호를 반환.
  const appendAdjustRow = (ws: Sheet, lastItem: number, key: string): number => {
    const delta = adjOf(key);
    if (!delta) return lastItem;
    const r = lastItem + 1;
    setCell(ws, r, 1, T.adjust);
    setCell(ws, r, 2, adjMemo(key) || T.adjustDesc);
    setCell(ws, r, 3, T.adjustSpec);
    setCell(ws, r, 4, "");
    setCell(ws, r, 5, "");
    setCell(ws, r, 6, delta, { numFmt: "#,##0", align: "right", fontColor: delta < 0 ? "FFDC2626" : "FF1565C0" });
    ws.mergeCells(r, 7, r, 8);
    setCell(ws, r, 7, delta < 0 ? T.discountApplied : T.additionApplied);
    return r;
  };
  if (!ExcelJSModule) ExcelJSModule = await import("exceljs");
  if (!fileSaverModule) fileSaverModule = await import("file-saver");

  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const saveAs = fileSaverModule.saveAs || fileSaverModule.default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(B.sheetName, {});

  // M&C는 공급자 표(2쌍 라벨·값)가 균형 잡히도록 전용 열 너비 사용.
  // 라벨 col5/col7 좁게, 값 col6/col8 넓게 → 이메일·팩스가 한 줄에 들어간다.
  ws.columns = MNC ? [
    { width: 18 }, { width: 24 }, { width: 44 }, { width: 15 },
    { width: 10 }, { width: 23 }, { width: 10 }, { width: 25 }, // E(수량)=G(라벨2)=10
  ] : [
    // 사용자 확정 그리드(2026-08-13 업로드 실측) — 열폭 고정, 자동 확장 없음
    { width: 22 }, { width: 26 }, { width: 51.58 }, { width: 16 },
    { width: 10 }, { width: 18 }, { width: 28 }, { width: 11.58 },
  ];

  const projectName = cfg.projectTitle || (en ? B.defaultProjectEn : B.defaultProjectKo);
  const today = new Date();
  const target = cfg.target;

  // Title
  let r = 1;
  const titleText = en
    ? (excludeLeads ? B.titleEnMnc : B.titleEn)
    : (excludeLeads ? B.titleKoMnc : B.titleKo);
  if (MNC) {
    // 네이비 타이틀 밴드 + 골드 언더라인 + 공급자/문서유형 서브라인
    ws.mergeCells(1, 1, 2, 8);
    const tc = ws.getCell(1, 1);
    tc.value = titleText;
    tc.font = { size: 20, bold: true, color: { argb: PAL.cream } };
    tc.alignment = { horizontal: "center", vertical: "middle" };
    tc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.navy } };
    ws.getRow(1).height = 26; ws.getRow(2).height = 12;
    // 서브라인 (좌: 공급자명 / 우: QUOTATION)
    ws.mergeCells(3, 1, 3, 8);
    const sub = ws.getCell(3, 1);
    sub.value = `${en ? B.companyEn : B.company}      ·      QUOTATION`;
    sub.font = { size: 10, bold: true, color: { argb: PAL.gold } };
    sub.alignment = { horizontal: "center", vertical: "middle" };
    sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.navy } };
    // 골드 라인
    ws.mergeCells(4, 1, 4, 8);
    ws.getCell(4, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.gold } };
    ws.getRow(3).height = 16; ws.getRow(4).height = 4;
  } else {
    // 리멤버 타이틀 밴드 — 블랙 배경 + 화이트 제목 + 좌측 화이트 워드마크 + 하단 오렌지 라인
    ws.mergeCells(1, 1, 3, 8);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = titleText;
    titleCell.font = { size: 20, bold: true, color: { argb: WH } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A0A0A" } };
    // 사용자 확정 간격: 타이틀 3행 × 22.65pt + 오렌지 라인 4pt
    ws.getRow(1).height = 22.65; ws.getRow(2).height = 22.65; ws.getRow(3).height = 22.65;
    ws.mergeCells(4, 1, 4, 8);
    ws.getCell(4, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: OG } };
    ws.getRow(4).height = 4;
    const logoB64 = await loadLogoBase64();
    if (logoB64) {
      try {
        const logoId = wb.addImage({ base64: logoB64, extension: "png" });
        // 밴드(67.95pt ≈ 90px) 좌측 수직 중앙 — 원본 1692×277 비율 유지, 세로 34px
        ws.addImage(logoId, {
          tl: { nativeCol: 0, nativeColOff: 150_000, nativeRow: 0, nativeRowOff: 266_000 },
          ext: { width: 208, height: 34 },
          editAs: "oneCell",
        });
      } catch (e: any) {
        console.warn("[exportEstimate] logo insert failed:", e?.message ?? e);
      }
    }
  }

  // Header
  r = 5;
  // 모객 제외(패키지) 견적은 게런티/KPI 정보를 표기하지 않고 참석 인원만 노출한다.
  const attendeeInfo = excludeLeads
    ? [T.attendee, pax(cfg.target)]
    : [
        en ? "Attendees / Recruitment" : "참석/모객",
        en
          ? `${cfg.target} pax / ${cfg.guarantee} pax  ·  KPI ${kpiMinAck(cfg.guarantee)} pax (${kpiAckRatioPercent(cfg.guarantee)}% · tier ${kpiTier(cfg.guarantee)})`
          : `${cfg.target}명 / ${cfg.guarantee}명  ·  KPI 달성선 ${kpiMinAck(cfg.guarantee)}명 (${kpiAckRatioPercent(cfg.guarantee)}% 인정·${kpiTier(cfg.guarantee)}단계)`,
      ];
  const leftInfo: [string, any][] = [
    [T.projectTitle, projectName],
    attendeeInfo as [string, any],
    [T.venue, cfg.venueName || (en ? "(TBD)" : "(미정)")],
    [T.note, T.noteVal],
    [T.issued, en ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}` : `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`],
    // M&C는 우측 공급자(6행)와 높이를 맞추기 위해 유효기간을 한 줄 더 둔다.
    ...(MNC ? [[T.validity, T.validityVal] as [string, any]] : []),
  ];
  // 좌측 견적 정보 — M&C는 헤더바("견적 정보")를 얹고, 값을 D열까지 확장(공백 D열 제거).
  const leftValRight = MNC ? 4 : 3;
  let leftStart = r;
  if (MNC) {
    ws.mergeCells(r, 1, r, 4);
    setCell(ws, r, 1, en ? "QUOTE INFO" : "견적 정보", { bold: true, bg: PAL.navy, fontColor: PAL.cream, align: "center", size: 10 });
    leftStart = r + 1;
  }
  leftInfo.forEach(([label, val], i) => {
    labelCell(ws, leftStart + i, 1, label);
    ws.mergeCells(leftStart + i, 2, leftStart + i, leftValRight);
    // 감수 반영: 값 볼드 제거 — 라벨(칩)과 값의 강조 층위 분리
    setCell(ws, leftStart + i, 2, val, MNC ? { fontColor: PAL.ink } : {});
  });
  const leftRows = (MNC ? 1 : 0) + leftInfo.length;

  // 오른쪽 블록: brand.richSupplier면 사업자등록증 형식의 공급자 카드(cols 5-8, 헤더바 + 6행),
  // 아니면 기존 컴팩트 4행(cols 6-8). 헤더 높이에 맞춰 총액·섹션 시작행을 자동 산출한다.
  let headerRowCount: number, sealAnchorRow: number | null = null;
  if (B.richSupplier) {
    const LB: CellOpts = MNC ? { bold: true, bg: PAL.goldSoft, fontColor: PAL.ink, size: 9, align: "center" } : { bold: true, bg: WH, size: 9, align: "center" };
    // 공급자 값은 모두 가운데 정렬
    const VL: CellOpts = MNC ? { size: 9, fontColor: PAL.ink, align: "center" } : { size: 9, align: "center" };
    const VB: CellOpts = MNC ? { bold: true, size: 9, fontColor: PAL.ink, align: "center" } : { bold: true, size: 9, align: "center" };
    // 공급자 헤더바
    let sr = r;
    ws.mergeCells(sr, 5, sr, 8);
    setCell(ws, sr, 5, en ? "SUPPLIER" : "공 급 자", MNC ? { bold: true, bg: PAL.navy, fontColor: PAL.cream, align: "center", size: 10 } : { bold: true, bg: OG, fontColor: WH, align: "center" });
    sr++;
    const supRows: { l1: string; v1: any; l2?: string; v2?: any; wide?: boolean }[] = [
      { l1: en ? "Company" : "상   호", v1: en ? B.companyEn : B.company, wide: true },
      { l1: en ? "Biz No." : "등록번호", v1: B.bizNo, l2: en ? "CEO" : "대   표", v2: `${en ? B.ceoEn : B.ceo} (인)` },
      { l1: en ? "Address" : "주   소", v1: en ? B.addressEn : B.address, wide: true },
      { l1: en ? "Type" : "업   태", v1: en ? B.bizTypeEn : B.bizType, l2: en ? "Category" : "종   목", v2: en ? B.bizCategoryEn : B.bizCategory },
      { l1: en ? "Contact" : "담당자", v1: en ? B.contactPersonEn : B.contactPerson, l2: en ? "Email" : "이메일", v2: B.email },
      { l1: en ? "Tel" : "전   화", v1: B.tel, l2: en ? "Fax" : "팩   스", v2: B.fax },
    ];
    supRows.forEach((row, i) => {
      const rr = sr + i;
      setCell(ws, rr, 5, row.l1, LB);
      if (row.wide) {
        ws.mergeCells(rr, 6, rr, 8);
        setCell(ws, rr, 6, row.v1, VB);
      } else {
        setCell(ws, rr, 6, row.v1, VL);
        setCell(ws, rr, 7, row.l2, LB);
        setCell(ws, rr, 8, row.v2, VL);
      }
    });
    sealAnchorRow = sr + 1; // 대표 행 (헤더바 다음, 상호 다음)
    headerRowCount = Math.max(leftRows, 1 + supRows.length);
    // M&C는 좌측 값이 D열까지 병합되어 공백 D열이 없다. 리멤버만 D·E 스페이서를 비운다.
    if (!MNC) for (let i = 0; i < headerRowCount; i++) setCell(ws, r + i, 4, "");
  } else {
    const rightInfo: [string, any][] = [
      [T.proposalDate, `${today.getFullYear()}. ${today.getMonth() + 1}. ${today.getDate()}`],
      [T.validity, T.validityVal],
      [T.supplier, en ? B.supplierEn : B.supplierKo],
      [T.address, en ? B.addressEn : B.addressKo],
      [T.manager, cfg.manager || ""],
    ];
    rightInfo.forEach(([label, val], i) => {
      setCell(ws, r + i, 6, label, { bold: true, bg: "FFF5F5F5", align: "center" });
      ws.mergeCells(r + i, 7, r + i, 8);
      setCell(ws, r + i, 7, val);
    });
    headerRowCount = Math.max(leftRows, rightInfo.length);
    for (let i = 0; i < headerRowCount; i++) { setCell(ws, r + i, 4, ""); setCell(ws, r + i, 5, ""); }
  }

  // 직인 삽입 — brand.sealBase64 있으면 대표 행 우측(col H)에 이미지 float.
  if (B.richSupplier && B.sealBase64 && sealAnchorRow) {
    try {
      const raw = String(B.sealBase64).replace(/^data:image\/\w+;base64,/, "");
      const ext = /^data:image\/jpe?g/i.test(B.sealBase64) ? "jpeg" : "png";
      const imgId = wb.addImage({ base64: raw, extension: ext });
      // 직인을 대표 셀(col H=native 7) 우측 끝 "(인)" 자리에 고정.
      // ExcelJS 소수 col 앵커는 커스텀 열너비에서 위치가 틀어져(fraction*colWidth로 EMU 환산하나
      // colWidth=너비*1e4라 실제 렌더 폭보다 작아 좌측에 몰림), 값을 실측 EMU로 직접 지정한다.
      // LibreOffice 렌더 기준 실측 캘리브레이션: 대표값(H)셀 폭 대비 도장 우측이 ~78%(테두리와 ~20% 여백),
      // 세로는 등록번호·대표 행에 중심을 두고 상호/주소 행으로 살짝 걸치도록 배치.
      ws.addImage(imgId, {
        tl: { nativeCol: 7, nativeColOff: 1_000_000, nativeRow: sealAnchorRow - 2, nativeRowOff: 30_000 },
        ext: { width: 60, height: 60 },
        editAs: "oneCell",
      });
    } catch (e: any) {
      console.warn("[exportEstimate] seal insert failed:", e?.message ?? e);
    }
  }

  const totalsRow1 = 5 + headerRowCount;   // 기본(리멤버): 10
  const totalsRow2 = totalsRow1 + 1;        // 11
  // 감수 반영: 옵션 없는 견적은 11행(옵션 제외 총액)이 없으므로 빈 행 리듬을 1개로 통일
  const sec1Start = (p.ot > 0 ? totalsRow2 : totalsRow1) + 2;

  // 견적 총액 / VAT — totalsRow1: 풀 견적, totalsRow2: 추가옵션 제외 견적 (옵션 있을 때만).
  const pkNoOpt = pkNoOptT;
  // 총액 행 렌더 — M&C는 부가세 포함 칸 없이 [라벨 | 국문금액 | 금액(넓게)] 밴드.
  const totalRowMnc = (row: number, label: string, amount: number, big: boolean): void => {
    labelCell(ws, row, 1, label);                                        // A: 라벨
    setCell(ws, row, 2, amountInWords(amount), { bold: true, bg: PAL.goldSoft, fontColor: PAL.ink, align: "right" }); // B: 한글표기(오른쪽)
    // C: 아라비아숫자 — 한글금액(B)과 붙도록 왼쪽 정렬 + 살짝 들여쓰기
    setCell(ws, row, 3, amount, { bold: true, size: big ? 14 : 12, fontColor: PAL.gold, numFmt: "₩#,##0", bg: PAL.goldSoft });
    ws.getCell(row, 3).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    ws.mergeCells(row, 4, row, 8);                                       // D-H: 골드 밴드 유지(빈칸)
    setCell(ws, row, 4, "", { bg: PAL.goldSoft });
    ws.getRow(row).height = big ? 22 : 20;
  };
  const totalRowStd = (row: number, label: string, amount: number, size: number): void => {
    // 감수 반영: 총액 밴드를 문서 최상위 위계로 — 오렌지 틴트 풀밴드 + 행높이 확대.
    // 숫자색은 레드(경고·차감 전용) 대신 브랜드 오렌지.
    const TOTAL_BG = "FFFFF3E9";
    labelCell(ws, row, 1, label);
    // 한글금액은 B:C 병합 셀에 기재 — B열 폭을 늘리지 않고도 한 줄에 들어간다
    ws.mergeCells(row, 2, row, 3);
    setCell(ws, row, 2, amountInWords(amount), { bold: true, bg: TOTAL_BG });
    ws.mergeCells(row, 4, row, 5);
    setCell(ws, row, 4, amount, { bold: true, size, fontColor: OG, numFmt: "₩#,##0", align: "right", bg: TOTAL_BG });
    setCell(ws, row, 6, T.vatIncl, { bold: true, bg: TOTAL_BG, align: "center" });
    ws.mergeCells(row, 7, row, 8);
    setCell(ws, row, 7, Math.round(amount * 1.1), { bold: true, numFmt: "₩#,##0", align: "right", bg: TOTAL_BG });
    ws.getRow(row).height = 27.5; // 사용자 확정 간격
  };
  if (MNC) totalRowMnc(totalsRow1, T.grandTotal, pkT, true);
  else totalRowStd(totalsRow1, T.grandTotal, pkT, 12);

  if (p.ot > 0) {
    if (MNC) totalRowMnc(totalsRow2, T.exclOptTotal, pkNoOpt, false);
    else totalRowStd(totalsRow2, T.exclOptTotal, pkNoOpt, 11);
  }

  // ========== 1. 베뉴 ==========
  // 다중 베뉴(cfg.venues 배열) 지원 — S-2 경로. 배열이 없으면 기존 단일 베뉴 렌더 유지.
  const venues: any[] | null = Array.isArray(cfg.venues) && cfg.venues.length > 0 ? cfg.venues : null;
  const isAutoVenue = !venues && p.s1 === target * VENUE_PER_PAX_5STAR;
  const fmtVenueDate = (d: any) => (d ? String(d).replace(/-/g, ".") : (en ? "Date TBD" : "일자 미정"));
  r = sec1Start;
  const sec1TitleRow = r;
  // 감수 반영: '예상치' 고지는 하단 밴드 1곳으로 일원화 — 타이틀·항목명·비고의 중복 표기 제거
  sectionTitle(ws, r, en ? "1. Venue Rental" : "1. 베뉴 사용료", s1T, T.subtotal);
  r++;
  ws.mergeCells(r, 1, r, 8);
  const venueWarn = ws.getCell(r, 1);
  const multiVenueGuide = venues && venues.length > 1
    ? (en ? " Only the venue marked 'O' in SELECT is counted (pick one)." : " 후보 베뉴 중 '선택=O' 1곳만 합산됩니다 (택1).")
    : "";
  venueWarn.value = (en
    ? (isAutoVenue
        ? "⚠️ Hotel cost is an estimate (KRW 180,000/pax) and not final. It must be confirmed against the venue's own quote."
        : "⚠️ Hotel cost is based on the negotiated rental and not final. It must be confirmed against the venue's own quote.")
    : (isAutoVenue
        ? "⚠️ 호텔 비용은 예상 산정치(인당 18만원 기준)이며 확정 금액이 아닙니다. 반드시 베뉴별 견적 확인을 통해 확정해야 합니다."
        : "⚠️ 호텔 비용은 베뉴 협의 대관료 기준이며 확정 금액이 아닙니다. 반드시 베뉴별 견적 확인을 통해 확정해야 합니다.")) + multiVenueGuide;
  // 정보성 유보 고지 — 레드(경고·차감 전용)가 아닌 앰버로 표기
  venueWarn.font = { size: 10, bold: true, color: { argb: "FFB45309" } };
  venueWarn.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  venueWarn.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } };
  venueWarn.border = borders;
  ws.getRow(r).height = 18.65; // 사용자 확정 간격
  r++;
  itemHeaders(ws, r, T.headers);
  r++;
  const sec1FirstItem = r;
  if (venues) {
    // 택1: 후보 베뉴를 나란히 기재하고 선택(G열 O/X)된 1곳만 금액 수식으로 합산한다.
    const selIdx = Math.max(0, Math.min(Math.round(Number(cfg.venueSelected) || 0), venues.length - 1));
    venues.forEach((v: any, vi: number) => {
      if (vi > 0) r++;
      const isSel = vi === selIdx;
      const rental = Number(v.rental) || 0;
      const vLabel = v.name || (en ? `Venue ${vi + 1}` : `베뉴 ${vi + 1}`);
      // 사용자 확정 패턴: 내용=호텔 등급, 산출 내역=`후보N · 이름 / 행사 일자`
      itemRow(ws, r, [
        en ? "Venue Rental" : "장소 사용료",
        en ? "5-Star Hotel" : "5성급 호텔",
        (venues.length > 1 ? (en ? `Candidate ${vi + 1} · ${vLabel} / ` : `후보${vi + 1} · ${vLabel} / `) : (v.name ? `${vLabel} / ` : ""))
          + (en ? `Date ${fmtVenueDate(v.date)}` : `행사 일자 ${fmtVenueDate(v.date)}`),
        rental, 1, isSel ? rental : 0,
        "",
      ]);
      // 금액(F) = 단가 × 수량 × (선택 O이면 1). 선택은 col7-8 병합 G열 참조 — 택1 연동.
      const fCell = ws.getCell(r, 6);
      fCell.value = { formula: `D${r}*E${r}*IF(G${r}="O",1,0)`, result: isSel ? rental : 0 };
      fCell.numFmt = "#,##0";
      fCell.alignment = { horizontal: "right", vertical: "middle" };
      fCell.border = borders;
      fCell.font = { size: 10 };
      const selCell = setCell(ws, r, 7, isSel ? "O" : "X", { bold: true, align: "center", ...(isSel ? { fontColor: OG } : {}) });
      selCell.dataValidation = { type: "list", allowBlank: false, formulae: ['"O,X"'] };
    });
  } else if (isAutoVenue) {
    itemRow(ws, r, [
      en ? "Venue Rental" : "장소 사용료",
      en ? "5-Star Hotel" : "5성급 호텔",
      cfg.venueName || (en ? `${target} pax × KRW 180,000` : `${target}명 × 180,000원`),
      VENUE_PER_PAX_5STAR, target, p.s1,
      "",
    ]);
  } else {
    itemRow(ws, r, [
      en ? "Venue Rental" : "장소 사용료",
      en ? "5-Star Hotel" : "5성급 호텔",
      cfg.venueName || (en ? "Negotiated rental" : "베뉴 협의 대관료"),
      p.s1, 1, p.s1,
      "",
    ]);
  }
  if (p.s1 > 0) {
    r++;
    itemRow(ws, r, ["", T.fbIncluded, T.fbRentalRatio, null, null, null,
      en ? `F&B: up to KRW ${Math.round(p.s1 * 0.8).toLocaleString("en-US")}` : `F&B: ${Math.round(p.s1 * 0.8).toLocaleString()}원까지 포함`]);
  }
  const sec1LastItem = appendAdjustRow(ws, r, "s1");
  r = sec1LastItem + 1;
  const sec1TotalR = r;
  totalRow(ws, r, s1T, { from: sec1FirstItem, to: sec1LastItem }, T.subtotal);
  linkSectionTitle(ws, sec1TitleRow, sec1TotalR, s1T);

  // ========== 2. 시스템 ==========
  const sb = p.sysBreakdown;
  // LED 오퍼레이팅 — 구 키(scaler4k) 미러 폴백 (구버전 저장 견적 호환)
  const ledOp = sb.ledOperating ?? sb.scaler4k ?? 0;
  r += 2;
  const sec2TitleRow = r;
  sectionTitle(ws, r, en ? "2. System / AV" : "2. 시스템 구축", s2T, T.subtotal);
  r++; itemHeaders(ws, r, T.headers);
  const regSpec = target > 200
    ? (en ? `Base ${won(1_000_000)} + ${Math.floor(target / 100)} self check-in kiosks` : `기본 ${won(1_000_000)} + 셀프 체크인 키오스크 ${Math.floor(target / 100)}대`)
    : (target > 100
        ? (en ? `Base ${won(1_000_000)} + surcharge for ${target - 100} pax over 100` : `기본 ${won(1_000_000)} + 100명 초과 ${target - 100}명분 가산`)
        : (en ? `Base ${won(1_000_000)} (flat up to 100 pax)` : `기본 ${won(1_000_000)} (100명까지 동일)`));
  const regRemark = target > 200
    ? (en ? `${Math.floor(target / 100)} kiosks (1 per 100 pax)` : `키오스크 ${Math.floor(target / 100)}대 (100명당 1대)`)
    : (target > 100
        ? (en ? "In-house registration (KRW 5,000 per pax over 100)" : "내부 등록시스템 (100명 초과 1명당 5,000원)")
        : (en ? "In-house registration (base)" : "내부 등록시스템 기본"));
  const sysRows = [
    [en ? "Video Console" : "영상 콘솔", cfg.displayType === "led" ? (en ? "LED display operation" : "LED 디스플레이 운용") : (en ? "Projector setup" : "빔프로젝터 활용"), en ? "Switcher + output console + splitter + full cabling" : "영상 스위처 + 송출 콘솔 + 배분기 + 케이블 일체", sb.video, 1, sb.video, ""],
    ledOp > 0 ? [en ? "LED Operating" : "LED 오퍼레이팅", en ? "V-mix switching + engineer" : "V-mix 스위칭 + 전담 엔지니어", en ? "Included for 100+ pax LED events · relay cost NOT included" : "100명 이상 LED 행사 기본 포함 · 중계 비용 불포함", ledOp, 1, ledOp, en ? "Auto-applied for 100+ pax with LED · relay is a separate add-on" : "100명 이상 · LED 선택 시 자동 적용 · 중계는 별도 옵션"] : null,
    [en ? "Sound System" : "음향 시스템", en ? "House PA + operation" : "하우스 PA + 운용", basePlusSpec(1_500_000, sb.audio), sb.audio, 1, sb.audio, en ? "+KRW 500,000 per 100 pax" : "인원 100명 단위로 500,000원 가산"],
    [en ? "Engineer" : "엔지니어", en ? "AV operation" : "영상·음향 운용", en ? "1 AV engineer · on-site for 1 day" : "영상·음향 엔지니어 1인 · 1일 상주", sb.engineer, 1, sb.engineer, ""],
    [en ? "Presentation Support" : "발표지원", en ? "Prompter/monitor/clicker" : "프롬프터·모니터·클리커", en ? "Prompter + presenter monitor + wireless clicker + backup laptop" : "프롬프터 + 발표자 모니터 + 무선 클리커 + 백업 노트북", sb.presentation, 1, sb.presentation, ""],
    [en ? "Registration System" : "등록시스템", en ? "Check-in/badge" : "체크인/명찰", regSpec, sb.registration, 1, sb.registration, regRemark],
    [en ? "Other Supplies" : "기타 필요물품", en ? "Cables/consumables" : "케이블·소모품 등", basePlusSpec(500_000, sb.misc), sb.misc, 1, sb.misc, en ? "+KRW 500,000 per 100 pax" : "인원 100명 단위로 500,000원 가산"],
  ].filter(Boolean) as any[][];
  let sec2FirstItem: number | null = null, sec2LastItem: number | null = null;
  sysRows.forEach(row => {
    r++;
    if (sec2FirstItem === null) sec2FirstItem = r;
    sec2LastItem = r;
    itemRow(ws, r, row);
  });
  sec2LastItem = appendAdjustRow(ws, sec2LastItem!, "s2");
  r = sec2LastItem + 1;
  const sec2TotalR = r;
  totalRow(ws, r, s2T, { from: sec2FirstItem!, to: sec2LastItem }, T.subtotal);
  linkSectionTitle(ws, sec2TitleRow, sec2TotalR, s2T);

  // ========== 3. 디자인 ==========
  const db = p.desBreakdown;
  r += 2;
  const sec3TitleRow = r;
  sectionTitle(ws, r, en ? "3. Design / Branding" : "3. 디자인·브랜딩", s3T, T.subtotal);
  r++; itemHeaders(ws, r, T.headers);
  const envTier = en
    ? (target <= 50 ? "up to 50 pax" : target <= 100 ? "51–100 pax" : target <= 150 ? "101–150 pax" : "151+ pax")
    : (target <= 50 ? "50명 이하" : target <= 100 ? "51~100명" : target <= 150 ? "101~150명" : "151명 이상");
  const desRows: any[][] = [
    [en ? "Environment Setup" : "환경조성", en ? "Signage/banner/staging" : "사인·배너·연출", en ? `Stage backdrop + signage + directional banners + on-site styling (${envTier})` : `무대 배경 + 사인물 + 동선 배너 + 현장 연출 일체 (${envTier})`, db.env, 1, db.env, en ? "Flat per pax tier" : "인원 구간별 정액"],
    [en ? "Web Page" : "웹페이지", en ? "Micro landing" : "마이크로 랜딩", en ? "Event landing + online RSVP form + responsive" : "행사 소개 페이지 + 온라인 사전등록 폼 + 반응형", db.web, 1, db.web, ""],
    [en ? "Key Visual" : "키비주얼", en ? "Main + variations" : "메인 + 베리에이션", en ? "1 main key visual + banner/signage/badge applications" : "메인 키비주얼 1종 + 배너·현수막·명찰 응용 전개", db.kv, 1, db.kv, ""],
  ];
  let sec3FirstItem: number | null = null, sec3LastItem: number | null = null;
  desRows.forEach(row => {
    r++;
    if (sec3FirstItem === null) sec3FirstItem = r;
    sec3LastItem = r;
    itemRow(ws, r, row);
  });
  sec3LastItem = appendAdjustRow(ws, sec3LastItem!, "s3");
  r = sec3LastItem + 1;
  const sec3TotalR = r;
  totalRow(ws, r, s3T, { from: sec3FirstItem!, to: sec3LastItem }, T.subtotal);
  linkSectionTitle(ws, sec3TitleRow, sec3TotalR, s3T);

  // ========== 4. 운영·보험 ==========
  const ob = p.opsBreakdown;
  r += 2;
  const sec4TitleRow = r;
  sectionTitle(ws, r, en ? `4. Operations · Staff · Insurance (${target} pax)` : `4. 운영인력·등록·보험 (${target}명 기준)`, s4T, T.subtotal);
  r++; itemHeaders(ws, r, T.headers);
  const opsRows: any[][] = [
    [en ? "Registration Desk" : "등록데스크 지원", en ? "Check-in operation" : "체크인 운영", en ? `1 staff per 50 pax (${target} pax → ${Math.ceil(target / 50)} staff)` : `참석 50명당 운영요원 1명 (${target}명 → ${Math.ceil(target / 50)}명)`, 250000, Math.ceil(target / 50), ob.desk, en ? "KRW 250,000 per staff" : "운영요원 1명당 250,000원"],
    [en ? "Event Staff" : "행사 운영 인력", en ? "On-site manager" : "현장 매니저·진행", basePlusSpec(900_000, ob.ops), ob.ops, 1, ob.ops, en ? "+KRW 300,000 per 100 pax over 100" : "100명 초과 시 100명 단위로 300,000원 가산"],
    [en ? "Venue Insurance" : "행사장 안전보험", en ? "Venue liability" : "행사장 책임보험", basePlusSpec(400_000, ob.insurance), ob.insurance, 1, ob.insurance, en ? "+KRW 100,000 per 100 pax over 100" : "100명 초과 시 100명 단위로 100,000원 가산"],
  ];
  let sec4FirstItem: number | null = null, sec4LastItem: number | null = null;
  opsRows.forEach(row => {
    r++;
    if (sec4FirstItem === null) sec4FirstItem = r;
    sec4LastItem = r;
    itemRow(ws, r, row);
  });
  sec4LastItem = appendAdjustRow(ws, sec4LastItem!, "s4");
  r = sec4LastItem + 1;
  const sec4TotalR = r;
  totalRow(ws, r, s4T, { from: sec4FirstItem!, to: sec4LastItem }, T.subtotal);
  linkSectionTitle(ws, sec4TitleRow, sec4TotalR, s4T);

  // ========== 5. 추가옵션 (조건부) ==========
  let sec5OptTotalR: number | null = null;
  if (p.ot > 0) {
    r += 2;
    const sec5TitleRow = r;
    sectionTitle(ws, r, en ? "5. Add-ons" : "5. 추가옵션", otT, T.subtotal);
    r++;
    ws.mergeCells(r, 1, r, 8);
    const optGuide = ws.getCell(r, 1);
    optGuide.value = T.optGuide;
    optGuide.font = { size: 10, color: { argb: "FF1565C0" } };
    optGuide.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    optGuide.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
    optGuide.border = borders;
    ws.getRow(r).height = 16; // 사용자 확정 간격
    r++;
    // 옵션 헤더 — 비고 칸 제거(스펙에 통합), 선택은 col7-8 병합 하나로
    const optHdr = en ? ["ITEM", "DESCRIPTION", "SPEC", "UNIT PRICE", "QTY", "AMOUNT"] : ["항목", "내용", "산출 내역", "단가", "수량", "금액"];
    optHdr.forEach((v, i) => setCell(ws, r, i + 1, v, { bold: true, bg: "FF333333", fontColor: WH, align: "center" }));
    ws.mergeCells(r, 7, r, 8);
    setCell(ws, r, 7, en ? "SELECT" : "선택", { bold: true, bg: "FF333333", fontColor: WH, align: "center" });
    const opt = cfg.options || {};
    const optRows: any[][] = [];
    // 기념품 — 단가·수량 설정값 반영 (미지정 시 인당 5만원 × 참석인원). 엔진과 동일 가드(resolveOverride).
    const souvUnit = resolveOverride(cfg.souvenirPrice, SOUVENIR_UNIT_PRICE);
    const souvQty = resolveOverride(cfg.souvenirQty, target);
    if (opt.souvenir) optRows.push([en ? "Souvenir" : "기념품", en ? "Attendee gift" : "참가자 기념품", en ? `KRW ${souvUnit.toLocaleString("en-US")} × ${souvQty}` : `개당 ${souvUnit.toLocaleString()}원 × ${souvQty}개`, souvUnit, souvQty, souvUnit * souvQty, en ? `KRW ${souvUnit.toLocaleString("en-US")}/unit` : `개당 ${souvUnit.toLocaleString()}원`]);
    if (opt.emcee) optRows.push([en ? "MC / Host" : "사회자", en ? "Professional host" : "전문 사회자", en ? "Corporate-grade" : "기업회의급", 1500000, 1, 1500000, ""]);
    if (opt.photo) optRows.push([en ? "Photography" : "사진촬영", en ? "Group + sessions" : "단체+세션", en ? "Per day" : "1일 기준", 800000, 1, 800000, ""]);
    if (opt.video) optRows.push([en ? "Videography" : "영상촬영", en ? "3–5 min sketch" : "스케치 3~5분", en ? "Shoot + edit" : "촬영+편집", 2000000, 1, 2000000, ""]);
    if (opt.aving) optRows.push(["AVING", en ? "Media package" : "미디어 패키지", en ? "Photo + video + PR" : "사진+영상+보도", 2500000, 1, 2500000, "AVING Korea/USA"]);
    // ─── 중계 계열 — 과금 판정은 엔진(relayBreakdown)이 단일 출처. 여기선 표기만 한다. ───
    // 화면중계·온라인중계·전체 녹화·편집은 각각 별도 행으로 나가며, LED 오퍼레이팅과 금액이 섞이지 않는다.
    const rb = p.relayBreakdown || {};
    if (rb.screenRelay > 0) optRows.push([en ? "Live Screen Relay" : "화면중계", en ? "Live feed to venue screen" : "행사장 화면 실시간 송출", en ? `${SCREEN_RELAY_CAMERAS} cameras + video switching + relay operator (1 day)` : `카메라 ${SCREEN_RELAY_CAMERAS}대 + 영상 스위칭 + 중계 오퍼레이터 (1일)`, SCREEN_RELAY_PRICE, 1, rb.screenRelay, en ? "LED only · separate from LED Operating" : "LED 전용 · LED 오퍼레이팅과 별도"]);
    if (rb.onlineRelay > 0) optRows.push([en ? "Online Relay" : "온라인중계", en ? "External online streaming + relay recording" : "외부 온라인 송출 + 중계녹화", en ? `${ONLINE_RELAY_CAMERAS} cameras + streaming system (add-on over Live Screen Relay)` : `카메라 ${ONLINE_RELAY_CAMERAS}대 + 온라인 송출 시스템 (화면중계 대비 증분)`, ONLINE_RELAY_ADDON_PRICE, 1, rb.onlineRelay, en ? `LED only · total with relay ${won(ONLINE_RELAY_TOTAL_PRICE)}` : `LED 전용 · 화면중계 포함 합계 ${won(ONLINE_RELAY_TOTAL_PRICE)}`]);
    if (rb.fullRecording > 0) optRows.push([en ? "Full Recording & Edit" : "전체 녹화·편집", en ? "All sessions + edited videos" : "풀 녹화 + 세션별 편집본", en ? "Add-on over the relay system · subtitles/titles editing" : "중계 시스템 위 증분 · 자막/타이틀 기본 편집", FULL_RECORDING_PRICE, 1, rb.fullRecording, en ? "Requires a relay option" : "중계 옵션 선택 시에만 적용"]);
    // RSVP 응대 대행 (패키지 옵션) — 전체 참석 × 2만원(평균). 게런티(모객) 보장 아님.
    if (opt.rsvpHandling) optRows.push([en ? "RSVP Handling" : "RSVP 응대 대행", en ? "Direct handling of all attendees" : "전체 참석 직접 응대", en ? `${target} pax × KRW 20,000 (avg.)` : `참석 ${target}명 × 인당 20,000원 (평균)`, 20000, target, target * 20000, en ? "Not a headcount guarantee" : "게런티(모객) 보장 아님"]);
    // LED 오퍼레이팅 옵션분 (100명 미만 전용) — 구 키 scaler4k도 동일 인정 (엔진과 동일 게이트)
    if ((opt.ledOperating || opt.scaler4k) && target < 100) optRows.push([en ? "LED Operating" : "LED 오퍼레이팅", en ? "Add-on" : "옵션 추가분", en ? "V-mix switching + engineer · relay cost NOT included" : "V-mix 스위칭 + 전담 엔지니어 · 중계 비용 불포함", LED_OPERATING_PRICE, 1, LED_OPERATING_PRICE, ""]);
    if (opt.survey) optRows.push([en ? "Post-survey" : "사후설문", en ? "Design + analysis" : "설계+분석", en ? "Report" : "보고서 제출", 1000000, 1, 1000000, ""]);
    if (opt.photowall_basic) optRows.push([en ? "Photo Wall" : "포토월", en ? "Basic (I-banner)" : "일반형 (I배너)", en ? "Install/removal incl." : "설치·철거 포함", 500000, 1, 500000, ""]);
    if (opt.photowall_premium) optRows.push([en ? "Photo Wall" : "포토월", en ? "Premium (carpentry)" : "고급형 (목공월)", en ? "Install/removal incl." : "설치·철거 포함", 2000000, 1, 2000000, ""]);
    // 부스 — 일반형/고급형 2타입, 단가 설정값 반영
    const boothCount = Number(cfg.boothCount) || 0;
    const boothPremiumCount = Number(cfg.boothPremiumCount) || 0;
    const boothUnit = resolveOverride(cfg.boothUnitPrice, BOOTH_UNIT_PRICE);
    const boothPremiumUnit = resolveOverride(cfg.boothPremiumUnitPrice, BOOTH_PREMIUM_UNIT_PRICE);
    if (boothCount > 0) optRows.push([en ? "Booth (Standard)" : "부스 설치 (일반형)", en ? "Modular booth (install/removal)" : "조립식 부스 (설치·철거 포함)", en ? `KRW ${boothUnit.toLocaleString("en-US")} × ${boothCount}` : `부스당 ${boothUnit.toLocaleString()}원 × ${boothCount}개`, boothUnit, boothCount, boothCount * boothUnit, ""]);
    if (boothPremiumCount > 0) optRows.push([en ? "Booth (Premium)" : "부스 설치 (고급형)", en ? "Carpentry-built, premium finish" : "목공·고급 마감 (설치·철거 포함)", en ? `KRW ${boothPremiumUnit.toLocaleString("en-US")} × ${boothPremiumCount}` : `부스당 ${boothPremiumUnit.toLocaleString()}원 × ${boothPremiumCount}개`, boothPremiumUnit, boothPremiumCount, boothPremiumCount * boothPremiumUnit, ""]);
    let sec5FirstItem: number | null = null, sec5LastItem: number | null = null;
    optRows.forEach(([item, desc, spec, unit, qty, amount, remark]) => {
      r++;
      if (sec5FirstItem === null) sec5FirstItem = r;
      sec5LastItem = r;
      setCell(ws, r, 1, item);
      setCell(ws, r, 2, desc);
      // 비고 내용을 상세스펙에 통합 (중복이면 스펙만)
      setCell(ws, r, 3, remark && !String(spec).includes(remark) ? `${spec} · ${remark}` : spec);
      setCell(ws, r, 4, unit, { numFmt: "#,##0", align: "right" });
      setCell(ws, r, 5, qty, { numFmt: "#,##0", align: "right" });
      // 금액(F) = 단가 × 수량 × (선택 O이면 1). 선택은 col7-8 병합이라 마스터 G열 참조.
      const fCell = ws.getCell(r, 6);
      fCell.value = { formula: `D${r}*E${r}*IF(G${r}="O",1,0)`, result: amount };
      fCell.numFmt = "#,##0";
      fCell.alignment = { horizontal: "right", vertical: "middle" };
      fCell.border = borders;
      fCell.font = { size: 10 };
      // 선택(비고+선택 통합, col7-8 병합) O=포함 / X=제외
      ws.mergeCells(r, 7, r, 8);
      const selCell = setCell(ws, r, 7, "O", { bold: true, align: "center" });
      selCell.dataValidation = { type: "list", allowBlank: false, formulae: ['"O,X"'] };
    });
    sec5LastItem = appendAdjustRow(ws, sec5LastItem!, "ot");
    r = sec5LastItem + 1;
    sec5OptTotalR = r;
    totalRow(ws, r, otT, sec5FirstItem ? { from: sec5FirstItem, to: sec5LastItem } : null, T.subtotal);
    linkSectionTitle(ws, sec5TitleRow, sec5OptTotalR, otT);
  }

  // ========== 6. PCO 기획료 (옵션 없으면 5번) ==========
  r += 2;
  const sec6TitleRow = r;
  sectionTitle(ws, r, en ? `${p.ot > 0 ? 6 : 5}. PCO Planning Fee` : `${p.ot > 0 ? 6 : 5}. PCO 기획료`, s5T, T.subtotal);
  // PCO는 단가×수량이 아니라 운영비×요율 구조 — 헤더를 운영비/요율로 표기
  const pcoHdr = en
    ? ["ITEM", "DESCRIPTION", "SPEC", "OP. COST", "RATE", "AMOUNT", "REMARKS"]
    : ["항목", "내용", "산출 내역", "운영비", "요율", "금액", "비고"];
  r++; itemHeaders(ws, r, pcoHdr);
  const opCost = opCostT;
  r++;
  const sec6PcoRow = r;
  // 산정식은 섹션 번호로 압축 표기 — 가장 긴 행이 열 폭을 결정하므로 장황한 항목 나열을 피한다
  const pcoBaseNo = p.ot > 0 ? "1~5" : "1~4";
  const genSpecKo = genManageT > 0 ? "+참관객" : "";
  const genSpecEn = genManageT > 0 ? "+attendees" : "";
  const pcoSpec = en
    ? (excludeLeads ? `25% of op. cost (sections ${pcoBaseNo}${genSpecEn})` : `25% of op. cost (sections ${pcoBaseNo}+RSVP${genSpecEn})`)
    : (excludeLeads ? `운영비 합계의 25% (섹션 ${pcoBaseNo}${genSpecKo})` : `운영비 합계의 25% (섹션 ${pcoBaseNo}+RSVP${genSpecKo})`);
  itemRow(ws, r, [en ? "PCO Planning Fee" : "PCO 기획료", en ? "Operating cost × 25%" : "운영비 × 25%", pcoSpec, opCost, 0.25, s5T, en ? "Rounded down to KRW 10,000" : "만원 미만 절사"]);
  ws.getCell(r, 5).numFmt = "0%";
  const pcoFCell = ws.getCell(sec6PcoRow, 6);
  pcoFCell.value = { formula: `FLOOR(D${sec6PcoRow}*E${sec6PcoRow},10000)`, result: s5T };
  pcoFCell.numFmt = "#,##0";
  pcoFCell.alignment = { horizontal: "right", vertical: "middle" };
  pcoFCell.border = borders;
  pcoFCell.font = { size: 10 };
  r++;
  const sec6TotalR = r;
  totalRow(ws, r, s5T, { from: sec6PcoRow, to: sec6PcoRow }, T.subtotal);
  linkSectionTitle(ws, sec6TitleRow, sec6TotalR, s5T);

  // ========== 7. 모객·참가인원 관리 (옵션 없으면 6번) ==========
  // - 모객(RSVP·쇼업)은 excludeLeads면 생략
  // - 일반 참관객 관리(genManage · 쇼업 게런티 아님)는 excludeLeads와 무관하게 있으면 표기
  let sec7RsvpRow: number | null = null, sec7GenRow: number | null = null, sec7TotalR: number | null = null;
  const hasLeadSection = !excludeLeads || genManageT > 0;
  const sec7T = (excludeLeads ? 0 : leadPkgT) + genManageT;
  if (hasLeadSection) {
    r += 2;
    const sec7TitleRow = r;
    const sec7No = p.ot > 0 ? 7 : 6;
    const sec7Title = excludeLeads
      ? (en ? `${sec7No}. Attendee Management` : `${sec7No}. 참가인원 관리`)
      : (en ? `${sec7No}. Audience Recruitment [Guarantee ${p.g}]` : `${sec7No}. 리멤버 모객 솔루션 [게런티 ${p.g}명]`);
    sectionTitle(ws, r, sec7Title, sec7T, T.subtotal);
    r++; itemHeaders(ws, r, T.headers);
    let sec7FirstItem: number | null = null, sec7LastItem: number | null = null;
    if (!excludeLeads) {
      r++;
      sec7RsvpRow = r;
      sec7FirstItem = sec7FirstItem ?? r;
      itemRow(ws, r, [en ? "RSVP Ops" : "RSVP 운영비", en ? "Attendance confirmation" : "참가확정 관리", en ? `Guarantee ${p.g} × KRW 40,000` : `게런티 ${p.g}명 × 인당 40,000원`, 40000, p.g, p.rsvpPkg, en ? "List KRW 50,000/pax → 40,000" : "정가 50,000원/명 → 40,000원 (1만원 할인)"]);
      r++;
      itemRow(ws, r, [en ? "Show-up Guarantee" : "쇼업 보장", en ? "Lead-gen + attendance" : "리드젠 + 참석 보장", en ? `Guarantee ${p.g} × KRW 350,000` : `게런티 ${p.g}명 × 인당 350,000원`, 350000, p.g, p.showup, en ? "List KRW 450,000/pax → 350,000" : "정가 450,000원/명 → 350,000원 (10만원 할인)"]);
      sec7LastItem = r;
    }
    if (genManageT > 0) {
      r++;
      sec7GenRow = r;
      sec7FirstItem = sec7FirstItem ?? r;
      itemRow(ws, r, [
        en ? "General Attendee Mgmt" : "일반 참관객 관리",
        en ? "Existing customers / external registrants" : "기고객·외부 등록자 응대",
        // 단가 근거: 쇼업 1명 확보에 평균 3배수 컨택(초청·리마인드·참가확정) 필요 — 인당 단가에 3회분 응대 원가 반영
        en
          ? `${p.genCount} show-ups × KRW ${GEN_ATTENDEE_UNIT_PRICE.toLocaleString("en-US")} · ≈${(p.genCount * 3).toLocaleString("en-US")} contacts (3×)`
          : `쇼업 ${p.genCount}명 × ${GEN_ATTENDEE_UNIT_PRICE.toLocaleString()}원 · 예상 컨택 ${(p.genCount * 3).toLocaleString()}명(3배수)`,
        GEN_ATTENDEE_UNIT_PRICE, p.genCount, genManageT,
        en ? "Not a guarantee · covers ~3 contacts" : "게런티 아님 · 컨택 3회분 응대 반영",
      ]);
      sec7LastItem = r;
    }
    if (!excludeLeads) sec7LastItem = appendAdjustRow(ws, sec7LastItem!, "leadPkg");
    r = sec7LastItem! + 1;
    sec7TotalR = r;
    totalRow(ws, r, sec7T, { from: sec7FirstItem!, to: sec7LastItem! }, T.subtotal);
    linkSectionTitle(ws, sec7TitleRow, sec7TotalR, sec7T);
  }

  // 섹션 6 PCO 기획료의 단가(D) 셀: 운영비 = s1+s2+s3+s4+ot+rsvpPkg+genManage를 다른 섹션 셀 참조로
  // 만들어 다른 섹션 값이 변하면 PCO 기획료도 자동 재계산되도록 한다. (모객 제외 시 RSVP 미포함)
  const opCostRefs = [`F${sec1TotalR}`, `F${sec2TotalR}`, `F${sec3TotalR}`, `F${sec4TotalR}`];
  if (sec5OptTotalR) opCostRefs.push(`F${sec5OptTotalR}`);
  if (sec7RsvpRow) opCostRefs.push(`F${sec7RsvpRow}`);
  if (sec7GenRow) opCostRefs.push(`F${sec7GenRow}`);
  ws.getCell(sec6PcoRow, 4).value = { formula: opCostRefs.join("+"), result: opCost };

  // ========== 주의 ==========
  r += 2;
  ws.mergeCells(r, 1, r, 8);
  const noticeCell = ws.getCell(r, 1);
  noticeCell.value = T.notice;
  noticeCell.font = { size: 10, color: { argb: "FFFF0000" } };
  noticeCell.alignment = { horizontal: "center", vertical: "middle" };
  noticeCell.border = borders;

  // ========== 그랜드 총합 + VAT (10행 풀 견적 / 11행 추가옵션 제외) — 모든 섹션 수식 주입 ==========
  const sectionTotalRefs = [`F${sec1TotalR}`, `F${sec2TotalR}`, `F${sec3TotalR}`, `F${sec4TotalR}`];
  if (sec5OptTotalR) sectionTotalRefs.push(`F${sec5OptTotalR}`);
  sectionTotalRefs.push(`F${sec6TotalR}`);
  if (sec7TotalR) sectionTotalRefs.push(`F${sec7TotalR}`);
  // M&C는 숫자 총액이 C열, 리멤버는 D열(4-5 병합). 부가세 포함(G)은 리멤버만.
  const totCol = MNC ? 3 : 4;
  ws.getCell(totalsRow1, totCol).value = { formula: sectionTotalRefs.join("+"), result: pkT };
  if (!MNC) ws.getCell(totalsRow1, 7).value = { formula: `ROUND(D${totalsRow1}*1.1,0)`, result: Math.round(pkT * 1.1) };
  if (p.ot > 0 && sec5OptTotalR) {
    const baseSum = `F${sec1TotalR}+F${sec2TotalR}+F${sec3TotalR}+F${sec4TotalR}`;
    const rsvpRef = sec7RsvpRow ? `+F${sec7RsvpRow}` : "";
    const genRef = sec7GenRow ? `+F${sec7GenRow}` : "";
    const leadTail = sec7TotalR ? `+F${sec7TotalR}` : "";
    ws.getCell(totalsRow2, totCol).value = {
      formula: `${baseSum}+FLOOR((${baseSum}${rsvpRef}${genRef})*0.25,10000)${leadTail}`,
      result: pkNoOpt,
    };
    if (!MNC) ws.getCell(totalsRow2, 7).value = { formula: `ROUND(D${totalsRow2}*1.1,0)`, result: Math.round(pkNoOpt * 1.1) };
  }

  // ─── 한글금액 자동 연동 (한국어 Excel의 NUMBERSTRING 함수) ───
  // 총액(D열)을 직접 수정하거나 상위 섹션 값이 바뀌면 한글 표기도 자동 갱신된다.
  // NUMBERSTRING은 한국어 Excel 전용 — 미지원 뷰어(Sheets 등)는 캐시된 결과 문자열을 표시한다.
  if (!en && !MNC) {
    const wordsFormula = (cellRef: string) => `"일금 "&NUMBERSTRING(${cellRef},1)&"원 정 ("&TEXT(${cellRef},"#,##0")&"원)"`;
    ws.getCell(totalsRow1, 2).value = { formula: wordsFormula(`D${totalsRow1}`), result: amountInWords(pkT) };
    if (p.ot > 0 && sec5OptTotalR) {
      ws.getCell(totalsRow2, 2).value = { formula: wordsFormula(`D${totalsRow2}`), result: amountInWords(pkNoOpt) };
    }
  }

  // 열 폭은 사용자 확정 그리드로 고정 — 자동 확장 없음 (2026-08-13)

  ws.pageSetup = {
    orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    horizontalCentered: true,
  };

  const buffer = await wb.xlsx.writeBuffer();
  const prefix = en ? B.filePrefixEn : B.filePrefix;
  const fn = `${prefix}_${projectName}_${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}.xlsx`;
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (download) saveAs(blob, fn);

  // v2.0: Drive 자동 백업 경로는 이식하지 않는다 — §12 금액 비노출 4중 차단 ③.
  return { fn, blob };
}
