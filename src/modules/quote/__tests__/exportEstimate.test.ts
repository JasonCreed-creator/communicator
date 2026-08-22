/** @vitest-environment jsdom */
// v2.0 이식: jsx-easy-shift main 6047834 src/lib/__tests__/exportEstimate.test.ts — 케이스 불변.
// 이식 시 조정 2건: ① backup 옵션 제거(Drive 백업 경로 미이식 — 설계서 §17.1)
// ② 화이트라벨 브랜드 픽스처를 가상 명칭으로 치환(#RULE-NO-COMPANY — 검증 메커니즘은 동일)
// + DoD 22 "외부 fetch 호출 0건" 어서션 추가.
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { exportEstimate } from "../export/exportEstimate";
import { calcEstimate, calcMncEstimate, calcPkExcludingOptions } from "../engine/calcEstimate";

/**
 * 견적서 Excel 출력 회귀 테스트.
 *
 * 핵심 보장:
 * 1. 컨피규레이터 설정값(직접 입력 대관료 등)이 그대로 기록된다 —
 *    엑셀이 수식을 재계산해도 값이 바뀌지 않는다 (단가×수량 = 금액 정합).
 * 2. 상단 합산: 10행 풀 견적 + 11행 추가옵션 제외 견적.
 * 3. "추천 홀" 같은 자동 추론 행을 임의 삽입하지 않는다.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cfg = Record<string, any>;

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

// 수식 셀이면 cached result, 아니면 값 자체
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any): number | null => {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v) return v.result as number;
  return null;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formulaOf = (v: any): string | null =>
  v && typeof v === "object" && "formula" in v ? (v.formula as string) : null;

// 샘플 견적(가상 행사)과 동일 조건: 300명 / 게런티 80명 / 대관료 3,600만 직접 입력
const SAMPLE_CFG: Cfg = {
  projectTitle: "샘플 테크 컨퍼런스 2026",
  target: 300,
  guarantee: 80,
  venueType: "5star",
  venueRegion: "서울 강남",
  venueName: "가상컨벤션센터 3F 그랜드볼룸",
  venueRental: 36_000_000,
  displayType: "led",
  options: { souvenir: true, emcee: true, video: true },
  boothCount: 3,
};

describe("exportEstimate — 설정값 충실 기록", () => {
  it("직접 입력한 대관료가 그대로 기록되고, 수식 재계산해도 값이 유지된다", async () => {
    const { ws, p } = await buildSheet(SAMPLE_CFG);
    expect(p.s1).toBe(36_000_000);

    // 베뉴 항목 행 (16행): 단가 = 입력 대관료, 수량 = 1 → D×E가 설정값과 일치
    const d = num(ws.getCell("D16").value);
    const e = num(ws.getCell("E16").value);
    const f = num(ws.getCell("F16").value);
    expect(d).toBe(36_000_000);
    expect(e).toBe(1);
    expect(f).toBe(36_000_000);
    // 종전 버그: 180,000 × 300 = 54,000,000 으로 재계산되어 설정값이 뒤집혔다
    expect((d ?? 0) * (e ?? 0)).toBe(p.s1);
  });

  it("모든 항목 행의 D×E 수식이 cached 금액과 일치한다 (엑셀 재계산 안전)", async () => {
    const { ws } = await buildSheet(SAMPLE_CFG);
    let checked = 0;
    ws.eachRow((row, rowNumber) => {
      const v = row.getCell(6).value;
      const formula = formulaOf(v);
      if (formula && new RegExp(`^D${rowNumber}\\*E${rowNumber}$`).test(formula)) {
        const d = num(row.getCell(4).value) ?? 0;
        const e = num(row.getCell(5).value) ?? 0;
        expect(Math.round(d * e)).toBe(num(v));
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(5);
  });

  it("자동 추론 '추천 홀' 행을 삽입하지 않는다", async () => {
    const { ws } = await buildSheet(SAMPLE_CFG);
    const texts: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => {
      if (typeof cell.value === "string") texts.push(cell.value);
    }));
    expect(texts.some((t) => t.includes("추천 홀"))).toBe(false);
  });

  it("디스플레이 설정(LED)이 영상 콘솔 설명에 반영된다", async () => {
    const { ws } = await buildSheet(SAMPLE_CFG);
    const texts: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => {
      if (typeof cell.value === "string") texts.push(cell.value);
    }));
    expect(texts).toContain("LED 디스플레이 운용");
    expect(texts).not.toContain("빔프로젝터 활용");
  });
});

describe("exportEstimate — 상단 합산 (풀 견적 / 추가옵션 제외)", () => {
  it("10행 풀 견적, 11행 추가옵션 제외 견적이 각각 표기된다", async () => {
    const { ws, p } = await buildSheet(SAMPLE_CFG);
    const pkNoOpt = calcPkExcludingOptions(p);

    expect(ws.getCell("A10").value).toBe("총 견적금액(VAT별도)");
    expect(num(ws.getCell("D10").value)).toBe(p.pk);
    expect(num(ws.getCell("G10").value)).toBe(Math.round(p.pk * 1.1));

    expect(ws.getCell("A11").value).toBe("추가옵션 제외(VAT별도)");
    expect(num(ws.getCell("D11").value)).toBe(pkNoOpt);
    expect(num(ws.getCell("G11").value)).toBe(Math.round(pkNoOpt * 1.1));
    // PCO 기획료 재계산(만원 미만 절사)이 수식에 포함되어야 정확
    expect(formulaOf(ws.getCell("D11").value)).toContain("FLOOR(");
    expect(pkNoOpt).toBeLessThan(p.pk);
  });

  it("옵션이 없으면 11행 없이 풀 견적만, 섹션 번호는 5·6으로 이어진다", async () => {
    const cfg = { ...SAMPLE_CFG, options: {}, boothCount: 0 };
    const { ws, p } = await buildSheet(cfg);
    expect(p.ot).toBe(0);
    expect(num(ws.getCell("D10").value)).toBe(p.pk);
    expect(ws.getCell("A11").value).toBeNull();

    const texts: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => {
      if (typeof cell.value === "string") texts.push(cell.value);
    }));
    expect(texts.some((t) => t.startsWith("5. PCO 기획료"))).toBe(true);
    expect(texts.some((t) => t.startsWith("6. 리멤버 모객 솔루션"))).toBe(true);
    expect(texts.some((t) => t.startsWith("5. 추가옵션"))).toBe(false);
  });

  it("섹션 소계의 합 = 풀 견적 (0원 일치)", async () => {
    const { ws, p } = await buildSheet(SAMPLE_CFG);
    const d10 = ws.getCell("D10").value;
    const refs = (formulaOf(d10) ?? "").split("+");
    const total = refs.reduce((sum, ref) => sum + (num(ws.getCell(ref.trim()).value) ?? 0), 0);
    expect(total).toBe(p.pk);
  });

  it.each([50, 150, 300])(
    "target=%i — SPEC/산정식 컬럼에 개발 수식(ceil/floor/max/≤)이 노출되지 않는다",
    async (target) => {
      const cfg = { ...SAMPLE_CFG, target, guarantee: Math.min(target, 80), venueRental: undefined };
      const { ws } = await buildSheet(cfg);
      const offenders: string[] = [];
      ws.eachRow((row) => row.eachCell((cell) => {
        if (typeof cell.value === "string" && /ceil\(|floor\(|max\(0|≤/.test(cell.value)) {
          offenders.push(cell.value);
        }
      }));
      expect(offenders).toEqual([]);
    },
  );

  it("추가옵션 행에 선택(H) O/X 토글이 있고 금액 = D*E*IF(H=\"O\",1,0) 수식으로 연동된다", async () => {
    const { ws } = await buildSheet(SAMPLE_CFG);
    let optionRows = 0;
    ws.eachRow((row, rowNumber) => {
      const f = row.getCell(6).value;
      const formula = formulaOf(f);
      if (formula && new RegExp(`^D${rowNumber}\\*E${rowNumber}\\*IF\\(G${rowNumber}="O",1,0\\)$`).test(formula)) {
        // 선택 셀(비고+선택 통합, col7-8 병합 마스터 G) 기본 "O"
        expect(row.getCell(7).value).toBe("O");
        const d = num(row.getCell(4).value) ?? 0;
        const e = num(row.getCell(5).value) ?? 0;
        expect(num(f)).toBe(d * e);
        optionRows++;
      }
    });
    expect(optionRows).toBeGreaterThan(0); // souvenir/emcee/video/booth
  });

  it("섹션 조정(adjustments) 시 '조정' 라인이 추가되고 소계·총액이 재계산된다", async () => {
    const adjustments = { s1: -3_000_000, ot: -500_000 };
    const p = calcEstimate(SAMPLE_CFG);
    const { ws } = await buildSheet(SAMPLE_CFG, { adjustments });

    // '조정' 라벨 라인이 존재
    const labels: string[] = [];
    ws.eachRow((row) => {
      const a = row.getCell(1).value;
      if (typeof a === "string") labels.push(a);
    });
    expect(labels.filter((t) => t === "조정").length).toBe(2);

    // 총액(D10) = 조정 반영 pk (베뉴 -300만, 옵션 -50만 + PCO 재계산)
    const opCostT = (p.s1 - 3_000_000) + p.s2 + p.s3 + p.s4 + (p.ot - 500_000) + p.rsvpPkg;
    const s5T = Math.floor((opCostT * 0.25) / 10_000) * 10_000;
    const pkT = (p.s1 - 3_000_000) + p.s2 + p.s3 + p.s4 + s5T + (p.ot - 500_000) + p.rsvpPkg + p.showup;
    expect(num(ws.getCell("D10").value)).toBe(pkT);
    expect(num(ws.getCell("G10").value)).toBe(Math.round(pkT * 1.1));

    // 섹션 소계 합 = 총액 (수식 정합)
    const refs = (formulaOf(ws.getCell("D10").value) ?? "").split("+");
    const total = refs.reduce((s, ref) => s + (num(ws.getCell(ref.trim()).value) ?? 0), 0);
    expect(total).toBe(pkT);
  });

  it("조정이 없으면 '조정' 라인을 추가하지 않는다", async () => {
    const { ws } = await buildSheet(SAMPLE_CFG);
    const labels: string[] = [];
    ws.eachRow((row) => {
      const a = row.getCell(1).value;
      if (typeof a === "string") labels.push(a);
    });
    expect(labels).not.toContain("조정");
  });

  it("100명 이상 + 잔존 scaler4k 옵션 설정에서도 옵션 소계가 엔진과 일치 (중복 청구 방지)", async () => {
    // 과거 저장 견적 복원 시 target≥100인데 options.scaler4k가 남아있을 수 있음
    const cfg = { ...SAMPLE_CFG, options: { scaler4k: true, emcee: true }, boothCount: 0 };
    const { ws, p } = await buildSheet(cfg);
    expect(p.ot).toBe(1_500_000); // emcee만 — scaler4k는 시스템(섹션2) 자동 포함
    let optTotal: number | null = null;
    ws.eachRow((row) => {
      const a = row.getCell(1).value;
      if (typeof a === "string" && a.startsWith("5. 추가옵션")) {
        optTotal = num(row.getCell(6).value);
      }
    });
    expect(optTotal).toBe(p.ot);
  });
});

// 모든 문자열 셀 수집
function collectTexts(ws: ExcelJS.Worksheet): string[] {
  const texts: string[] = [];
  ws.eachRow((row) => row.eachCell((cell) => {
    if (typeof cell.value === "string") texts.push(cell.value);
  }));
  return texts;
}

describe("exportEstimate — excludeLeads (순수 패키지)", () => {
  it("모객 섹션·게런티 표기가 사라지고 총액은 패키지 견적과 일치", async () => {
    const cfg = { ...SAMPLE_CFG };
    const p = calcMncEstimate(cfg);
    const { blob } = await exportEstimate(cfg, p, { download: false, excludeLeads: true });
    const buf = await new Promise<ArrayBuffer>((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(fr.error); fr.onload = () => res(fr.result as ArrayBuffer);
      fr.readAsArrayBuffer(blob);
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    const texts = collectTexts(ws);

    // 모객 솔루션 섹션이 없어야 함
    expect(texts.some((t) => t.includes("모객 솔루션"))).toBe(false);
    expect(texts.some((t) => t.startsWith("참석/모객"))).toBe(false);
    expect(texts).toContain("참석 인원");

    // 총액(D10) = 패키지 견적 pk (모객 미포함)
    expect(num(ws.getCell("D10").value)).toBe(p.pk);
    // 섹션 소계 합 = pk
    const refs = (formulaOf(ws.getCell("D10").value) ?? "").split("+");
    const total = refs.reduce((s, ref) => s + (num(ws.getCell(ref.trim()).value) ?? 0), 0);
    expect(total).toBe(p.pk);
  });

  it("RSVP 응대 대행 옵션 행이 참석×20,000으로 기록된다", async () => {
    const cfg = { ...SAMPLE_CFG, options: { rsvpHandling: true }, boothCount: 0, venueRental: undefined, target: 120 };
    const p = calcMncEstimate(cfg);
    expect(p.ot).toBe(120 * 20_000);
    const { blob } = await exportEstimate(cfg, p, { download: false, excludeLeads: true });
    const buf = await new Promise<ArrayBuffer>((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(fr.error); fr.onload = () => res(fr.result as ArrayBuffer);
      fr.readAsArrayBuffer(blob);
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    let found: number | null = null;
    ws.eachRow((row) => {
      if (row.getCell(1).value === "RSVP 응대 대행") found = num(row.getCell(6).value);
    });
    expect(found).toBe(120 * 20_000);
  });
});

describe("exportEstimate — 영문 변환 (lang=en) · 브랜드", () => {
  it("lang=en 이면 섹션·총액 라벨이 영문으로 출력된다", async () => {
    const cfg = { ...SAMPLE_CFG };
    const p = calcMncEstimate(cfg);
    const { blob } = await exportEstimate(cfg, p, { download: false, excludeLeads: true, lang: "en" });
    const buf = await new Promise<ArrayBuffer>((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(fr.error); fr.onload = () => res(fr.result as ArrayBuffer);
      fr.readAsArrayBuffer(blob);
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const texts = collectTexts(wb.worksheets[0]);
    expect(texts).toContain("Total (VAT excl.)");
    expect(texts.some((t) => t.startsWith("1. Venue Rental"))).toBe(true);
    expect(texts).not.toContain("총 견적금액(VAT별도)");
  });

  it("brand 옵션이 파일명 prefix에 반영된다", async () => {
    const cfg = { ...SAMPLE_CFG };
    const p = calcMncEstimate(cfg);
    const brand = {
      titleKo: "파트너 패키지 견적서", titleEn: "Partner Package Estimate",
      titleKoMnc: "파트너 패키지 견적서", titleEnMnc: "Partner Package Estimate",
      sheetName: "Partner_Package",
      supplierKo: "가상파트너", supplierEn: "Virtual Partner", addressKo: "", addressEn: "",
      filePrefix: "파트너견적서", filePrefixEn: "Partner_Estimate",
      defaultProjectKo: "파트너 패키지", defaultProjectEn: "Partner Package",
    };
    const en = await exportEstimate(cfg, p, { download: false, excludeLeads: true, lang: "en", brand });
    expect(en.fn.startsWith("Partner_Estimate_")).toBe(true);
    const ko = await exportEstimate(cfg, p, { download: false, excludeLeads: true, lang: "ko", brand });
    expect(ko.fn.startsWith("파트너견적서_")).toBe(true);
  });
});

// 1x1 투명 PNG (직인 삽입 테스트용)
const TINY_PNG = "iVBORw0KGgoAAAABJRU5ErkJggg==".length > 0
  ? "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  : "";
// 화이트라벨 브랜드 픽스처 — #RULE-NO-COMPANY: 전부 가상 명칭 (원본의 실사업자 정보 치환,
// richSupplier/mncLayout 렌더 메커니즘 검증은 동일)
const PARTNER_BRAND = {
  titleKo: "파트너 MICE 패키지 견적서", titleEn: "Partner MICE Package Estimate",
  titleKoMnc: "파트너 MICE 패키지 견적서", titleEnMnc: "Partner MICE Package Estimate",
  sheetName: "Partner_Package", filePrefix: "파트너견적서", filePrefixEn: "Partner_Estimate",
  defaultProjectKo: "파트너 패키지 견적", defaultProjectEn: "Partner Package Estimate",
  mncLayout: true, richSupplier: true,
  company: "주식회사 가상엠씨파트너스", companyEn: "Virtual MC Partners Co., Ltd.",
  bizNo: "000-00-00000", ceo: "김대표", ceoEn: "Kim Daepyo",
  bizType: "서비스", bizTypeEn: "Service", bizCategory: "국제회의기획", bizCategoryEn: "International Conference Planning",
  address: "서울 가상구 가상로 1, 100호", addressEn: "#100, 1 Gasang-ro, Seoul",
  contactPerson: "박담당 실장", contactPersonEn: "Park Damdang (Director)",
  email: "partner@example.com", tel: "02-0000-0000", fax: "02-0000-0001",
  sealBase64: "",
};

async function loadWs(cfg: Cfg, opts: Record<string, unknown>) {
  const p = calcMncEstimate(cfg);
  const { blob } = await exportEstimate(cfg, p, { download: false, ...opts });
  const buf = await new Promise<ArrayBuffer>((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error); fr.onload = () => res(fr.result as ArrayBuffer);
    fr.readAsArrayBuffer(blob);
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { ws: wb.worksheets[0], wb, p };
}

describe("exportEstimate — 공급자(richSupplier) 블록 + 직인", () => {
  it("공급자 사업자등록 항목이 모두 기재되고 상단 제목이 브랜드 제목", async () => {
    const { ws } = await loadWs(SAMPLE_CFG, { excludeLeads: true, brand: PARTNER_BRAND });
    const texts = collectTexts(ws);
    expect(texts).toContain("주식회사 가상엠씨파트너스");
    expect(texts).toContain("000-00-00000");
    expect(texts).toContain("partner@example.com");
    expect(texts).toContain("국제회의기획");
    expect(texts).toContain("02-0000-0000");
    expect(texts).toContain("02-0000-0001");
    expect(texts.some((t) => t.includes("김대표"))).toBe(true);
    expect(texts).toContain("파트너 MICE 패키지 견적서");
  });

  it("헤더 높이가 늘어도 총액 수식 정합(섹션 소계 합 = pk)이 유지된다", async () => {
    const { ws, p } = await loadWs(SAMPLE_CFG, { excludeLeads: true, brand: PARTNER_BRAND });
    let totRow: number | null = null;
    ws.eachRow((row, n) => { if (row.getCell(1).value === "총 견적금액(VAT별도)") totRow = n; });
    expect(totRow).not.toBeNull();
    // mncLayout는 숫자 총액이 C열(3)
    const d = ws.getCell(totRow!, 3).value;
    expect(num(d)).toBe(p.pk);
    const refs = (formulaOf(d) ?? "").split("+");
    const sum = refs.reduce((s, ref) => s + (num(ws.getCell(ref.trim()).value) ?? 0), 0);
    expect(sum).toBe(p.pk);
  });

  it("sealBase64가 주어지면 워크시트에 직인 이미지가 임베드된다", async () => {
    const { ws } = await loadWs(SAMPLE_CFG, { excludeLeads: true, brand: { ...PARTNER_BRAND, sealBase64: TINY_PNG } });
    expect(ws.getImages().length).toBeGreaterThan(0);
  });

  it("sealBase64가 비어있으면 직인 없이도 정상 생성", async () => {
    const { ws } = await loadWs(SAMPLE_CFG, { excludeLeads: true, brand: PARTNER_BRAND });
    expect(ws.getImages().length).toBe(0);
  });
});

describe("DoD 22 — 외부 업로드·네트워크 호출 0건", () => {
  it("exportEstimate 실행 중 절대 URL(외부) fetch가 한 번도 발생하지 않는다", async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = ((input: unknown) => {
      const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? input);
      calls.push(url);
      return Promise.reject(new Error("network disabled in test"));
    }) as typeof fetch;
    try {
      const p = calcEstimate(SAMPLE_CFG);
      await exportEstimate(SAMPLE_CFG, p, { download: false });
    } finally {
      globalThis.fetch = origFetch;
    }
    // 허용되는 유일한 fetch = same-origin 로고 자산(상대 경로). http(s) 외부 호출은 0건.
    expect(calls.filter((u) => /^https?:\/\//i.test(u))).toEqual([]);
  });

  it("이식 모듈 어디에도 Drive 업로드 코드가 남아있지 않다 (정적 가드)", async () => {
    const source = (await import("../export/exportEstimate?raw")) as unknown as { default: string };
    expect(source.default).not.toContain("uploadToDrive");
    expect(source.default).not.toContain("driveUpload");
    expect(source.default).not.toMatch(/\bbackup\s*[=:]/);
  });
});
