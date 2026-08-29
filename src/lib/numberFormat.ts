// 숫자·금액 표기 공유 util — 패턴 기준 시트 §10-A(숫자 컨트롤)·§10 MoneyField 정본.
//
// 금액은 오타 한 자리가 매출 계획을 열 배로 틀린다. 그래서 표기 규칙을 화면마다 다시 쓰지 않고
// 여기 한 곳에 둔다 — `krwShort`는 Phase 3.18b `SalesPlanner`의 로컬 함수를 **동작 그대로** 승격한 것이고,
// `krwEcho`·`parseKrw`·`formatKrw`는 3.19 폼 정본에서 새로 세운다.

/** KPI 타일용 축약 표기 — 억/만 단위.
 *
 *  원 단위 정확값은 같은 타일의 보조 줄과 표가 그대로 보여준다.
 *  (전각 숫자열이 타일 폭을 넘겨 잘리는 것을 막는 목적이라 반올림하지 않고 절사·분해만 한다.
 *   절사한 나머지가 남았다는 사실은 `+`로 밝힌다 — 값이 딱 떨어진 것처럼 보이면 안 된다.) */
export function krwShort(n: number): string {
  if (n === 0) return '0원'
  const eok = Math.floor(n / 100_000_000)
  const man = Math.floor((n % 100_000_000) / 10_000)
  const won = n % 10_000
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString('ko-KR')}만` : `${eok}억`
  if (man > 0) return won > 0 ? `${man.toLocaleString('ko-KR')}만+` : `${man.toLocaleString('ko-KR')}만`
  return `${n.toLocaleString('ko-KR')}원`
}

/** MoneyField 힌트 줄용 한글 에코 — `12000000` → `1,200만원`.
 *
 *  용도가 KPI 타일과 다르다. 타일은 폭에 맞추는 게 목적이라 절사하지만, 이 줄은 **자릿수 오타를
 *  사람 눈으로 잡는 것**이 목적이라 한 자리도 버리지 않는다 — 억·만·원 세 마디를 전부 적는다.
 *  (`99,999,999` → `9,999만 9,999원` / `100,000,000` → `1억원`) */
export function krwEcho(n: number): string {
  if (n === 0) return '0원'
  const negative = n < 0
  const abs = Math.abs(n)
  const eok = Math.floor(abs / 100_000_000)
  const man = Math.floor((abs % 100_000_000) / 10_000)
  const won = abs % 10_000
  const parts: string[] = []
  if (eok > 0) parts.push(`${eok.toLocaleString('ko-KR')}억`)
  if (man > 0) parts.push(`${man.toLocaleString('ko-KR')}만`)
  if (won > 0) parts.push(won.toLocaleString('ko-KR'))
  return `${negative ? '-' : ''}${parts.join(' ')}원`
}

/** 입력 문자열 → 저장 값. 빈 칸은 `null`(=미정)이다.
 *
 *  천단위 쉼표·공백·`원`·`₩` 같은 표기 문자는 지우고 숫자·부호·소수점만 남긴다.
 *  **반올림·추측 채움 금지** — 소수점을 넣었으면 소수점 그대로, 해석 불가면 `null`이다. */
export function parseKrw(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** 저장 값 → 표시 문자열(천단위 구분). `null`은 빈 칸이다. */
export function formatKrw(n: number | null): string {
  return n == null ? '' : n.toLocaleString('ko-KR')
}
