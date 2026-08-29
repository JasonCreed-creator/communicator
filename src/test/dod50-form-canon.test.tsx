/** @vitest-environment jsdom */
// DoD 50 (v2.6 §10 / Phase 3.19) — 폼 정본: 프리미티브 + 상시 소스 가드.
//
// 배경: 디자인지시서 v1과 패턴 기준 시트 01–09가 **입력 폼을 규정하지 않았다.** 그래서 컨트롤 81개가
// 브라우저 기본값 위에 서 있었다 — 체크·라디오는 브라우저 파랑(tokens.css "파랑·보라 계열 금지" 위반),
// 숫자·셀렉트는 화면마다 정렬·자릿 구분·화살표가 달랐다.
//
// 이 테스트가 지키는 계약:
//   ① `accent-color`는 base 레이어에 **1회** 선언된다 — 화면이 각자 인라인으로 칠하기 시작하면 다시 갈라진다
//   ② 체크·라디오는 예외 없이 `.ui-check`, 셀렉트는 `.ui-select`를 단다 (예외는 사유와 함께 화이트리스트)
//   ③ 오류는 힌트 줄을 **대체**한다 (두 줄로 쌓으면 필드 높이가 폼마다 달라진다)
//   ④ 금액은 저장 값이 `number | null`이고 빈 칸은 `null`(미정)이다 — 반올림·추측 채움을 하지 않는다
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Field from '../components/internal/Field'
import MoneyField from '../components/internal/MoneyField'
import { formatKrw, krwEcho, krwShort, parseKrw } from '../lib/numberFormat'

afterEach(cleanup)

// ── 소스 스캔 ────────────────────────────────────────────────────────
const PRODUCTION_TSX = {
  ...import.meta.glob('../pages/**/*.tsx', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../components/**/*.tsx', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

/** Vite는 `.css?raw`도 CSS 파이프라인으로 가로채 빈 문자열을 준다 — 파일을 직접 읽는다 */
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

function sourceEntries(): [string, string][] {
  return Object.entries(PRODUCTION_TSX).filter(([f]) => !/\.test\.tsx?$/.test(f))
}

/**
 * `<tag ...>` 여는 태그를 통째로 뽑는다.
 *
 * 정규식 하나로 `<input[^>]*>`를 쓰면 `className={`… ${a > b ? …}`}` 같은 표현식의 `>`에서 잘린다.
 * 그래서 중괄호 깊이와 따옴표를 세며 직접 스캔한다 — 가드가 조용히 통과하는 것을 막는 쪽이 중요하다.
 */
function openTags(src: string, tag: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  const needle = `<${tag}`
  let i = 0
  while (true) {
    const start = src.indexOf(needle, i)
    if (start === -1) break
    const after = src[start + needle.length]
    // <input> 은 잡고 <inputSomething> 은 거른다
    if (after && /[A-Za-z0-9_-]/.test(after)) {
      i = start + needle.length
      continue
    }
    let depth = 0
    let quote: string | null = null
    let j = start + needle.length
    for (; j < src.length; j++) {
      const c = src[j]
      if (quote) {
        if (c === quote && src[j - 1] !== '\\') quote = null
        continue
      }
      if (c === '"' || c === "'" || c === '`') {
        quote = c
        continue
      }
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    out.push({
      text: src.slice(start, j + 1),
      line: src.slice(0, start).split('\n').length,
    })
    i = j + 1
  }
  return out
}

/**
 * 태그가 특정 유틸리티 클래스를 다는지 판정한다.
 *
 * `className={selectClass}`처럼 **변수를 거쳐** 붙는 경우가 있어서 태그 문자열만 봐서는 알 수 없다.
 * 그래서 className 표현식에 등장하는 식별자를 같은 파일의 `const <식별자> = …` 정의로 두 단계까지
 * 따라가 본다(예: `selectClass = `${inputClass} ui-select``). 여기서 못 찾으면 위반으로 본다 —
 * 가드가 조용히 통과하는 것보다 화이트리스트에 사유를 적게 하는 편이 낫다.
 */
function hasClass(tag: string, src: string, cls: string): boolean {
  const re = new RegExp(`\\b${cls}\\b`)
  if (re.test(tag)) return true

  const seen = new Set<string>()
  const queue = [...tag.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].map((m) => m[0])
  for (let depth = 0; depth < 2 && queue.length; depth++) {
    const next: string[] = []
    for (const ident of queue) {
      if (seen.has(ident)) continue
      seen.add(ident)
      const def = new RegExp(`\\bconst\\s+${ident}\\s*=\\s*([^\\n]*)`).exec(src)
      if (!def) continue
      if (re.test(def[1])) return true
      next.push(...[...def[1].matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].map((m) => m[0]))
    }
    queue.length = 0
    queue.push(...next)
  }
  return false
}

/**
 * 승인된 예외 — 정본을 벗어나는 지점은 **여기에 사유와 함께** 적는다. 무설명 예외는 통과하지 않는다.
 * `file`은 경로 꼬리, `contains`는 그 태그 안에 반드시 들어 있는 문자열이다.
 */
const CHECK_EXEMPTIONS: { file: string; contains: string; why: string }[] = []

const SELECT_EXEMPTIONS: { file: string; contains: string; why: string }[] = []

describe('DoD 50 폼 정본 — 소스 가드 (§10)', () => {
  it('스캔 대상 소스가 실제로 잡힌다 (glob 오타로 0건 통과하는 것을 막는다)', () => {
    expect(sourceEntries().length).toBeGreaterThan(50)
  })

  it('accent-color는 base 레이어에 1회만 선언된다 — 화면이 각자 칠하지 않는다', () => {
    const css = indexCss
    expect(css).toMatch(/accent-color:\s*var\(--accent\)/)
    expect(css.match(/accent-color:/g) ?? []).toHaveLength(1)

    // 화면 코드가 인라인 accentColor / accent-color 로 되칠하지 않는다
    const offenders: string[] = []
    for (const [file, src] of sourceEntries()) {
      src.split('\n').forEach((line, i) => {
        if (/accentColor|accent-color/.test(line)) offenders.push(`${file}:${i + 1} ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('체크박스·라디오는 예외 없이 .ui-check를 단다', () => {
    const offenders: string[] = []
    for (const [file, src] of sourceEntries()) {
      for (const tag of openTags(src, 'input')) {
        if (!/type=["'](checkbox|radio)["']/.test(tag.text)) continue
        if (hasClass(tag.text, src, 'ui-check')) continue
        const exempt = CHECK_EXEMPTIONS.some(
          (e) => file.endsWith(e.file) && tag.text.includes(e.contains),
        )
        if (exempt) continue
        offenders.push(`${file}:${tag.line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('셀렉트는 예외 없이 .ui-select를 단다 — OS 화살표는 브라우저마다 다르다', () => {
    const offenders: string[] = []
    for (const [file, src] of sourceEntries()) {
      for (const tag of openTags(src, 'select')) {
        if (hasClass(tag.text, src, 'ui-select')) continue
        const exempt = SELECT_EXEMPTIONS.some(
          (e) => file.endsWith(e.file) && tag.text.includes(e.contains),
        )
        if (exempt) continue
        offenders.push(`${file}:${tag.line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('가드가 실제로 잡는다 — 예외 목록이 통째로 무력화되지 않았는지 자체 검증', () => {
    // 화이트리스트가 비어 있지 않다면 각 항목이 실제 소스에 존재해야 한다(죽은 예외 방지)
    for (const e of [...CHECK_EXEMPTIONS, ...SELECT_EXEMPTIONS]) {
      const hit = sourceEntries().some(([f, src]) => f.endsWith(e.file) && src.includes(e.contains))
      expect(hit, `죽은 예외: ${e.file} / ${e.contains}`).toBe(true)
      expect(e.why.length).toBeGreaterThan(5)
    }
  })
})

// ── 프리미티브 ──────────────────────────────────────────────────────
describe('DoD 50 Field — 필드 상태 (§10-C)', () => {
  it('오류가 있으면 힌트를 대체한다 — 두 줄로 쌓지 않는다', () => {
    const { rerender } = render(
      <Field label="정원" hint="비우면 무제한">
        <input aria-label="정원" />
      </Field>,
    )
    expect(screen.getByText('비우면 무제한')).toBeTruthy()

    rerender(
      <Field label="정원" hint="비우면 무제한" error="0 이상만 입력합니다">
        <input aria-label="정원" />
      </Field>,
    )
    expect(screen.getByText('0 이상만 입력합니다')).toBeTruthy()
    expect(screen.queryByText('비우면 무제한')).toBeNull()
  })

  it('필수 표시는 라벨 뒤 * 하나 — 배지·빨간 라벨을 쓰지 않는다', () => {
    const { container } = render(
      <Field label="행사명" required>
        <input aria-label="행사명" />
      </Field>,
    )
    const stars = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.textContent === '*',
    )
    expect(stars).toHaveLength(1)
    expect(stars[0].getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).not.toContain('required')
    expect(container.textContent).not.toContain('필수')
  })

  it('id를 주면 라벨이 htmlFor로 컨트롤에 묶이고, 없으면 label이 컨트롤을 감싼다', () => {
    const { container, rerender } = render(
      <Field id="f-1" label="장소">
        <input id="f-1" />
      </Field>,
    )
    expect(container.querySelector('label')?.getAttribute('for')).toBe('f-1')

    rerender(
      <Field label="장소">
        <input />
      </Field>,
    )
    // id가 없으면 바깥 요소 자체가 label — 라벨 행 전체가 클릭 영역이다
    expect(container.firstElementChild?.tagName).toBe('LABEL')
  })
})

// ── 금액 ────────────────────────────────────────────────────────────
describe('DoD 50 금액 표기 (§10-A)', () => {
  it('krwEcho는 한 자리도 버리지 않는다 — 억/만 경계 포함', () => {
    expect(krwEcho(0)).toBe('0원')
    expect(krwEcho(450)).toBe('450원')
    expect(krwEcho(12_000_000)).toBe('1,200만원')
    expect(krwEcho(99_999_999)).toBe('9,999만 9,999원')
    expect(krwEcho(100_000_000)).toBe('1억원')
    expect(krwEcho(123_456_789)).toBe('1억 2,345만 6,789원')
    expect(krwEcho(-50_000)).toBe('-5만원')
  })

  it('krwShort는 3.18b KPI 타일 동작 그대로다 (승격이지 개정이 아니다)', () => {
    expect(krwShort(0)).toBe('0원')
    expect(krwShort(9_999)).toBe('9,999원')
    expect(krwShort(12_000_000)).toBe('1,200만')
    expect(krwShort(99_999_999)).toBe('9,999만+')
    expect(krwShort(100_000_000)).toBe('1억')
    expect(krwShort(280_000_000)).toBe('2억 8,000만')
  })

  it('parseKrw는 빈 칸을 null(미정)로 두고 반올림하지 않는다', () => {
    expect(parseKrw('')).toBeNull()
    expect(parseKrw('   ')).toBeNull()
    expect(parseKrw('원')).toBeNull()
    expect(parseKrw('0')).toBe(0)
    expect(parseKrw('12,000,000')).toBe(12_000_000)
    expect(parseKrw('12,000,000원')).toBe(12_000_000)
    expect(parseKrw('1234.5')).toBe(1234.5) // 소수점을 임의로 없애지 않는다
    expect(parseKrw('-50000')).toBe(-50_000)
    expect(parseKrw('1.2.3')).toBeNull() // 해석 불가는 추측하지 않고 null
  })

  it('formatKrw는 null을 빈 칸으로, 0을 "0"으로 구분한다', () => {
    expect(formatKrw(null)).toBe('')
    expect(formatKrw(0)).toBe('0')
    expect(formatKrw(12_000_000)).toBe('12,000,000')
  })
})

function MoneyHarness({ initial }: { initial: number | null }) {
  const [v, setV] = useState<number | null>(initial)
  return (
    <>
      <MoneyField label="판매 단가 (내부)" value={v} onChange={setV} hint="비우면 미정" />
      <output data-testid="stored">{v === null ? 'null' : String(v)}</output>
    </>
  )
}

describe('DoD 50 MoneyField (§10-A · 폼 정본 폴리싱 결함 2)', () => {
  it('표시는 천단위, 편집 중에는 raw, blur 시 재포맷', () => {
    render(<MoneyHarness initial={12_000_000} />)
    const input = screen.getByLabelText('판매 단가 (내부)') as HTMLInputElement
    expect(input.value).toBe('12,000,000')

    fireEvent.focus(input)
    expect(input.value).toBe('12000000')

    fireEvent.change(input, { target: { value: '9000000' } })
    expect(input.value).toBe('9000000')

    fireEvent.blur(input)
    expect(input.value).toBe('9,000,000')
    expect(screen.getByTestId('stored').textContent).toBe('9000000')
  })

  it('우측정렬 + 스피너 제거 규격을 단다', () => {
    render(<MoneyHarness initial={0} />)
    const input = screen.getByLabelText('판매 단가 (내부)')
    expect(input.className).toContain('ui-input')
    expect(input.className).toContain('ui-input-num')
    // 스피너를 부르는 type="number"를 쓰지 않는다 — 쉼표를 넣을 수 없기 때문이다
    expect(input.getAttribute('type')).toBe('text')
    expect(input.getAttribute('inputMode') ?? input.getAttribute('inputmode')).toBe('decimal')
  })

  it('빈 입력은 null(미정), 0은 0 — 둘을 구분한다', () => {
    render(<MoneyHarness initial={12_000} />)
    const input = screen.getByLabelText('판매 단가 (내부)')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByTestId('stored').textContent).toBe('null')

    fireEvent.change(input, { target: { value: '0' } })
    expect(screen.getByTestId('stored').textContent).toBe('0')
  })

  it('값이 있으면 힌트 줄이 한글 에코로 바뀐다 — 자릿수를 눈으로 검산하는 줄', () => {
    render(<MoneyHarness initial={12_000_000} />)
    expect(screen.getByText('1,200만원')).toBeTruthy()
    expect(screen.queryByText('비우면 미정')).toBeNull()

    const input = screen.getByLabelText('판매 단가 (내부)')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    // 값이 비면 원래 힌트가 돌아온다
    expect(screen.getByText('비우면 미정')).toBeTruthy()
  })

  it('오류가 있으면 에코를 밀어내고 컨트롤이 negative 보더를 단다', () => {
    render(
      <MoneyField label="판매 단가" value={12_000_000} onChange={() => {}} error="0 이상만 입력합니다" />,
    )
    expect(screen.getByText('0 이상만 입력합니다')).toBeTruthy()
    expect(screen.queryByText('1,200만원')).toBeNull()
    const input = screen.getByLabelText('판매 단가')
    expect(input.className).toContain('ui-input-error')
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('소수점 입력은 반올림하지 않고 그대로 저장한다', () => {
    render(<MoneyHarness initial={null} />)
    const input = screen.getByLabelText('판매 단가 (내부)')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1234.5' } })
    expect(screen.getByTestId('stored').textContent).toBe('1234.5')
  })
})
