// 한글금액 이식형 수식 — Excel·Sheets 공통 함수만 쓰고, JS 정본(koreanAmount)과 같은 결과를 낸다.
// 실제 스프레드시트 엔진 대조는 koreanAmountFormula.libreoffice.test.ts(soffice 있을 때만).
import { describe, expect, it } from 'vitest'
import { amountInWordsFormula, amountInWordsKo, koreanAmount, koreanAmountFormula } from '../export/koreanAmountFormula'
import { evalFormula, functionNames } from './formulaMiniEval'

/** Excel(전 로케일)·Google Sheets·LibreOffice 셋 다에 있는 함수만 허용 */
const PORTABLE_FUNCTIONS = ['ABS', 'IF', 'MID', 'ROUND', 'TEXT', 'VALUE']

const SAMPLES = [
  0, 1, 5, 10, 11, 19, 20, 99, 100, 101, 110, 999, 1_000, 1_001, 1_010, 1_100, 9_999,
  10_000, 10_001, 10_010, 10_100, 11_000, 20_000, 100_000, 120_000, 1_000_000, 1_234_567,
  10_000_000, 12_345_678, 100_000_000, 137_810_000, 200_000_001, 1_000_000_000, 1_000_010_000,
  10_000_000_000, 123_456_789_012, 1_000_000_000_000, 1_000_000_010_000, 999_999_999_999_999,
]

describe('koreanAmount (JS 정본)', () => {
  it('자리·묶음 규칙 — 모든 유효 숫자 앞에 숫자를 붙인다', () => {
    expect(koreanAmount(0)).toBe('영')
    expect(koreanAmount(10)).toBe('일십')
    expect(koreanAmount(1_000)).toBe('일천')
    expect(koreanAmount(10_000)).toBe('일만')
    expect(koreanAmount(137_810_000)).toBe('일억삼천칠백팔십일만')
    expect(koreanAmount(100_000_001)).toBe('일억일')
    expect(koreanAmount(1_000_000_000_000)).toBe('일조')
    expect(koreanAmount(-2_500)).toBe('이천오백') // 절댓값
    expect(koreanAmount(1_234.6)).toBe('일천이백삼십오') // 반올림
  })
})

describe('koreanAmountFormula (스프레드시트 수식)', () => {
  const f = koreanAmountFormula('D10')

  it('NUMBERSTRING·LET·REGEX 같은 비이식 함수를 쓰지 않는다', () => {
    expect(f).not.toContain('NUMBERSTRING')
    expect(functionNames(f).every((n) => PORTABLE_FUNCTIONS.includes(n))).toBe(true)
    expect(functionNames(f)).toEqual(expect.arrayContaining(['IF', 'MID', 'TEXT', 'VALUE']))
  })

  it('Excel 수식 길이 한도(8,192자) 안이고 괄호가 균형이다', () => {
    expect(f.length).toBeLessThan(8_192)
    const open = (f.match(/\(/g) ?? []).length
    const close = (f.match(/\)/g) ?? []).length
    expect(open).toBe(close)
    expect((f.match(/"/g) ?? []).length % 2).toBe(0)
  })

  it.each(SAMPLES)('%i — 수식 평가 결과가 JS 정본과 같다', (n) => {
    expect(evalFormula(f, { D10: n })).toBe(koreanAmount(n))
  })

  it('음수·소수도 절댓값·반올림으로 같은 결과', () => {
    expect(evalFormula(f, { D10: -2_500 })).toBe(koreanAmount(-2_500))
    expect(evalFormula(f, { D10: 1_234.6 })).toBe(koreanAmount(1_234.6))
  })

  it('참조 셀만 바꾸면 다른 셀에도 그대로 쓸 수 있다', () => {
    const g = koreanAmountFormula('C11')
    expect(g).not.toContain('D10')
    expect(evalFormula(g, { C11: 137_810_000 })).toBe('일억삼천칠백팔십일만')
  })
})

describe('amountInWordsFormula ("일금 …원 정 (…원)")', () => {
  it.each([0, 1_500, 137_810_000, 1_000_000_010_000])('%i — 캐시 문자열(JS)과 수식 결과가 같다', (n) => {
    const f = amountInWordsFormula('D10')
    expect(evalFormula(f, { D10: n })).toBe(amountInWordsKo(n))
    expect(amountInWordsKo(n)).toMatch(/^일금 .+원 정 \([\d,]+원\)$/)
  })
})
