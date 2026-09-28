// DoD 97 (Phase 6.11 PR-B · 설계서 v2.21 §27.3) — 마스터 시트 대체 묶음 B: 참고 문서 링크 + 요청서 라벨 사전.
//   ① normalizeReferenceLinks — null·[] → null · https만 · kind 5종 · 제목 정리(120자) · added_at 보존·보충 · 같은 주소 하나 · 21건 'limit' · 모양 틀림 'invalid'
//   ② mock updateProject — pm 저장 → getProject · null 지움 · http 422 · 21건 422 · design 403 · 종료 행사 409 · 로그에 url 0
//   ③ 비노출 — 발주처 큐·현황 · 파트너 포털 · 랜딩 내보내기 HTML · 활동 로그에 reference_links 키 0 + 소스 가드(발주처·파트너·랜딩·plan 경로)
//   ④ 요청서 라벨 규칙 — 시트 붙여 넣기(탭 · 구분 열 · 비고 열) → 기존 BriefKey 8 + overview_items 3(정본 라벨) · 콜론 양식 같은 결과 ·
//      라벨 없는 글은 overview_items null · AI 스키마는 그대로(overview_items 없음 · validateEventBrief null · mergeBrief는 규칙 값)
//   ⑤ briefToPrefill — 메모 줄 + 기타 항목 순서 · filledBriefKeys에 overview_items
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_TOKEN, PARTNER_DEMO_TOKEN, PROJECT_ID, PROJECT_ID_CLOSED, PROJECT_ID_HOST } from '../fixtures/sampleProject'
import { LANDING_ID_SAMPLE } from '../fixtures/landingFixtures'
import { briefToPrefill, INTAKE_NOTES_LABEL } from '../lib/intake/briefPrefill'
import {
  AI_BRIEF_KEYS,
  AI_EVENT_BRIEF_SCHEMA,
  BRIEF_KEYS,
  EMPTY_BRIEF,
  extractBriefByRules,
  filledBriefKeys,
  mergeBrief,
  validateEventBrief,
} from '../lib/intake/eventBrief'
import { buildLandingHtml } from '../lib/landingExport'
import {
  guessReferenceLinkKind,
  normalizeReferenceLinks,
  REFERENCE_LINK_INVALID_MESSAGE,
  REFERENCE_LINKS_LIMIT_MESSAGE,
  REFERENCE_LINKS_MAX,
  referenceLinkLabel,
} from '../lib/referenceLinks'
import type { ReferenceLink } from '../types/entities'
import { mockProvider } from './testUtils'

const TODAY = new Date('2026-09-28T09:00:00')

function link(over: Partial<ReferenceLink> = {}): ReferenceLink {
  return { kind: 'request', title: '요청서 시트', url: 'https://docs.google.com/spreadsheets/d/virtual-request', added_at: '2026-09-28T00:00:00.000Z', ...over }
}

function collectKeys(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      found.add(key)
      collectKeys(inner, found)
    }
  }
}
function hasReferenceLinks(value: unknown): boolean {
  const found = new Set<string>()
  collectKeys(value, found)
  return found.has('reference_links')
}

describe('DoD 97 ① normalizeReferenceLinks', () => {
  it('null·[] → null · https만 · kind 5종 · 제목 정리 · added_at 보존·보충 · 같은 주소는 하나', () => {
    expect(normalizeReferenceLinks(null)).toBeNull()
    expect(normalizeReferenceLinks(undefined)).toBeNull()
    expect(normalizeReferenceLinks([])).toBeNull()
    const ok = normalizeReferenceLinks([
      link({ title: '  요청서   시트 ' }),
      { kind: 'kickoff', title: '', url: ' https://example.com/kickoff ', added_at: 'not-a-date' },
      link({ kind: 'other' }), // 같은 주소 — 먼저 것만
    ])
    expect(ok).not.toBe('invalid')
    expect(ok).not.toBe('limit')
    const arr = ok as ReferenceLink[]
    expect(arr).toHaveLength(2)
    expect(arr[0]).toEqual(link({ title: '요청서 시트' }))
    expect(arr[1].url).toBe('https://example.com/kickoff')
    expect(arr[1].kind).toBe('kickoff')
    expect(Number.isNaN(Date.parse(arr[1].added_at))).toBe(false)
    expect(normalizeReferenceLinks([link({ title: 'x'.repeat(200) })])).toMatchObject([{ title: 'x'.repeat(120) }])
  })

  it('모양이 틀리면 invalid(http · 배열 아님 · 원소가 객체 아님 · 모르는 kind · 주소 없음) · 21건은 limit', () => {
    expect(normalizeReferenceLinks({ kind: 'other' })).toBe('invalid')
    expect(normalizeReferenceLinks(['https://example.com'])).toBe('invalid')
    expect(normalizeReferenceLinks([link({ url: 'http://example.com/x' })])).toBe('invalid')
    expect(normalizeReferenceLinks([link({ url: 'ftp://example.com/x' })])).toBe('invalid')
    expect(normalizeReferenceLinks([{ ...link(), kind: 'memo' }])).toBe('invalid')
    expect(normalizeReferenceLinks([{ kind: 'other', title: 'x' }])).toBe('invalid')
    const many = Array.from({ length: REFERENCE_LINKS_MAX + 1 }, (_, i) => link({ url: `https://example.com/doc/${i}` }))
    expect(normalizeReferenceLinks(many)).toBe('limit')
    expect(normalizeReferenceLinks(many.slice(0, REFERENCE_LINKS_MAX))).toHaveLength(REFERENCE_LINKS_MAX)
  })

  it('화면 이름 = 제목 → 없으면 호스트(구글 시트·문서·Drive) · 종류 어림(요청서·제안서·계약·킥오프 → 그 밖 기타)', () => {
    expect(referenceLinkLabel(link())).toBe('요청서 시트')
    expect(referenceLinkLabel(link({ title: '' }))).toBe('구글 시트')
    expect(referenceLinkLabel(link({ title: '', url: 'https://docs.google.com/document/d/x' }))).toBe('구글 문서')
    expect(referenceLinkLabel(link({ title: '', url: 'https://drive.google.com/file/d/x/view' }))).toBe('Drive 파일')
    expect(referenceLinkLabel(link({ title: '', url: 'https://www.example.com/wiki/page' }))).toBe('example.com')
    expect(guessReferenceLinkKind('https://docs.google.com/spreadsheets/d/x', '행사 요청서')).toBe('request')
    expect(guessReferenceLinkKind('https://example.com/proposal-v2.pdf', null)).toBe('proposal')
    expect(guessReferenceLinkKind('https://example.com/x', '계약서 초안')).toBe('contract')
    expect(guessReferenceLinkKind('https://example.com/kickoff', null)).toBe('kickoff')
    expect(guessReferenceLinkKind('https://example.com/notes', '회의록')).toBe('other')
  })
})

describe('DoD 97 ② mock updateProject.reference_links', () => {
  it('pm 저장 → getProject · null 지움 · http 422 · 21건 422 · design 403 · 종료 행사 409 · 로그에 주소 0', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    const saved = await p.updateProject(PROJECT_ID, { reference_links: [link(), link({ kind: 'kickoff', title: '', url: 'https://example.com/kickoff' })] })
    expect(saved.reference_links).toHaveLength(2)
    expect((await p.getProject(PROJECT_ID)).reference_links?.[0]).toEqual(link())
    await expect(p.updateProject(PROJECT_ID, { reference_links: [link({ url: 'http://example.com/x' })] })).rejects.toMatchObject({
      code: 'validation',
      message: REFERENCE_LINK_INVALID_MESSAGE,
    })
    const many = Array.from({ length: REFERENCE_LINKS_MAX + 1 }, (_, i) => link({ url: `https://example.com/doc/${i}` }))
    await expect(p.updateProject(PROJECT_ID, { reference_links: many })).rejects.toMatchObject({ code: 'validation', message: REFERENCE_LINKS_LIMIT_MESSAGE })
    // 실패한 저장은 값을 바꾸지 않는다
    expect((await p.getProject(PROJECT_ID)).reference_links).toHaveLength(2)
    const logs = await p.listActivity(PROJECT_ID)
    expect(JSON.stringify(logs)).not.toContain('virtual-request')
    await expect(p.updateProject(PROJECT_ID_CLOSED, { reference_links: [link()] })).rejects.toMatchObject({ code: 'conflict' })
    p.switchUser('usr-design')
    await expect(p.updateProject(PROJECT_ID, { reference_links: [link()] })).rejects.toMatchObject({ code: 'forbidden' })
    p.switchUser('usr-pm')
    expect((await p.updateProject(PROJECT_ID, { reference_links: null })).reference_links).toBeNull()
  })
})

describe('DoD 97 ③ 비노출 — 발주처·파트너·랜딩·활동 로그 + 소스 가드', () => {
  it('링크를 붙인 뒤에도 발주처 큐·현황 · 파트너 포털 · 랜딩 HTML · 활동 로그에 reference_links가 없다', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    await p.updateProject(PROJECT_ID, { reference_links: [link()] })
    await p.updateProject(PROJECT_ID_HOST, { reference_links: [link()] })
    expect(hasReferenceLinks(await p.getClientQueue(DEMO_TOKEN))).toBe(false)
    expect(hasReferenceLinks(await p.getClientStatus(DEMO_TOKEN))).toBe(false)
    expect(hasReferenceLinks(await p.getPartnerPortal(PARTNER_DEMO_TOKEN))).toBe(false)
    expect(hasReferenceLinks(await p.listActivity(PROJECT_ID))).toBe(false)
    const page = await p.getLandingPage(LANDING_ID_SAMPLE)
    const html = buildLandingHtml(page, page.sections)
    expect(html).not.toContain('reference_links')
    expect(html).not.toContain('virtual-request')
    await p.updateProject(PROJECT_ID, { reference_links: null })
    await p.updateProject(PROJECT_ID_HOST, { reference_links: null })
  })

  it('발주처·파트너·랜딩·운영계획서 화면 소스에 reference_links 식별자가 없다(내부 설정·온보딩 카드에만)', () => {
    const root = process.cwd()
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx)$/.test(name)) files.push(full)
      }
    }
    for (const dir of ['src/components/client', 'src/components/partner', 'src/components/partner-portal', 'src/components/plan', 'src/components/landing']) walk(join(root, dir))
    for (const name of readdirSync(join(root, 'src/pages'))) if (/^(Client|Landing|Partner|Plan)/.test(name)) files.push(join(root, 'src/pages', name))
    for (const name of readdirSync(join(root, 'src/lib'))) if (/^landing/.test(name)) files.push(join(root, 'src/lib', name))
    expect(files.length).toBeGreaterThan(10)
    for (const f of files) expect(readFileSync(f, 'utf8'), `${f}에 reference_links 노출`).not.toMatch(/reference_links|ReferenceLinksCard/)
  })
})

// 요청서 탭을 구글 시트에서 복사해 붙인 모양 — 구분 열(병합 셀 · 첫 줄만 값) · 라벨 열 · 값 열 · 비고 열. 가상 이름만(R-Q4)
const SHEET = [
  '행사 개요\t행사명\t가상 AI 서밋 2027\t확정',
  '\t행사 일시\t2027-04-08(목) 13:00~18:00',
  '\t행사 장소\t가상 컨벤션센터 3층 그랜드볼룸',
  '\t주최/주관\t가상테크㈜',
  '행사 콘텐츠\t행사 주제\tAI 전환의 실무',
  '\t주요 아젠다/키워드\tAI 에이전트 · 데이터 거버넌스',
  '\t핵심 오디언스\t제조·금융 IT 의사결정자',
  '\t목표 인원\t400명',
  '\t프로그램 구성\t키노트 2 · 패널 1 · 네트워킹',
  '\t연사 요청\t업계 CTO급 2인(섭외 협의)',
  '\t특이사항\t동시통역 · 생중계 검토',
  '\t담당자\t홍길동 010-0000-0000', // 사람 줄 — 어떤 칸에도 옮기지 않는다
].join('\n')

const COLON = [
  '행사명: 가상 AI 서밋 2027',
  '행사 일시: 2027-04-08(목) 13:00~18:00',
  '행사 장소: 가상 컨벤션센터 3층 그랜드볼룸',
  '주최/주관: 가상테크㈜',
  '행사 주제: AI 전환의 실무',
  '주요 아젠다/키워드: AI 에이전트 · 데이터 거버넌스',
  '핵심 오디언스: 제조·금융 IT 의사결정자',
  '목표 인원: 400명',
  '프로그램 구성: 키노트 2 · 패널 1 · 네트워킹',
  '연사 요청: 업계 CTO급 2인(섭외 협의)',
  '특이사항: 동시통역 · 생중계 검토',
].join('\n')

describe('DoD 97 ④ 요청서 라벨 규칙(eventBrief — 앱·서버 공용)', () => {
  it('시트 붙여 넣기(탭 · 구분 열 · 비고 열) → 기존 칸 8 + 기타 항목 3(정본 라벨) · 담당자 줄은 어디에도 없다', () => {
    const { fields, matched } = extractBriefByRules(SHEET, TODAY)
    expect(fields).toMatchObject({
      name: '가상 AI 서밋 2027',
      event_date: '2027-04-08',
      event_end_date: null,
      start_time: '13:00',
      end_time: '18:00',
      venue: '가상 컨벤션센터 3층 그랜드볼룸',
      organizer: '가상테크㈜',
      theme: 'AI 전환의 실무',
      target_audience: '제조·금융 IT 의사결정자',
      expected_headcount: 400,
      event_type: null,
      notes: '동시통역 · 생중계 검토',
      overview_items: [
        { label: '주요 아젠다/키워드', value: 'AI 에이전트 · 데이터 거버넌스' },
        { label: '프로그램 구성', value: '키노트 2 · 패널 1 · 네트워킹' },
        { label: '연사 요청', value: '업계 CTO급 2인(섭외 협의)' },
      ],
    })
    expect(matched).toEqual(expect.arrayContaining(['name', 'event_date', 'start_time', 'end_time', 'venue', 'organizer', 'theme', 'target_audience', 'expected_headcount', 'notes', 'overview_items']))
    expect(JSON.stringify(fields)).not.toMatch(/홍길동|010-0000/)
    expect(filledBriefKeys(fields)).toContain('overview_items')
  })

  it('콜론 양식은 같은 결과 · 라벨 없는 글은 기타 항목 null · 특이사항이 없으면 참고 ID만 메모', () => {
    const sheet = extractBriefByRules(SHEET, TODAY).fields
    const colon = extractBriefByRules(COLON, TODAY).fields
    expect(colon).toEqual(sheet)
    const plain = extractBriefByRules('다음 달 15일 300명 규모 세미나 문의드립니다.', TODAY).fields
    expect(plain.overview_items).toBeNull()
    expect(filledBriefKeys(plain)).not.toContain('overview_items')
    const ids = extractBriefByRules('행사명: 가상 포럼\n아이템ID: 120111\n특이사항: 야간 철거', TODAY).fields
    expect(ids.notes).toBe('야간 철거 · 아이템ID 120111')
  })

  it('AI 쪽은 그대로 — 스키마에 overview_items 없음(required = properties) · validateEventBrief는 null · mergeBrief는 규칙의 기타 항목 유지', () => {
    expect(AI_BRIEF_KEYS).not.toContain('overview_items')
    expect(BRIEF_KEYS).toContain('overview_items')
    expect(Object.keys(AI_EVENT_BRIEF_SCHEMA.properties)).not.toContain('overview_items')
    expect([...AI_EVENT_BRIEF_SCHEMA.required].sort()).toEqual(Object.keys(AI_EVENT_BRIEF_SCHEMA.properties).sort())
    const ai = validateEventBrief({ ...EMPTY_BRIEF, name: 'AI 이름', overview_items: [{ label: 'x', value: 'y' }] })
    expect(ai.overview_items).toBeNull()
    expect(ai.name).toBe('AI 이름')
    const rules = extractBriefByRules(SHEET, TODAY)
    const merged = mergeBrief(rules, { ...ai, notes: 'AI 메모' })
    expect(merged.overview_items).toEqual(rules.fields.overview_items)
    expect(merged.name).toBe('가상 AI 서밋 2027') // 라벨이 이긴다
    expect(merged.notes).toBe('동시통역 · 생중계 검토')
  })
})

describe('DoD 97 ⑤ briefToPrefill', () => {
  it('기타 항목 = 메모 줄 → 요청서 항목 순서 · 메모 없으면 요청서 항목만 · 둘 다 없으면 items 키 없음', () => {
    const f = extractBriefByRules(SHEET, TODAY).fields
    expect(briefToPrefill(f).items).toEqual([
      { label: INTAKE_NOTES_LABEL, value: '동시통역 · 생중계 검토' },
      { label: '주요 아젠다/키워드', value: 'AI 에이전트 · 데이터 거버넌스' },
      { label: '프로그램 구성', value: '키노트 2 · 패널 1 · 네트워킹' },
      { label: '연사 요청', value: '업계 CTO급 2인(섭외 협의)' },
    ])
    expect(briefToPrefill({ ...f, notes: null }).items).toHaveLength(3)
    expect('items' in briefToPrefill({ ...EMPTY_BRIEF, name: 'x' })).toBe(false)
  })
})
