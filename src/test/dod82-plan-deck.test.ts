// DoD 82 (Phase 3.24 PR-C · 설계서 v2.13.2 §23.7) — 16:9 장표형 운영계획서 조립(순수 함수) + 조립 데이터.
// 쪽 나누기(묶음 머리 · 이어서 · 고른 분배 · 메모 자리) · 장 순서·목차 쪽 번호 · 운영 요약 6칸 · 현장 운영 장(운영가이드 표) ·
// 빈 장 · 싣지 못한 표 · 금액 키·연락망 0 · PlanData.guide(같은 운영가이드 · 연락망 제외).
import { describe, expect, it } from 'vitest'
import {
  buildPlanDeck,
  DECK_CHAPTER_ORDER,
  DECK_SIZE,
  lineCount,
  paginateFlow,
  paginateTable,
  textWidth,
  type DeckColumn,
  type DeckFlowItem,
  type DeckSlide,
  type DeckTableRow,
} from '../components/plan/deck/planDeck'
import type { PlanData } from '../types/views'
import { mockProvider } from './testUtils'

const TODAY = new Date('2026-09-01T09:00:00')

const COLS: DeckColumn[] = [
  { label: '시각', width: 0.15, nowrap: true },
  { label: '구간', width: 0.25 },
  { label: '내용', width: 0.6 },
]
const row = (name: string): DeckTableRow => ({ cells: ['10:00', name, '짧은 내용'] })
const bandsOf = (page: DeckTableRow[]) => page.filter((r) => 'band' in r).map((r) => (r as { band: string }).band)

describe('DoD 82 ① 글 폭 · 줄 수 어림', () => {
  it('한글은 1em, 숫자·영문은 0.6em — 칸 폭을 넘으면 줄이 는다', () => {
    expect(textWidth('가나다', 10)).toBe(30)
    expect(textWidth('AB12', 10)).toBeCloseTo(24)
    expect(lineCount('가'.repeat(10), 100, 10)).toBe(1)
    expect(lineCount('가'.repeat(11), 100, 10)).toBe(2)
    expect(lineCount('한 줄\n두 줄', 1000, 10)).toBe(2)
  })
})

describe('DoD 82 ② 표 쪽 나누기', () => {
  it('한 장에 들면 그대로 한 장', () => {
    const pages = paginateTable([row('a'), row('b')], COLS)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toHaveLength(2)
  })

  it('넘치면 장마다 고르게 — 마지막 장에 한 줄만 남지 않는다', () => {
    const rows = Array.from({ length: 15 }, (_, i) => row(`r${i}`))
    const pages = paginateTable(rows, COLS)
    expect(pages).toHaveLength(2)
    const sizes = pages.map((p) => p.length)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(6)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(15)
  })

  it('구분 줄은 장 끝에 홀로 남지 않고, 묶음 한가운데서 넘어가면 "(이어서)" 구분 줄을 다시 싣는다', () => {
    const rows: DeckTableRow[] = [
      { band: '사전 준비' },
      ...['a', 'b', 'c', 'd'].map(row),
      { band: '본행사' },
      ...['e', 'f', 'g', 'h'].map(row),
      { band: '마무리' },
      ...['i', 'j'].map(row),
    ]
    const pages = paginateTable(rows, COLS)
    expect(pages.length).toBe(2)
    for (const p of pages) expect('band' in p[p.length - 1]).toBe(false)
    const second = pages[1]
    expect('band' in second[0]).toBe(true)
    // 새 장이 묶음 머리로 시작하거나, 한가운데면 '(이어서)'
    const first = (second[0] as { band: string }).band
    expect(['사전 준비', '본행사', '마무리'].some((b) => first === b || first === `${b} (이어서)`)).toBe(true)
    // 원래 행은 하나도 빠지거나 겹치지 않는다
    const names = pages.flat().filter((r) => 'cells' in r).map((r) => (r as { cells: string[] }).cells[1])
    expect(names).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])
    expect(bandsOf(pages.flat()).filter((b) => !b.endsWith('(이어서)'))).toEqual(['사전 준비', '본행사', '마무리'])
  })

  it('마지막 행은 표 아래 메모 자리와 같은 장에 — 자리가 모자라면 그 앞에서 넘긴다', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`r${i}`))
    const without = paginateTable(rows, COLS, 0)
    expect(without).toHaveLength(1)
    const withNotes = paginateTable(rows, COLS, 120)
    expect(withNotes.length).toBe(2)
    expect(withNotes[1].length).toBeGreaterThan(0)
  })

  it('긴 글이 든 행은 여러 줄로 어림한다(칸 폭 기준)', () => {
    const long = '가'.repeat(200)
    const pages = paginateTable(Array.from({ length: 6 }, () => ({ cells: ['10:00', 'x', long] })), COLS)
    expect(pages.length).toBeGreaterThan(1)
  })
})

describe('DoD 82 ③ 글 쪽 나누기', () => {
  it('소제목은 다음 줄과 함께 — 넘어간 장은 "(이어서)" 소제목으로 시작', () => {
    const items: DeckFlowItem[] = []
    for (let h = 0; h < 4; h += 1) {
      items.push({ type: 'h', text: `묶음 ${h}` })
      for (let i = 0; i < 6; i += 1) items.push({ type: 'li', text: `항목 ${h}-${i}` })
    }
    const pages = paginateFlow(items)
    expect(pages.length).toBeGreaterThan(1)
    for (const p of pages) {
      expect(p[p.length - 1].type).not.toBe('h')
      expect(p[0].type).toBe('h')
    }
    expect(pages.flat().filter((i) => i.type === 'li')).toHaveLength(24)
  })
})

function keysDeep(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k)
      keysDeep(v, out)
    }
  }
  return out
}

const MONEY_KEYS = ['total_amount', 'breakdown', 'contract_amount', 'ordered_amount', 'actual_amount', 'markup', 'margin', 'settlement']

describe('DoD 82 ④ 장표 조립 — 샘플 행사(운영가이드 없음)', () => {
  it('표지 · 목차 · 운영 요약 · 01~07장 순서, 목차의 쪽 번호 = 그 장 첫 장표', async () => {
    const plan = await mockProvider().getPlan('prj-stc26')
    expect(plan.guide).toBeNull()
    const { slides } = buildPlanDeck(plan, TODAY)
    expect(slides[0].kind).toBe('cover')
    expect(slides[1].kind).toBe('toc')
    expect(slides[2].kind).toBe('summary')
    const order = slides.slice(2).map((s) => s.chapter)
    const seen = order.filter((c, i) => c !== order[i - 1])
    expect(seen).toEqual([...DECK_CHAPTER_ORDER])
    const toc = slides[1] as Extract<DeckSlide, { kind: 'toc' }>
    for (const e of toc.entries) {
      expect(slides[e.slideNo - 1].chapter).toBe(e.chapter)
      expect(slides[e.slideNo - 2].chapter).not.toBe(e.chapter)
    }
  })

  it('운영 요약 6칸 — 행사일 D-day(오늘 기준) · 인원 · 프로그램 · 인력(가이드 없음 = —) · 제작물 확정 · 등록', async () => {
    const plan = await mockProvider().getPlan('prj-stc26')
    const summary = buildPlanDeck(plan, TODAY).slides[2] as Extract<DeckSlide, { kind: 'summary' }>
    expect(summary.tiles.map((t) => t.label)).toEqual(['행사일', '예상 인원', '프로그램', '현장 인력', '제작물', '등록'])
    const day = summary.tiles[0]
    if (plan.project.event_date) expect(day.value).toMatch(/^D[-+]\d+$|^D-day$/)
    expect(summary.tiles[3]).toMatchObject({ value: '—', empty: true })
    const finals = plan.production_items.filter((d) => d.status === 'final').length
    expect(summary.tiles[4].value).toBe(`확정 ${finals}/${plan.production_items.length}`)
  })

  it('현장 운영 표가 없으면 싣지 못한 표로 알리고, 내용이 하나도 없는 장은 빈 장표 한 장', async () => {
    const plan = await mockProvider().getPlan('prj-stc26')
    const { slides, gaps } = buildPlanDeck(plan, TODAY)
    const labels = gaps.map((g) => g.label)
    for (const l of ['설치·철거 일정', '현장 인력·콜타임', '무전·지휘 체계', '역할 분담', 'D-day 진행표', '안전관리']) expect(labels).toContain(l)
    const empty = { ...plan, program_sessions: [], cuesheet: null, guide: null, milestones: [], emergency: null } as PlanData
    const deck = buildPlanDeck(empty, TODAY)
    const safety = deck.slides.filter((s) => s.chapter === 'safety')
    expect(safety).toHaveLength(1)
    expect(safety[0].kind).toBe('empty')
    const toc = deck.slides[1] as Extract<DeckSlide, { kind: 'toc' }>
    expect(toc.entries.find((e) => e.chapter === 'safety')?.empty).toBe(true)
    // 빈 장도 목차·장 순서에서 빠지지 않는다
    expect(new Set(deck.slides.map((s) => s.chapter).filter(Boolean))).toEqual(new Set(DECK_CHAPTER_ORDER))
    expect(slides.some((s) => s.kind === 'empty')).toBe(true)
  })

  it('금액 키가 조립 데이터·장표 어디에도 없다', async () => {
    const plan = await mockProvider().getPlan('prj-stc26')
    const keys = keysDeep(buildPlanDeck(plan, TODAY))
    for (const k of MONEY_KEYS) expect(keys.has(k)).toBe(false)
    const planKeys = keysDeep(plan)
    for (const k of MONEY_KEYS) expect(planKeys.has(k)).toBe(false)
  })
})

describe('DoD 82 ⑤ 현장 운영 장 — 새 운영가이드(뼈대 12섹션)', () => {
  it('PlanData.guide = 같은 운영가이드의 섹션(연락망 제외) · 장표에 인력·무전·역할 분담·진행표·체크리스트·안전·비상 표', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    const doc = await p.createDeliverable({ project_id: 'prj-stc26', area: 'ops', category: '운영가이드', title: '장표 가이드' })
    await p.seedGuideFromSources(doc.id)
    const sections = await p.listGuideSections(doc.id)
    // 연락망에 전화번호를 적어도 조립 데이터로 나가지 않는다(R-O6)
    await p.saveGuideSections(
      doc.id,
      sections.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        content: s.kind === 'contacts' ? '- 비상 010-0000-0000' : s.content,
        source_ref: s.source_ref,
        source_stale: s.source_stale,
        data: s.data ?? null,
      })),
    )
    const plan = await p.getPlan('prj-stc26')
    expect(plan.guide?.deliverable_id).toBe(doc.id)
    expect(plan.guide?.sections.some((s) => s.kind === 'contacts')).toBe(false)
    expect(plan.emergency?.deliverable_id).toBe(doc.id)

    const deck = buildPlanDeck(plan, TODAY)
    const titles = deck.slides.map((s) => s.title)
    for (const t of ['설치·철거 일정', '현장 인력·콜타임', '무전·지휘 체계', '역할 분담', 'D-day 진행표', '구간별 체크리스트', '안전관리', '비상 대응']) {
      expect(titles).toContain(t)
    }
    expect(JSON.stringify(deck)).not.toContain('010-0000-0000')

    const raci = deck.slides.find((s) => s.title === '역할 분담') as Extract<DeckSlide, { kind: 'table' }>
    expect(raci.legend).toBe('● 주관 · ○ 협조 · — 해당 없음')
    expect(raci.rows.every((r) => 'cells' in r && ['●', '○', '—'].includes(r.cells[1]))).toBe(true)

    const emergency = deck.slides.find((s) => s.title === '비상 대응') as Extract<DeckSlide, { kind: 'table' }>
    expect(emergency.kind).toBe('table')
    expect(emergency.tone).toBe('emergency')
    expect(emergency.chapter).toBe('safety')

    const dayplan = deck.slides.filter((s) => s.title === 'D-day 진행표') as Extract<DeckSlide, { kind: 'table' }>[]
    const bands = dayplan.flatMap((s) => s.rows).filter((r) => 'band' in r).map((r) => (r as { band: string }).band)
    expect(bands.filter((b) => !b.endsWith('(이어서)'))).toEqual(['사전 준비', '본행사', '마무리'])

    const staffing = deck.slides.find((s) => s.title === '현장 인력·콜타임') as Extract<DeckSlide, { kind: 'table' }>
    expect(staffing.subtitle).toMatch(/^합계 \d+명$/)
    const summary = deck.slides[2] as Extract<DeckSlide, { kind: 'summary' }>
    expect(summary.tiles[3].value).toMatch(/^\d+명$/)

    // 모든 표 장표의 어림 높이가 본문 예산 안
    expect(DECK_SIZE.bodyBudget).toBeLessThan(DECK_SIZE.height)
    const gapLabels = deck.gaps.map((g) => g.label)
    expect(gapLabels).not.toContain('현장 인력·콜타임')
  })
})
