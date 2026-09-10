// 한글 금액 표기 — JS 정본 + 스프레드시트 수식(이식형).
//
// 배경: 종전 견적서는 한국어 Excel 전용 함수 `NUMBERSTRING`으로 한글금액을 연동했다. 이 함수는
// 구글 스프레드시트·LibreOffice·영문 Excel에 없어 파일을 시트로 변환하면 `#NAME?`가 난다(2026-09-10 사용자 지시
// "금액을 한글로 변환할 때 수식을 걸어서 자동화" + "구글 스프레드시트에 맞게 최적화").
// 해법: TEXT·MID·VALUE·IF·ROUND·ABS·& 만으로 짠 순수 수식 — Excel(전 로케일)·Google Sheets·LibreOffice가 같은 결과를 낸다.
// (LET·REGEX 계열은 구형 Excel에 없어 쓰지 않는다.)
//
// 표기 규칙(JS `koreanAmount`와 수식이 1:1): 4자리 묶음(조·억·만) × 자리(천·백·십), 모든 유효 숫자 앞에 숫자를 붙인다 —
// 10 → "일십", 1,000 → "일천", 137,810,000 → "일억삼천칠백팔십일만". 0 → "영". 음수는 절댓값으로 읽는다.

const DIGIT_WORDS = '영일이삼사오육칠팔구'
const PLACE_UNITS = ['천', '백', '십', ''] as const
const GROUP_UNITS = ['조', '억', '만', ''] as const
/** TEXT 패딩 자릿수 — 4묶음 × 4자리 = 16자리(최대 9,999조) */
const DIGITS = 16

/** JS 정본 — 수식과 같은 규칙으로 한글금액을 만든다(캐시 결과·테스트 기준값) */
export function koreanAmount(n: number): string {
  const num = Math.abs(Math.round(n))
  if (num === 0) return '영'
  const padded = String(num).padStart(DIGITS, '0')
  if (padded.length > DIGITS) return String(num) // 수식 표현 범위 밖 — 숫자 그대로
  let out = ''
  for (let g = 0; g < 4; g++) {
    const chunk = padded.slice(g * 4, g * 4 + 4)
    if (Number(chunk) === 0) continue
    for (let i = 0; i < 4; i++) {
      const d = Number(chunk[i])
      if (d === 0) continue
      out += DIGIT_WORDS[d] + PLACE_UNITS[i]
    }
    out += GROUP_UNITS[g]
  }
  return out
}

/**
 * 셀 `cellRef`의 정수를 한글 금액 문자열로 읽는 스프레드시트 수식(등호 없음).
 * 16자리로 0-패딩한 문자열을 자리별로 읽는다. IF가 "0"을 걸러내므로 MID의 시작 위치는 항상 1 이상이다.
 */
export function koreanAmountFormula(cellRef: string): string {
  const padded = `TEXT(ROUND(ABS(${cellRef}),0),"${'0'.repeat(DIGITS)}")`
  const digitAt = (pos: number) => `MID(${padded},${pos},1)`
  const wordAt = (pos: number) => `MID("${DIGIT_WORDS}",VALUE(${digitAt(pos)})+1,1)`
  const groups: string[] = []
  for (let g = 0; g < 4; g++) {
    const terms: string[] = []
    for (let i = 0; i < 4; i++) {
      const pos = g * 4 + i + 1
      const unit = PLACE_UNITS[i]
      terms.push(`IF(${digitAt(pos)}="0","",${wordAt(pos)}${unit ? `&"${unit}"` : ''})`)
    }
    const groupUnit = GROUP_UNITS[g]
    const body = terms.join('&')
    groups.push(groupUnit ? `IF(VALUE(MID(${padded},${g * 4 + 1},4))>0,${body}&"${groupUnit}","")` : body)
  }
  return `IF(ROUND(${cellRef},0)=0,"영",${groups.join('&')})`
}

/** "일금 …원 정 (1,234원)" — 한글금액 뒤에 숫자를 괄호 병기하는 관행 표기(수식) */
export function amountInWordsFormula(cellRef: string): string {
  return `"일금 "&${koreanAmountFormula(cellRef)}&"원 정 ("&TEXT(${cellRef},"#,##0")&"원)"`
}

/** 수식이 캐시로 갖는 결과 문자열(JS) — 뷰어가 재계산하기 전에 보이는 값 */
export function amountInWordsKo(n: number): string {
  return `일금 ${koreanAmount(n)}원 정 (${Math.round(n).toLocaleString('ko-KR')}원)`
}
