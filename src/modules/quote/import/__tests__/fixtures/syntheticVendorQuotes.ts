// 골든 픽스처 — **협력사 견적서**(Phase 4.7 · 설계서 v2.11 §19.5)를 본뜬 가상 워크북을 exceljs로 그 자리에서 만든다.
// R-Q4: 실고객·실협력사 견적서 파일은 레포에 커밋하지 않는다(바이너리도 두지 않는다). #RULE-NO-COMPANY: 전부 가상 명칭.
// 구조는 견적서 임포트 A형(단가·수량·일수)·B형(ITEM·금액)을 따른다 — 실서식 보정은 사용자 실샘플을 받은 뒤(가정).
import ExcelJS from 'exceljs'

type Cell = string | number | null
type Sheet = Record<number, Cell[]>

async function build(sheetName: string, sheet: Sheet): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  for (const [rowNo, cells] of Object.entries(sheet)) {
    cells.forEach((value, i) => {
      if (value === null || value === '') return
      ws.getRow(Number(rowNo)).getCell(i + 1).value = value
    })
  }
  const buf = await wb.xlsx.writeBuffer()
  if (buf instanceof ArrayBuffer) return buf
  const view = new Uint8Array(buf as unknown as ArrayBufferLike)
  const out = new ArrayBuffer(view.byteLength)
  new Uint8Array(out).set(view)
  return out
}

/** 음향·조명 협력사 — A형 · 부가세 줄 있음(항목은 별도) · 할인(음수) 행 포함 */
export const VENDOR_AV_EXPECTED = {
  itemsSum: 20_000_000,
  vat: 2_000_000,
  grandTotal: 22_000_000,
  rows: 6,
  /** 섹션 → 제안 버킷(원가 버킷) */
  buckets: { '1. 음향': 's2', '2. 조명': 's2', '3. 현장 운영': 's4' } as Record<string, string>,
}

export function syntheticVendorQuoteAV(): Promise<ArrayBuffer> {
  const sheet: Sheet = {
    1: ['견 적 서'],
    3: ['행 사 명', '가상 테크 포럼 2027', null, null, null, null, '상      호', null, '가상음향㈜'],
    7: ['견적일시', '2027. 02. 01', null, null, null, null, '담 당 자', null, '박음향'],
    8: ['견적금액', '금 이천이백만원 정 (￦22,000,000/원) 부가세 포함'],
    10: ['1. 항목 합계', null, null, null, null, null, null, null, 20_000_000],
    11: ['2. 부가세', null, null, null, null, null, null, null, 2_000_000],
    12: ['총 견적', null, null, null, null, null, null, null, 22_000_000],
    14: ['세부 산출내역   (금액 단위: 원, VAT 별도)'],
    15: ['구  분', '항  목', '규격 · 사양', '단  가', '수  량', '일  수', null, null, '금  액', '비  고'],
    16: ['1. 음향'],
    17: ['음향', '메인 스피커 시스템', '라인어레이 L/R', 6_000_000, 1, 1, null, null, 6_000_000],
    18: ['음향', '무선 마이크', '핸드 4 · 핀 2', 500_000, 4, 1, null, null, 2_000_000],
    19: ['소계', null, null, null, null, null, null, null, 8_000_000],
    20: ['2. 조명'],
    21: ['조명', '무빙 라이트', '스팟 6대', 1_000_000, 6, 1, null, null, 6_000_000],
    22: ['소계', null, null, null, null, null, null, null, 6_000_000],
    23: ['3. 현장 운영'],
    24: ['인력', '오퍼레이터', '5명 × 2일', 300_000, 5, 2, null, null, 3_000_000],
    25: ['운송', '장비 운송 · 설치', '5톤 2대 왕복', 2_000_000, 2, 1, null, null, 4_000_000],
    26: ['할인', '패키지 할인', null, -1_000_000, 1, 1, null, null, -1_000_000],
    27: ['소계', null, null, null, null, null, null, null, 6_000_000],
  }
  return build('가상 협력사 견적 AV', sheet)
}

/** 기념품 협력사 — B형(ITEM·금액) · 부가세 표기 없음(포함/별도 모름) · 섹션 1개 */
export function syntheticVendorQuoteGifts(): Promise<ArrayBuffer> {
  const sheet: Sheet = {
    1: ['QUOTATION'],
    3: ['행사명', '가상 테크 포럼 2027'],
    4: ['담당자', '최선물'],
    6: ['ITEM', 'DESCRIPTION', 'SIZE(mm) / SPEC', '금액', 'REMARKS'],
    7: ['1. 기념품 제작'],
    8: ['텀블러', '로고 인쇄 텀블러', '350ml · 300개', 3_000_000],
    9: ['에코백', '로고 인쇄 에코백', '300개', 1_500_000],
    10: ['포장', '개별 포장·배송', '300세트', 500_000],
    11: ['total', null, null, 5_000_000],
  }
  return build('가상 협력사 견적 기념품', sheet)
}
