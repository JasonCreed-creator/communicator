/** @vitest-environment jsdom */
// DoD 97 (Phase 6.11 PR-B · 설계서 v2.21 §27.3) — 화면: 설정 ① '참고 문서' 카드(pm 붙이기·빼기 · 종류 배지 · n/20 · http 거부 · 상한) ·
// design 읽기 전용 · 온보딩 ① 카드(견적서 카드 옆) + 요청서 시트 붙여 넣기 → 기타 항목 3 + 메모 · Slack 글의 링크 → '참고 문서로'(종류 어림) ·
// 채운 버튼은 여전히 '다음: 담당자' 하나.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { INTAKE_NOTES_LABEL } from '../lib/intake/briefPrefill'
import { REFERENCE_LINK_INVALID_MESSAGE, REFERENCE_LINKS_LIMIT_MESSAGE, REFERENCE_LINKS_MAX } from '../lib/referenceLinks'
import type { ReferenceLink } from '../types/entities'
import { mockProvider, renderRoute } from './testUtils'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  const p = mockProvider()
  p.switchUser('usr-pm')
  await p.updateProject(PROJECT_ID, { reference_links: null })
})

function link(i: number, over: Partial<ReferenceLink> = {}): ReferenceLink {
  return { kind: 'other', title: `문서 ${i}`, url: `https://example.com/doc/${i}`, added_at: '2026-09-28T00:00:00.000Z', ...over }
}

async function settingsCard() {
  localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
  renderRoute('/settings')
  await screen.findByLabelText('행사명')
  return screen.getByTestId('reference-links')
}

async function newProjectOnboarding() {
  const p = mockProvider()
  const project = await p.createProject({})
  localStorage.setItem('communicator.currentProjectId', project.id)
  renderRoute('/onboarding')
  await screen.findByRole('heading', { name: '행사 기본 정보' })
  await screen.findByLabelText('행사명')
  return project
}

describe('DoD 97 — 설정 ① 참고 문서 카드', () => {
  it('(a) pm — 빈 상태 0/20 → 링크 붙이기(http 거부 → https) → 행(종류 배지 · 제목 · 사이트) · 1/20 · 저장 → 빼기(확인) → 빈 상태', async () => {
    mockProvider().switchUser('usr-pm')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const card = await settingsCard()
    expect(within(card).getByTestId('reference-links-empty')).toBeTruthy()
    expect(within(card).getByTestId('reference-links-count').textContent).toBe(`0/${REFERENCE_LINKS_MAX}`)
    await userEvent.click(within(card).getByRole('button', { name: '＋ 링크 붙이기' }))
    const form = within(card).getByTestId('reference-link-form')
    expect((within(form).getByLabelText('종류') as HTMLSelectElement).value).toBe('request')
    await userEvent.type(within(form).getByLabelText('문서 이름'), '요청서 시트')
    await userEvent.type(within(form).getByLabelText('링크'), 'http://docs.google.com/spreadsheets/d/virtual-request')
    await userEvent.click(within(form).getByRole('button', { name: '붙이기' }))
    expect(await within(card).findByText(REFERENCE_LINK_INVALID_MESSAGE)).toBeTruthy()
    expect((await mockProvider().getProject(PROJECT_ID)).reference_links ?? null).toBeNull()
    await userEvent.clear(within(form).getByLabelText('링크'))
    await userEvent.type(within(form).getByLabelText('링크'), 'https://docs.google.com/spreadsheets/d/virtual-request')
    await userEvent.click(within(form).getByRole('button', { name: '붙이기' }))
    const row = await within(card).findByTestId('reference-link-row')
    expect(within(row).getByText('요청서')).toBeTruthy()
    const anchor = within(row).getByRole('link', { name: '요청서 시트' }) as HTMLAnchorElement
    expect(anchor.href).toBe('https://docs.google.com/spreadsheets/d/virtual-request')
    expect(anchor.target).toBe('_blank')
    expect(row.textContent).toContain('구글 시트')
    expect(within(card).getByTestId('reference-links-count').textContent).toBe(`1/${REFERENCE_LINKS_MAX}`)
    expect(within(card).queryByTestId('reference-link-form')).toBeNull()
    expect((await mockProvider().getProject(PROJECT_ID)).reference_links).toMatchObject([{ kind: 'request', title: '요청서 시트', url: 'https://docs.google.com/spreadsheets/d/virtual-request' }])
    await userEvent.click(within(card).getByRole('button', { name: '요청서 시트 빼기' }))
    await within(card).findByTestId('reference-links-empty')
    expect((await mockProvider().getProject(PROJECT_ID)).reference_links ?? null).toBeNull()
  })

  it('(b) 상한 20 — 붙이기 단추 비활성 + 안내 · design은 행만 보고 붙이기·빼기 없음', async () => {
    const p = mockProvider()
    p.switchUser('usr-pm')
    await p.updateProject(PROJECT_ID, { reference_links: Array.from({ length: REFERENCE_LINKS_MAX }, (_, i) => link(i + 1)) })
    const card = await settingsCard()
    expect(within(card).getAllByTestId('reference-link-row')).toHaveLength(REFERENCE_LINKS_MAX)
    expect((within(card).getByRole('button', { name: '＋ 링크 붙이기' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(card).getByTestId('reference-links-limit-note').textContent).toBe(REFERENCE_LINKS_LIMIT_MESSAGE)
    cleanup()
    p.switchUser('usr-design')
    const ro = await settingsCard()
    expect(within(ro).getAllByTestId('reference-link-row')).toHaveLength(REFERENCE_LINKS_MAX)
    expect(within(ro).queryByRole('button', { name: '＋ 링크 붙이기' })).toBeNull()
    expect(within(ro).queryByRole('button', { name: /빼기$/ })).toBeNull()
  })
})

const REQUEST_SHEET = [
  '행사 개요\t행사명\t가상 AI 서밋 2027',
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
  '요청서 원문: https://docs.google.com/spreadsheets/d/virtual-request-sheet',
].join('\n')

describe('DoD 97 — 온보딩 ① 요청서 붙여 넣기 · 참고 문서 카드', () => {
  it('(c) 요청서 시트를 붙이면 기존 칸 + 기타 항목 3 + 메모가 채워지고, 글 속 링크는 참고 문서로(종류 요청서 어림) 붙일 수 있다 · 채운 버튼 하나', async () => {
    const project = await newProjectOnboarding()
    const intake = screen.getByTestId('slack-intake')
    const box = within(intake).getByLabelText('Slack 메시지 링크 또는 글')
    fireEvent.change(box, { target: { value: REQUEST_SHEET } })
    await userEvent.click(within(intake).getByRole('button', { name: '불러오기' }))
    await within(intake).findByTestId('slack-intake-result')
    expect(within(intake).getByTestId('slack-intake-summary').textContent).toContain('채운 칸 11개')
    expect(within(intake).getByTestId('slack-intake-attachments').textContent).toContain('참고 문서')
    expect((screen.getByLabelText('행사명') as HTMLInputElement).value).toBe('가상 AI 서밋 2027')
    expect((screen.getByLabelText('시작일') as HTMLInputElement).value).toBe('2027-04-08')
    expect((screen.getByLabelText('예상 인원') as HTMLInputElement).value).toBe('400')
    expect((screen.getByLabelText('고객사(주최·주관)') as HTMLInputElement).value).toBe('가상테크㈜')
    expect((screen.getByLabelText('주제(슬로건)') as HTMLInputElement).value).toBe('AI 전환의 실무')
    expect((screen.getByLabelText('참가 대상') as HTMLInputElement).value).toBe('제조·금융 IT 의사결정자')
    // 기타 항목 = 메모(요청 사항) + 요청서 항목 3 — 선택 항목이 펼쳐져 보인다
    const labels = [1, 2, 3, 4].map((i) => (screen.getByLabelText(`기타 항목 ${i} 이름`) as HTMLInputElement).value)
    expect(labels).toEqual([INTAKE_NOTES_LABEL, '주요 아젠다/키워드', '프로그램 구성', '연사 요청'])
    expect((screen.getByLabelText('기타 항목 1 내용') as HTMLInputElement).value).toBe('동시통역 · 생중계 검토')
    expect((screen.getByLabelText('기타 항목 3 내용') as HTMLInputElement).value).toBe('키노트 2 · 패널 1 · 네트워킹')

    // 참고 문서 카드 — 견적서 카드 옆(온보딩 ① 선택 항목 아래) · Slack 글의 링크를 '참고 문서로' → 폼(주소·종류 요청서) → 붙이기 → 행
    const card = screen.getByTestId('reference-links')
    expect(screen.getByTestId('quote-attachment')).toBeTruthy()
    const slack = within(card).getByTestId('reference-links-slack')
    expect(slack.textContent).toContain('요청서 같음')
    await userEvent.click(within(slack).getByRole('button', { name: '참고 문서로' }))
    const form = within(card).getByTestId('reference-link-form')
    expect((within(form).getByLabelText('링크') as HTMLInputElement).value).toBe('https://docs.google.com/spreadsheets/d/virtual-request-sheet')
    expect((within(form).getByLabelText('종류') as HTMLSelectElement).value).toBe('request')
    await userEvent.type(within(form).getByLabelText('문서 이름'), '요청서 원문')
    await userEvent.click(within(form).getByRole('button', { name: '붙이기' }))
    const row = await within(card).findByTestId('reference-link-row')
    expect(within(row).getByRole('link', { name: '요청서 원문' })).toBeTruthy()
    expect(within(row).getByText('요청서')).toBeTruthy()
    await waitFor(async () => {
      expect((await mockProvider().getProject(project.id)).reference_links).toMatchObject([{ kind: 'request', url: 'https://docs.google.com/spreadsheets/d/virtual-request-sheet' }])
    })
    // 이미 붙인 링크는 '붙어 있음'(비활성)
    expect((within(within(card).getByTestId('reference-links-slack')).getByRole('button', { name: '붙어 있음' }) as HTMLButtonElement).disabled).toBe(true)
    const primaries = screen.getAllByRole('button').filter((b) => /\bbtn-(primary|accent)\b/.test(b.className))
    expect(primaries.map((b) => b.textContent)).toEqual(['다음: 담당자'])
  })
})
