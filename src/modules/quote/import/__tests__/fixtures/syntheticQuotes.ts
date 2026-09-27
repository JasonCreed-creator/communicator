// 골든 픽스처 — A·B·C 서식을 본뜬 **가상 견적서**를 exceljs로 그 자리에서 만든다.
//
// R-Q4: 실고객 견적서 파일은 레포에 커밋하지 않는다. 바이너리도 두지 않는다 —
// 워크북을 테스트 실행 시점에 프로그램으로 만들어 파서에 먹인다.
// #RULE-NO-COMPANY: 회사·행사·인명은 전부 가상 명칭.
//
// 구조만 실서식에서 가져왔다(열 배치·총액 블록·소계 행·"5-1" 소수 섹션·"(총액 미포함)" 옵션 행·
// SELECT O/X). 금액은 검산이 정확히 떨어지도록 새로 설계한 값이다.
import ExcelJS from 'exceljs'

async function toArrayBuffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buf = await wb.xlsx.writeBuffer()
  if (buf instanceof ArrayBuffer) return buf
  const view = new Uint8Array(buf as unknown as ArrayBufferLike)
  const out = new ArrayBuffer(view.byteLength)
  new Uint8Array(out).set(view)
  return out
}

type Cell = string | number | null
/** 1-based 행 번호 → 값 배열(A열부터). null은 빈 셀 */
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
  return toArrayBuffer(wb)
}

// ── A형: 단가·수량·일수 + 상단 총액 블록(대행료 25% → 절사 → VAT → VAT 포함 총액) ──
export const A_EXPECTED = {
  itemsSum: 90_000_000,
  agencyFee: 22_500_000,
  rounding: -681_818,
  vat: 11_181_818,
  grandTotal: 123_000_000,
  sections: 8,
  items: 21,
}

export function syntheticQuoteA(): Promise<ArrayBuffer> {
  const sheet: Sheet = {
    1: ['견 적 서 (세부 산출내역)'],
    3: ['행 사 명', '가상 커머스 서밋 2027', null, null, null, null, '상      호', null, '가상기획㈜'],
    4: ['고 객 명', '가상커머스', null, null, null, null, '등록번호', null, '000-00-00000'],
    5: ['일     시', '2027.03.10(설치) ~ 03.11(본행사)'],
    6: ['장     소', '가상컨벤션센터 그랜드홀 전관'],
    7: ['견적일시', '2027. 01. 15', null, null, null, null, '담 당 자', null, '김기획  |  가상기획'],
    8: ['견적금액', '금 일억이천삼백만원 정 (￦123,000,000/원) 부가세 포함'],
    10: ['1. 항목 합계', null, null, null, null, null, null, null, 90_000_000],
    11: [
      '2. 행사 기획·운영 대행료 (기획 인건비 15% + 기업이윤 10%)',
      null, null, null, null, null, null, null,
      22_500_000,
      '위 1번 합계의 25% · 만원 단위 절사',
    ],
    12: ['3. 총계 (1+2)', null, null, null, null, null, null, null, 112_500_000],
    13: ['4. 절사 (백만원 미만 절사)', null, null, null, null, null, null, null, -681_818, '부가세 포함 총액 기준'],
    14: ['5. 부가세 (3+4의 10%)', null, null, null, null, null, null, null, 11_181_818],
    15: ['총 견적', null, null, null, null, null, null, null, 123_000_000],
    17: ['세부 산출내역   (금액 단위: 원, VAT 별도)'],
    18: ['구  분', '항  목', '규격 · 사양', '단  가', '수  량', '일  수', null, null, '금  액', '비  고'],

    19: ['1. 장소 대관료'],
    20: ['대관료', '그랜드홀 전관 — 설치일', '03.10 09:00~18:00', 5_000_000, 1, 1, null, null, 5_000_000, '설치일 할인'],
    21: ['대관료', '그랜드홀 전관 — 행사 당일', '03.11 09:00~20:00', 12_000_000, 1, 1, null, null, 12_000_000],
    22: ['로비', '그랜드홀 앞 로비', '50㎡ (1일 기준)', 1_000_000, 1, 2, null, null, 2_000_000],
    23: ['소계', null, null, null, null, null, null, null, 19_000_000],

    24: ['2. 무대 및 공간 조성'],
    25: ['메인 무대', '무대 제작 · 설치', 'W12,000 × D5,000 × H600', 8_000_000, 1, 1, null, null, 8_000_000],
    26: ['등록데스크', '등록 · 안내 데스크', '응대 4라인 + 안내 1라인', 3_000_000, 1, 1, null, null, 3_000_000],
    27: ['상담부스', '1:1 상담부스', '4부스 / 파티션형', 1_000_000, 4, 1, null, null, 4_000_000],
    28: ['소계', null, null, null, null, null, null, null, 15_000_000],

    29: ['3. 무대 영상 · 음향 · 조명'],
    30: ['무대 LED 화면', 'LED 스크린', 'W12,000 × H4,000', 12_000_000, 1, 1, null, null, 12_000_000],
    31: ['음향', '음향 시스템', '메인 + 딜레이 + 무선 마이크', 6_000_000, 1, 1, null, null, 6_000_000],
    32: ['무대 조명', '무대 조명', '기본 조명 + 무빙 + 연사 스팟', 5_000_000, 1, 1, null, null, 5_000_000],
    33: ['소계', null, null, null, null, null, null, null, 23_000_000],

    34: ['4. 현장 등록 · 명찰 발급'],
    35: ['명찰 발급', '명찰출력 패키지', '솔루션 + 장비 + 소모품', 2_000_000, 1, 1, null, null, 2_000_000],
    36: ['명찰 발급', '명찰 추가 발급분', '현장 등록 200명분', 2_500, 200, 1, null, null, 500_000],
    37: ['등록 운영', '오퍼레이터 파견', '1명 × 2일', 500_000, 1, 2, null, null, 1_000_000],
    38: ['소계', null, null, null, null, null, null, null, 3_500_000],

    39: ['5. 디자인 및 콘텐츠 제작'],
    40: ['그래픽 디자인', '행사 전체 디자인', '무대 배경 · 사인 · 인쇄물', 3_000_000, 1, 1, null, null, 3_000_000],
    41: ['오프닝 영상', '편집 · 모션그래픽', '2~3분', 6_000_000, 1, 1, null, null, 6_000_000],
    42: ['소계', null, null, null, null, null, null, null, 9_000_000],

    43: ['6. 현장 인력 및 운영'],
    44: ['사회자', '전문 MC', '리허설 참여 포함', 1_500_000, 1, 1, null, null, 1_500_000],
    45: ['운영 인력', '현장 운영 요원', '10명', 180_000, 10, 1, null, null, 1_800_000],
    46: ['보험', '행사배상책임보험', '500명 기준', 1_200_000, 1, 1, null, null, 1_200_000],
    47: ['소계', null, null, null, null, null, null, null, 4_500_000],

    48: ['7. 참가자 웰컴 패키지 · 기념품'],
    49: ['웰컴 패키지', '음료 · 쿠키 세트', '1인 10,000원', 10_000, 500, 1, null, null, 5_000_000],
    50: ['기념품', '참가자 기념품', '예산 할당', 6_000_000, 1, 1, null, null, 6_000_000],
    51: ['소계', null, null, null, null, null, null, null, 11_000_000],

    52: ['8. 행사 기록 · 홍보'],
    53: ['기록 촬영', '사진 · 영상 기록', '편집본 사후 제공', 3_000_000, 1, 1, null, null, 3_000_000],
    54: ['자료 제작', '발표용 자료 제작', '외부 프리랜서', 2_000_000, 1, 1, null, null, 2_000_000],
    55: ['소계', null, null, null, null, null, null, null, 5_000_000],
  }
  return build('가상 견적 A형', sheet)
}

// ── B형: 금액 단식 + 섹션 total 행 + "5-1" 소수 섹션 + "(총액 미포함)" 옵션 + VAT 별도 총액 ──
export const B_EXPECTED = {
  itemsSum: 127_500_000,
  agencyFee: 17_500_000,
  vat: 12_750_000,
  grandTotal: 140_250_000,
  sections: 8,
  items: 16,
}

const B_COLS = ['ITEM', 'DESCRIPTION', 'SIZE(mm) / SPEC', '금액', 'REMARKS']

export function syntheticQuoteB(): Promise<ArrayBuffer> {
  const sheet: Sheet = {
    1: [' '],
    11: ['Project Title', '가상 AI 서밋 2027', null, '제안일자', '2027. 01. 20'],
    12: ['Package Type', '컨퍼런스 + 전시 통합 패키지 (초기 가견적)', null, '유효기간', '제안일자로부터 30일'],
    13: ['Venue', '가상컨벤션센터 볼룸 전관 + 로비', null, '공 급 자', '가상기획㈜'],
    14: ['비  고', '본행사 3/10(수)~3/11(목) + 설치 3/9(화) 야간', null, '주     소', '가상시 가상구 가상로 1'],
    15: ['견적일시', '2027년 1월 20일', null, '담 당 자', '박매니저'],
    17: ['최종 견적', 127_500_000],
    18: ['부가세 (10%)', 12_750_000],
    19: ['총 금액 (부가세 포함)', 140_250_000],
    20: ['*최종 견적은 부가세 별도 기준입니다'],

    22: ['  1. 베뉴 사용료', null, null, 40_000_000],
    23: B_COLS,
    24: ['행사장 임대료', '볼룸 전관 — 본행사 2일', '1일 12,500,000원 × 2일', 25_000_000, '가상 요율 기준'],
    25: ['로비 사용료', '볼룸 앞 로비 (포이어)', '전시부스 구역 약 100㎡ × 3일', 15_000_000],
    26: ['total', null, null, 40_000_000],

    28: ['  2. 시스템 구축 비용', null, null, 50_000_000],
    29: B_COLS,
    30: ['무대 제작', '니주 무대 + 구조 안전 검토', 'W12,000 × D5,000 × H600', 20_000_000],
    31: ['LED 화면', '키노트 메인 화면', 'W12,000 × H4,000', 15_000_000],
    32: ['음향', '전관 + 존 분리 운용', '메인 + 딜레이 · 무선 마이크 8식', 8_000_000],
    33: ['전시부스', '조립식 시스템 부스 7개', '1부스 3M × 2M × 2.5M', 7_000_000, '부스당 1,000,000원 × 7부스'],
    34: ['total', null, null, 50_000_000],

    36: ['  3. 디자인 및 브랜딩 비용', null, null, 8_000_000],
    37: B_COLS,
    38: ['사인물 제작·시공', '현장 안내 사인물', '입구 사인 · 동선 표지 · 배너', 6_000_000],
    39: ['랜딩페이지 제작', '온라인 마이크로 페이지', '행사 소개 · 참가 등록 / 반응형', 2_000_000],
    40: ['total', null, null, 8_000_000],

    42: ['  4. 운영인력 및 보험', null, null, 6_000_000],
    43: B_COLS,
    44: ['등록·안내 인력', '등록 및 안내 10인', '10인 × 2일', 4_000_000],
    45: ['행사 보험', null, null, 2_000_000],
    46: ['total', null, null, 6_000_000],

    48: ['  5. 기타 운영비', null, null, 6_000_000],
    49: B_COLS,
    50: ['사진·영상 기록', '현장 기록', '사진 2인 × 2일 + 스케치 영상', 3_000_000],
    51: ['운반 및 소모품', '물류 및 현장 소모품', null, 3_000_000],
    52: ['total', null, null, 6_000_000],

    54: ['  5-1. 선택 옵션 (총액 미포함)', null, null, 0],
    55: B_COLS,
    56: ['로고 투사 조명', null, null, 2_000_000, '연출 강화 옵션 · 선택 시 추가 (총액 미포함)'],
    57: ['total', null, null, 0],

    59: ['  6. PCO 기획료', null, null, 17_500_000, ' (직접비의 25%)'],
    60: B_COLS,
    61: ['기획료', '직접비의 25%', '기획·설계, 협력사 관리, 현장 총괄', 17_500_000, '2~5절 합계 기준 · 만원 미만 절사'],
    62: ['total', null, null, 17_500_000],

    64: ['  7. 가상 모객 솔루션', null, null, 0, ' (별도 협의)'],
    65: B_COLS,
    66: ['행사 홍보·모객 지원', null, null, 0],
    67: ['참석 인원 보장', null, null, 0, '모객 규모·비용은 KPI 확정 후 별도 협의'],
    68: ['total', null, null, 0],

    70: ['※ 본 견적은 초기 가견적입니다. 행사장 확정 후 확정 견적을 별도 제공합니다.'],
    71: ['※ 선택 옵션은 총액에 포함되어 있지 않으며, 선택 시 확정 견적에 추가 반영됩니다.'],
  }
  return build('가상 견적 B형', sheet)
}

// ── C형: 패키지형(UNIT PRICE·QTY·AMOUNT·SELECT) + Add-ons O/X + PCO 25% ──
export const C_EXPECTED = {
  itemsSum: 82_500_000,
  agencyFee: 9_500_000,
  vat: 8_250_000,
  grandTotal: 90_750_000,
  sections: 7,
  items: 13,
}

const C_COLS = ['ITEM', 'DESCRIPTION', 'SPEC', 'UNIT PRICE', 'QTY', 'AMOUNT', 'SELECT']

export function syntheticQuoteC(): Promise<ArrayBuffer> {
  const sheet: Sheet = {
    1: ['MICE PACKAGE ESTIMATE'],
    3: ['Project Title', '가상 테크 서밋 2027'],
    4: ['Client', '가상테크'],
    5: ['Event Date', '2027-05-20 ~ 2027-05-21'],
    6: ['Venue', '가상컨벤션센터 홀 A'],
    7: ['Quote Date', '2027-04-01'],
    8: ['Manager', '이담당'],
    10: ['Total Amount', 82_500_000],
    11: ['VAT (10%)', 8_250_000],
    12: ['Grand Total (VAT included)', 90_750_000],

    14: ['1. 베뉴 사용료 / Venue'],
    15: C_COLS,
    16: ['Hall Rental', '홀 A 전용 사용', '2일', 15_000_000, 2, 30_000_000, 'O'],
    17: ['Lobby', '로비 · 포이어', '2일', 1_000_000, 2, 2_000_000, 'O'],
    18: ['Subtotal', null, null, null, null, 32_000_000],

    20: ['2. 시스템 구축 / System'],
    21: C_COLS,
    22: ['Stage', '메인 무대 제작', 'W10,000 × D4,000', 10_000_000, 1, 10_000_000, 'O'],
    23: ['LED Screen', 'LED 스크린 2면', 'W6,000 × H3,000', 6_000_000, 2, 12_000_000, 'O'],
    24: ['Sound', '음향 시스템', '메인 + 무선 마이크', 5_000_000, 1, 5_000_000, 'O'],
    25: ['Subtotal', null, null, null, null, 27_000_000],

    27: ['3. 디자인·브랜딩 / Design'],
    28: C_COLS,
    29: ['Key Visual', '키비주얼 · 적용 변형', '기본안 + 변형 3종', 4_000_000, 1, 4_000_000, 'O'],
    30: ['Signage', '현장 사인물', '동선 · 세션장 안내', 3_000_000, 1, 3_000_000, 'O'],
    31: ['Subtotal', null, null, null, null, 7_000_000],

    33: ['4. 운영·인력 / Operation'],
    34: C_COLS,
    35: ['Staff', '현장 운영 요원', '12명 × 1일', 200_000, 12, 2_400_000, 'O'],
    36: ['Insurance', '행사배상책임보험', '500명 기준', 1_600_000, 1, 1_600_000, 'O'],
    37: ['Subtotal', null, null, null, null, 4_000_000],

    39: ['5. 추가 옵션 (Add-ons)'],
    40: C_COLS,
    41: ['Photo Booth', '포토부스 운영', '1일', 3_000_000, 1, 3_000_000, 'O'],
    42: ['Drone Show', '드론 라이트 쇼', '3분', 10_000_000, 1, 10_000_000, 'X'],
    43: ['Subtotal', null, null, null, null, 3_000_000],

    45: ['6. PCO 기획료 / PCO Fee', '(직접비의 25%)'],
    46: C_COLS,
    47: ['PCO Fee', '직접비의 25%', '기획·운영 총괄', 9_500_000, 1, 9_500_000, 'O'],
    48: ['Subtotal', null, null, null, null, 9_500_000],

    50: ['7. 모객 솔루션 / Recruiting'],
    51: C_COLS,
    52: ['Recruiting', '참석 인원 보장', '별도 협의', 0, 1, 0, 'X'],
    53: ['Subtotal', null, null, null, null, 0],
  }
  return build('가상 견적 C형', sheet)
}

// ── D형(v2.18 영문 — 해외 인바운드): 영문 라벨 전부 + USD 표기 + Subtotal/Agency Fee/VAT/Grand Total 블록 + Optional add-on ──
// 서식 판정은 C형(UNIT PRICE·QTY·AMOUNT — 일수·SELECT 없음)이지만 라벨은 전부 영문이다. 금액은 검산이 떨어지도록 설계한 값.
export const D_EXPECTED = {
  itemsSum: 100_000,
  agencyFee: 15_000,
  vat: 11_500,
  grandTotal: 126_500,
  sections: 5,
  items: 8,
}

const D_COLS = ['ITEM', 'DESCRIPTION', 'UNIT PRICE', 'QTY', 'AMOUNT', 'REMARKS']

export function syntheticQuoteD(): Promise<ArrayBuffer> {
  const sheet: Sheet = {
    1: ['QUOTATION'],
    3: ['Event', 'Virtual Global Tech Summit 2027', null, null, 'Supplier', 'Virtual Events Co.'],
    4: ['Client', 'Virtual Overseas Corp.'],
    5: ['Event Date', '10-11 March 2027'],
    6: ['Venue', 'Virtual Convention Center, Hall B'],
    7: ['Quote Date', '15 January 2027', null, null, 'Contact', 'Jane Planner'],
    8: ['Currency', 'USD'],
    10: ['Sub Total', null, null, null, null, 100_000],
    11: ['Agency Fee (15%)', null, null, null, null, 15_000],
    12: ['VAT (10%)', null, null, null, null, 11_500],
    13: ['Grand Total (VAT included)', null, null, null, null, 126_500],

    15: ['1. Venue Rental'],
    16: D_COLS,
    17: ['Hall B rental', 'Main hall, 2 days', 22_500, 2, 45_000],
    18: ['Subtotal', null, null, null, 45_000],

    20: ['2. Stage & AV'],
    21: D_COLS,
    22: ['LED screen', '12m x 4m', 15_000, 1, 15_000],
    23: ['Sound system', 'Main + delay', 10_000, 1, 10_000],
    24: ['Subtotal', null, null, null, 25_000],

    26: ['3. Design & Signage'],
    27: D_COLS,
    28: ['Key visual design', 'KV + adaptations', 8_000, 1, 8_000],
    29: ['Signage production', 'Entrance, wayfinding', 7_000, 1, 7_000],
    30: ['Subtotal', null, null, null, 15_000],

    32: ['4. Operation Staff & Insurance'],
    33: D_COLS,
    34: ['Registration staff', '10 pax x 2 days', 500, 20, 10_000],
    35: ['Event insurance', null, 5_000, 1, 5_000],
    36: ['Subtotal', null, null, null, 15_000],

    38: ['5. Optional Add-ons (not included in total)'],
    39: D_COLS,
    40: ['Gobo lighting', 'Logo projection', 2_000, 1, 2_000, 'Optional - not included'],
    41: ['Subtotal', null, null, null, 0],

    43: ['* Prices are in USD. VAT 10% applies.'],
  }
  return build('Quotation', sheet)
}

// ── R형(v2.20.2 — 우리 리멤버 견적서, 옛 Configurator 내보내기 모양): 머리 라벨 프로젝트명·참석/모객·베뉴·견적일시 ·
// 총액 줄 하나에 라벨 둘("총 견적금액(VAT별도) · 일금… · (￦/ V.A.T 별도) · 공급가 | VAT 포함 | 총액") · 섹션 제목 줄 오른쪽 소계 ·
// 섹션 1 제목 꼬리 "[예상치 · 확정 아님]" + 열 머리 앞 "⚠️" 안내 줄 · 할인으로 0원이 된 항목 줄 · PCO 기획료 = 운영비 × 25% 항목 ·
// 모객 섹션 = RSVP 운영비 + 쇼업 보장(정산보드 rc/ld 분할 근거). 실사용 2026-09-27 실파일의 구조만 본떴다(금액·이름은 가상).
export const R_EXPECTED = {
  sections: 6,
  items: 12,
  itemsSum: 38_000_000,
  agencyFee: 4_800_000,
  vat: 3_800_000,
  grandTotal: 41_800_000,
  rsvp: 1_600_000,
  showup: 14_000_000,
}

export function syntheticQuoteR(): Promise<ArrayBuffer> {
  const H = ['항목', '내용', '산출 내역', '단가', '수량', '금액', '비고']
  const sheet: Sheet = {
    1: ['리멤버 MICE 솔루션 견적서'],
    5: ['프로젝트명', '가상 리더십 서밋 2026', null, null, null, '제안일자', '2026. 7. 15'],
    6: ['참석/모객', '100명 / 40명  ·  KPI 달성선 34명 (85% 인정·2단계)', null, null, null, '유효기간', '제안일자로 부터 30일'],
    7: ['베뉴', '가상호텔 2F 볼룸', null, null, null, '공 급 자', '가상에이전시㈜', '(인)'],
    8: ['비  고', '1일 full day 기준', null, null, null, '주     소', '서울시 어딘가 1'],
    9: ['견적일시', '2026년 7월 15일', null, null, null, '담 당 자', null],
    10: ['총 견적금액(VAT별도)', '일금 삼천팔백만원 정 (38,000,000원)', '(￦/ V.A.T 별도)', 38_000_000, null, 'VAT 포함', 41_800_000],
    12: ['1. 베뉴 사용료 [예상치 · 확정 아님]', null, null, null, null, 10_000_000],
    13: ['⚠️ 호텔 비용은 예상 산정치이며 확정 금액이 아닙니다. 반드시 베뉴별 견적 확인을 통해 확정해야 합니다.'],
    14: H,
    15: ['장소 사용료', '5성급 호텔', '가상호텔 2F 볼룸', 10_000_000, 1, 10_000_000],
    16: [null, 'F&B 포함', '대관료의 80%', null, null, null, 'F&B: 8,000,000원까지 포함'],
    17: ['소계', null, null, null, null, 10_000_000],
    19: ['2. 시스템 구축', null, null, null, null, 3_500_000],
    20: H,
    21: ['영상 콘솔', 'LED 디스플레이 운용', '스위처 + 콘솔', 2_000_000, 1, 2_000_000],
    22: ['음향 시스템', '기본 음향', '스피커·마이크', 1_500_000, 1, 1_500_000],
    23: ['4K 스케일러/KVM', '무상 제공', '패키지 포함', 500_000, 1, 0, '할인'],
    24: ['소계', null, null, null, null, 3_500_000],
    26: ['3. 디자인·브랜딩', null, null, null, null, 2_500_000],
    27: H,
    28: ['키비주얼', 'KV 디자인', '메인 1종', 1_500_000, 1, 1_500_000],
    29: ['웹페이지', '랜딩 1장', '반응형', 1_000_000, 1, 1_000_000],
    30: ['소계', null, null, null, null, 2_500_000],
    32: ['4. 운영인력·등록·보험 (100명 기준)', null, null, null, null, 1_600_000],
    33: H,
    34: ['등록데스크 지원', '현장 등록', '2명', 400_000, 2, 800_000],
    35: ['행사 운영 인력', '진행 보조', '2명', 300_000, 2, 600_000],
    36: ['행사장 안전보험', '행사 배상', '1건', 200_000, 1, 200_000],
    37: ['소계', null, null, null, null, 1_600_000],
    39: ['5. PCO 기획료', null, null, null, null, 4_800_000],
    40: H,
    41: ['PCO 기획료', '운영비 × 25%', '(베뉴+시스템+디자인+운영+RSVP) × 25%', 19_200_000, 0.25, 4_800_000, '만원 미만 절사'],
    42: ['소계', null, null, null, null, 4_800_000],
    44: ['6. 리멤버 모객 솔루션 [게런티 40명]', null, null, null, null, 15_600_000],
    45: H,
    46: ['RSVP 운영비', '참가확정 관리', '게런티 40명 × 인당 40,000원', 40_000, 40, 1_600_000],
    47: ['쇼업 보장', '리드젠 + 참석 보장', '게런티 40명 × 인당 350,000원', 350_000, 40, 14_000_000],
    48: ['소계', null, null, null, null, 15_600_000],
    50: ['※ 본 견적은 참고용이며, 베뉴 컨디션에 따라 비용은 변동될 수 있습니다.'],
  }
  return build('견적서', sheet)
}
