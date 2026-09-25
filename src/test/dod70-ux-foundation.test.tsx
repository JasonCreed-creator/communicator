/** @vitest-environment jsdom */
// DoD 70 (Phase 3.23 PR-1 · 디자인지시서 v1.4 §7-2) — UX 개편 기반.
//
// 배경: 2026-09-25 UX 진단(캔버스 v4 승인) — 보조 글자·빨강 배지·주황 버튼의 글자 대비가 본문 기준(4.5:1)에
// 못 미쳤고, 한글이 음절 단위로 끊겼으며("보 도"), 지난 기한 'D+3'이 남은 날 'D-3'과 한 글자 차이였고,
// 페이지 머리에 개발용 화면 코드(S1·S-10)가 노출돼 있었다. 사용자 결정 3건: 보조 글자·빨강 둘 다 어둡게,
// 주황 채운 버튼 바탕은 진한 주황(accent-deep), 구현 착수.
//
// 이 테스트가 지키는 계약:
//   ① 토큰 대비 — ink-cap·negative·ink-sub가 card·canvas·틴트 위 4.5:1 이상, 흰 글자는 accent-deep 위 4.5:1 이상
//   ② `.btn-accent` 바탕은 accent-deep이고, 흰 글자를 올린 주황 면(`bg-accent … text-white`)은 소스에 0건
//   ③ `html`에 `word-break: keep-all` — 한글 단어 단위 줄바꿈
//   ④ 내부 화면 기한 표기: 'D-n' · '오늘' · 'n일 지남' (행사일은 당일 'D-day'). 발주처·운영계획서 문서용
//      ddayLabel은 관행 표기('D+n') 그대로
//   ⑤ 페이지 머리·견적 캡션에 화면 코드(S1·S-10 …) 0건
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DdayBadge from '../components/internal/DdayBadge'
import { daysUntil, ddayLabel, dueLabel, eventDayLabel } from '../lib/labels'
import QUOTE_STRINGS from '../components/quote/quoteStrings'

afterEach(cleanup)

const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

function token(name: string): string {
  const m = tokensCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --${name} not found`)
  return m[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** CSS 규칙 블록 본문 — `.btn-accent {` 처럼 정확히 그 선택자로 여는 첫 블록 */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`${selector} not found`)
  return css.slice(start, css.indexOf('}', start))
}

const PRODUCTION_TSX = Object.entries({
  ...import.meta.glob('../pages/**/*.tsx', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../components/**/*.tsx', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>).filter(([f]) => !/\.test\.tsx?$/.test(f))

describe('DoD 70 ① 토큰 대비 (본문 크기 4.5:1)', () => {
  const pairs: [string, string, string][] = [
    ['ink-cap', 'card', '캡션·표 머리 on 카드'],
    ['ink-cap', 'canvas', '캡션 on 앱 배경'],
    ['ink-sub', 'card', '보조 글자 on 카드'],
    ['negative', 'negative-tint', '빨강 배지 글자 on 틴트'],
    ['negative', 'card', '빨강 글자(음수·지연) on 카드'],
    ['accent-deep', 'accent-tint', '주의 배지 글자 on 틴트'],
  ]
  for (const [fg, bg, label] of pairs) {
    it(`${label}: --${fg} / --${bg} ≥ 4.5`, () => {
      expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('흰 글자는 accent-deep 위 4.5:1 이상, accent 위는 미달이라 흰 글자 면으로 쓰지 않는다', () => {
    expect(contrast('#ffffff', token('accent-deep'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#ffffff', token('accent'))).toBeLessThan(4.5)
  })
})

describe('DoD 70 ② 주황 채운 면', () => {
  it('.btn-accent 바탕은 accent-deep, 호버는 새 토큰 없이 파생', () => {
    const body = ruleBody(indexCss, '.btn-accent')
    expect(body).toMatch(/background:\s*var\(--accent-deep\)/)
    const hover = ruleBody(indexCss, '.btn-accent:not(:disabled):hover')
    expect(hover).toMatch(/color-mix\(in srgb, var\(--accent-deep\)/)
  })

  it('흰 글자를 올린 accent 면(bg-accent … text-white) 0건 — 외부 지면 /p 헤더만 예외', () => {
    // 외부 지면(/p)은 이번 개편 범위 밖(사용자 선택: 내부 화면만) — 예외는 사유와 함께 명시한다
    const ALLOWED = new Set(['../components/partner-portal/PartnerPortalHeader.tsx'])
    const offenders: string[] = []
    for (const [file, src] of PRODUCTION_TSX) {
      if (ALLOWED.has(file)) continue
      for (const line of src.split('\n')) {
        if (/\bbg-accent\b(?!-)/.test(line) && /\btext-white\b/.test(line)) offenders.push(`${file}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('DoD 70 ③ 한글 줄바꿈', () => {
  it('html에 word-break: keep-all + overflow-wrap: break-word', () => {
    const html = ruleBody(indexCss, '  html')
    expect(html).toMatch(/word-break:\s*keep-all/)
    expect(html).toMatch(/overflow-wrap:\s*break-word/)
  })
})

describe('DoD 70 ④ 기한 표기', () => {
  const today = new Date(2026, 8, 25) // 2026-09-25 (금)

  it('dueLabel: 남은 날 D-n · 오늘 · 지난 날 n일 지남', () => {
    expect(dueLabel('2026-09-28', today)).toBe('D-3')
    expect(dueLabel('2026-09-25', today)).toBe('오늘')
    expect(dueLabel('2026-09-22', today)).toBe('3일 지남')
    expect(dueLabel('2026-09-24T23:59:00.000Z', today)).toBe('1일 지남')
  })

  it('eventDayLabel: 행사 당일은 D-day, 지난 행사는 n일 지남', () => {
    expect(eventDayLabel('2026-10-22', today)).toBe('D-27')
    expect(eventDayLabel('2026-09-25', today)).toBe('D-day')
    expect(eventDayLabel('2026-09-10', today)).toBe('15일 지남')
  })

  it('ddayLabel(발주처·운영계획서 문서용)은 관행 표기 그대로', () => {
    expect(ddayLabel('2026-09-22', today)).toBe('D+3')
    expect(ddayLabel('2026-09-25', today)).toBe('D-day')
    expect(daysUntil('2026-09-22', today)).toBe(-3)
  })

  it('내부 DdayBadge: 지난 기한은 n일 지남 + negative, 남은 기한은 중립', () => {
    const past = new Date()
    past.setDate(past.getDate() - 2)
    const iso = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    render(<DdayBadge isoDate={iso} />)
    const badge = screen.getByText('2일 지남')
    expect(badge.className).toContain('text-negative')
    expect(screen.queryByText(/^D\+/)).toBeNull()
  })
})

describe('DoD 70 ⑤ 화면 코드 비노출', () => {
  it('페이지 머리(caption)에 S1·S-10 같은 화면 코드 0건', () => {
    const offenders: string[] = []
    for (const [file, src] of PRODUCTION_TSX) {
      for (const m of src.matchAll(/caption=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const value = m[1] ?? m[2] ?? ''
        if (/\bS-?\d{1,2}\b/.test(value)) offenders.push(`${file}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('견적 목록 캡션(ko·en)에 화면 코드 0건', () => {
    for (const lang of Object.keys(QUOTE_STRINGS) as (keyof typeof QUOTE_STRINGS)[]) {
      expect(QUOTE_STRINGS[lang].listCaption).not.toMatch(/\bS-?\d/)
    }
  })
})
