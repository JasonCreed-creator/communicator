/** @vitest-environment jsdom */
// DoD 84 (Phase 6.2 · 설계서 v2.15 §10 S0 · S6①) — 앱 쪽: 온보딩 ① 'Slack 메시지에서 불러오기' · 행사 코드 자동 · 견적서 첨부.
//   ① 새 행사 온보딩: 카드 · 글 붙여 넣기 → 라벨 규칙으로 읽음 → 폼 칸 채움(주황) · 배너 · 읽지 못한 칸 · 기록(intake) · 링크는 실서버 안내
//   ② 행사 코드: 행사명을 치면 자동(주황 · 안내) · 코드를 고치면 자동 꺼짐 → '행사명에서 다시 만들기' · 행사일이 연도 · 다른 행사 코드와 겹치면 -2
//   ③ 견적서 첨부: 빈 상태 · 파일은 데모에서 막힘(사실 안내) · 링크(https만) → 붙임 → 구글 시트 이름 · 빼기(확인) · Slack 첨부 목록(파일은 막힘 · 링크는 붙임)
//   ④ 온보딩의 채운 버튼은 여전히 '다음: 담당자' 하나 · 설정 ①에도 견적서 칸(design은 읽기 전용)
//   ⑤ briefToPrefill 매핑(notes → 기타 항목 · recruiting만 · null은 건드리지 않음)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import QuoteAttachmentCard, { QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE } from '../components/settings/QuoteAttachmentCard'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { briefToPrefill, INTAKE_NOTES_LABEL } from '../lib/intake/briefPrefill'
import { EMPTY_BRIEF } from '../lib/intake/eventBrief'
import { INTAKE_MOCK_LINK_MESSAGE } from '../lib/intake/intakeGateway'
import { suggestProjectCode } from '../lib/projectCode'
import { QUOTE_ATTACHMENT_INVALID_MESSAGE } from '../lib/quoteAttachment'
import { mockProvider, renderRoute } from './testUtils'

afterEach(() => {
  cleanup()
  mockProvider().switchUser('usr-pm')
  vi.restoreAllMocks()
})

const SAMPLE = ['행사명: 가상 테크 포럼 2027', '일시: 2027. 3. 12(금) 14:00~18:00', '장소: 가상홀 A', '인원: 약 300명', '고객사: 가상테크㈜'].join('\n')

async function newProjectOnboarding() {
  const p = mockProvider()
  const project = await p.createProject({})
  localStorage.setItem('communicator.currentProjectId', project.id)
  renderRoute('/onboarding')
  await screen.findByRole('heading', { name: '행사 기본 정보' })
  await screen.findByLabelText('행사명')
  return project
}

describe('DoD 84 · ① 온보딩 — Slack 메시지에서 불러오기', () => {
  it('글을 붙이면 라벨 규칙으로 읽어 폼 칸을 채운다(주황) · 배너 · 읽지 못한 칸 · intake 기록 · 링크는 실서버 안내', async () => {
    const project = await newProjectOnboarding()
    const card = screen.getByTestId('slack-intake')
    const box = within(card).getByLabelText('Slack 메시지 링크 또는 글')
    const go = within(card).getByRole('button', { name: '불러오기' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)

    // 데모에서 링크는 봇이 없다 — 사실대로
    await userEvent.type(box, 'https://acme.slack.com/archives/C0PROJ001/p1727251234567890')
    await userEvent.click(go)
    expect(await within(card).findByText(INTAKE_MOCK_LINK_MESSAGE)).toBeTruthy()

    await userEvent.clear(box)
    await userEvent.type(box, SAMPLE.replace(/\n/g, '{enter}'))
    await userEvent.click(go)
    const result = await within(card).findByTestId('slack-intake-result')
    expect(within(result).getByText('라벨 규칙으로 읽음')).toBeTruthy()
    expect(within(card).getByTestId('slack-intake-summary').textContent).toContain('채운 칸 7개')
    expect(within(card).queryByTestId('slack-intake-missing')).toBeNull()

    const name = screen.getByLabelText('행사명') as HTMLInputElement
    expect(name.value).toBe('가상 테크 포럼 2027')
    expect(name.className).toContain('bg-accent-tint')
    expect((screen.getByLabelText('시작일') as HTMLInputElement).value).toBe('2027-03-12')
    expect((screen.getByLabelText('시작 시간') as HTMLInputElement).value).toBe('14:00')
    expect((screen.getByLabelText('종료 시간') as HTMLInputElement).value).toBe('18:00')
    expect((screen.getByLabelText('장소') as HTMLInputElement).value).toBe('가상홀 A')
    expect((screen.getByLabelText('예상 인원') as HTMLInputElement).value).toBe('300')
    // 선택 항목(주최·주관)을 채웠으니 접힌 칸이 펼쳐진다
    expect((screen.getByLabelText('주최·주관') as HTMLInputElement).value).toBe('가상테크㈜')
    expect(screen.getByTestId('intake-prefill-banner').textContent).toContain('채운 칸 7개')
    // 행사 코드는 행사명에서 자동
    expect((screen.getByLabelText('행사 코드') as HTMLInputElement).value).toBe('GTP27')

    await waitFor(async () => {
      const saved = await mockProvider().getProject(project.id)
      expect(saved.intake).toMatchObject({ source: 'text', method: 'rules', slack_permalink: null })
      expect(saved.intake!.filled_keys).toContain('name')
    })
    // 사람이 칸을 고치면 그 칸의 주황이 사라진다
    await userEvent.type(screen.getByLabelText('장소'), ' 2층')
    expect((screen.getByLabelText('장소') as HTMLInputElement).className).not.toContain('bg-accent-tint')
  })

  it('읽지 못한 칸은 이름으로 알린다 · 저장하면 값이 행사에 남는다', async () => {
    const project = await newProjectOnboarding()
    const card = screen.getByTestId('slack-intake')
    await userEvent.type(within(card).getByLabelText('Slack 메시지 링크 또는 글'), '행사명: 가상 채용 박람회{enter}참가 신청 300명 예상')
    await userEvent.click(within(card).getByRole('button', { name: '불러오기' }))
    expect((await within(card).findByTestId('slack-intake-missing')).textContent).toContain('시작일 · 장소 · 주최·주관')
    expect((screen.getByLabelText('행사 유형') as HTMLSelectElement).value).toBe('recruiting')
    await userEvent.type(screen.getByLabelText('시작일'), '2027-05-20')
    await userEvent.type(screen.getByLabelText('장소'), '가상 전시장')
    await userEvent.click(screen.getByRole('button', { name: '다음: 담당자' }))
    await screen.findByRole('heading', { name: '담당자 배정' })
    const saved = await mockProvider().getProject(project.id)
    expect(saved).toMatchObject({ name: '가상 채용 박람회', code: 'GCB27', event_date: '2027-05-20', venue: '가상 전시장', expected_headcount: 300, event_type: 'recruiting' })
  })
})

describe('DoD 84 · ② 행사 코드 자동', () => {
  it('새 행사: 행사명을 치면 코드가 따라오고(주황 · 안내) 코드를 고치면 자동이 꺼진다 → 다시 만들기 · 행사일이 연도 · 겹치면 -2', async () => {
    await newProjectOnboarding()
    const name = screen.getByLabelText('행사명') as HTMLInputElement
    const code = screen.getByLabelText('행사 코드') as HTMLInputElement
    expect(code.value).toMatch(/^EVT-/) // 자리표시는 사람이 이름을 치기 전까지 그대로
    await userEvent.clear(name)
    await userEvent.type(name, '가상 테크 포럼')
    expect(code.value).toBe(`GTP${String(new Date().getFullYear()).slice(2)}`)
    expect(code.className).toContain('bg-accent-tint')
    expect(screen.getByTestId('code-auto-hint').textContent).toContain('행사명에서 자동으로 만들었어요')
    // 행사일을 넣으면 연도가 바뀐다
    await userEvent.type(screen.getByLabelText('시작일'), '2028-04-01')
    expect(code.value).toBe('GTP28')
    // 샘플 행사 코드(STC26)와 겹치면 -2
    await userEvent.clear(name)
    await userEvent.type(name, '서울 테크 Conference')
    await userEvent.clear(screen.getByLabelText('시작일'))
    await userEvent.type(screen.getByLabelText('시작일'), '2026-10-20')
    expect(code.value).toBe('STC26-2')
    expect(suggestProjectCode('서울 테크 Conference', { eventDate: '2026-10-20', taken: ['STC26'] })).toBe('STC26-2')
    // 사람이 고치면 자동이 꺼진다
    await userEvent.clear(code)
    await userEvent.type(code, 'MYCODE')
    expect(screen.queryByTestId('code-auto-hint')).toBeNull()
    await userEvent.type(name, ' 2026')
    expect(code.value).toBe('MYCODE')
    // 다시 만들기
    await userEvent.click(screen.getByRole('button', { name: '행사명에서 다시 만들기' }))
    expect(code.value).toBe('STC26-2')
    expect(screen.getByTestId('code-auto-hint')).toBeTruthy()
  })

  it('세팅이 끝난 행사(행사 설정)에서는 코드를 자동으로 바꾸지 않는다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settings')
    const name = (await screen.findByLabelText('행사명')) as HTMLInputElement
    const code = screen.getByLabelText('행사 코드') as HTMLInputElement
    const before = code.value
    await userEvent.type(name, ' 확장')
    expect(code.value).toBe(before)
    expect(screen.queryByTestId('code-auto-hint')).toBeNull()
    expect(screen.queryByRole('button', { name: '행사명에서 다시 만들기' })).toBeNull()
  })
})

describe('DoD 84 · ③ 견적서 첨부', () => {
  it('빈 상태 · 파일은 데모에서 막힘(사실 안내) · http 링크 거부 · https 링크 붙이기 → 구글 시트 · 빼기(확인 취소면 그대로)', async () => {
    const project = await newProjectOnboarding()
    const card = screen.getByTestId('quote-attachment')
    expect(within(card).getByTestId('quote-attachment-empty')).toBeTruthy()
    expect((within(card).getByLabelText('견적서 파일') as HTMLInputElement).disabled).toBe(true)
    expect(within(card).getByTestId('quote-attachment-file-note').textContent).toBe(QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE)

    await userEvent.click(within(card).getByRole('button', { name: '링크 붙이기' }))
    const url = within(card).getByLabelText('견적서 링크')
    await userEvent.type(url, 'http://insecure.example/quote')
    await userEvent.click(within(card).getByRole('button', { name: '붙이기' }))
    expect(await within(card).findByText(QUOTE_ATTACHMENT_INVALID_MESSAGE)).toBeTruthy()

    await userEvent.clear(url)
    await userEvent.type(url, 'https://docs.google.com/spreadsheets/d/virtual-quote')
    await userEvent.click(within(card).getByRole('button', { name: '붙이기' }))
    const current = await within(card).findByTestId('quote-attachment-current')
    expect(within(current).getByText('링크')).toBeTruthy()
    expect(within(current).getByRole('link', { name: '구글 시트' }).getAttribute('href')).toBe('https://docs.google.com/spreadsheets/d/virtual-quote')
    expect((await mockProvider().getProject(project.id)).quote_attachment).toMatchObject({ kind: 'link', source: 'link', drive_file_id: null })

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(within(card).getByRole('button', { name: '빼기' }))
    expect(within(card).getByTestId('quote-attachment-current')).toBeTruthy()
    confirm.mockReturnValue(true)
    await userEvent.click(within(card).getByRole('button', { name: '빼기' }))
    await within(card).findByTestId('quote-attachment-empty')
    expect((await mockProvider().getProject(project.id)).quote_attachment).toBeNull()
  })

  it('Slack 글의 첨부·링크 목록: 파일은 데모에서 막힘(이유 title) · 링크는 붙인다(라벨이 이름)', async () => {
    const p = mockProvider()
    const project = await p.createProject({})
    const onChanged = vi.fn()
    render(
      <QuoteAttachmentCard
        projectId={project.id}
        project={project}
        onChanged={onChanged}
        slackFiles={[{ id: 'F1', name: '가상_견적서.xlsx', mimetype: null, size: 24_000, looks_like_quote: true }]}
        slackLinks={[{ url: 'https://docs.google.com/spreadsheets/d/x', label: '견적 시트', looks_like_quote: true }]}
      />,
    )
    const box = screen.getByTestId('quote-attachment-slack')
    expect(box.textContent).toContain('가상_견적서.xlsx')
    expect(box.textContent).toContain('23KB')
    const fileBtn = within(box).getByRole('button', { name: '이 파일 첨부' }) as HTMLButtonElement
    expect(fileBtn.disabled).toBe(true)
    expect(fileBtn.title).toBe(QUOTE_ATTACHMENT_MOCK_FILE_MESSAGE)
    await userEvent.click(within(box).getByRole('button', { name: '이 링크 첨부' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect((await p.getProject(project.id)).quote_attachment).toMatchObject({ kind: 'link', url: 'https://docs.google.com/spreadsheets/d/x', file_name: '견적 시트', source: 'link' })
  })

  it('행사 설정 ① 기본 정보에도 견적서 칸 — design(읽기 전용)은 붙이기·빼기 없음', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/settings')
    await screen.findByLabelText('행사명')
    expect(screen.getByTestId('quote-attachment')).toBeTruthy()
    expect(screen.getByRole('button', { name: '링크 붙이기' })).toBeTruthy()
    cleanup()
    mockProvider().switchUser('usr-design')
    renderRoute('/settings')
    await screen.findByLabelText('행사명')
    const card = screen.getByTestId('quote-attachment')
    expect(within(card).queryByRole('button', { name: '링크 붙이기' })).toBeNull()
    expect(within(card).queryByLabelText('견적서 파일')).toBeNull()
  })
})

describe('DoD 84 · ④⑤ 버튼 위계 · 매핑', () => {
  it('온보딩 1단계의 채운 버튼은 여전히 다음: 담당자 하나(불러오기·첨부 버튼은 ghost)', async () => {
    await newProjectOnboarding()
    const primaries = screen.getAllByRole('button').filter((b) => /\bbtn-(primary|accent)\b/.test(b.className))
    expect(primaries.map((b) => b.textContent)).toEqual(['다음: 담당자'])
  })

  it('briefToPrefill: 칸 매핑 · 인원은 문자열 · notes → 기타 항목 · recruiting만 유형 · null은 키 없음', () => {
    expect(briefToPrefill(EMPTY_BRIEF)).toEqual({})
    const v = briefToPrefill({
      ...EMPTY_BRIEF,
      name: '가상 포럼',
      event_date: '2027-03-12',
      event_end_date: '2027-03-13',
      start_time: '14:00',
      venue: '가상홀',
      expected_headcount: 300,
      organizer: '가상테크',
      event_type: 'recruiting',
      notes: '동시통역',
    })
    expect(v).toEqual({
      name: '가상 포럼',
      eventDate: '2027-03-12',
      eventEndDate: '2027-03-13',
      startTime: '14:00',
      venue: '가상홀',
      expectedHeadcount: '300',
      organizer: '가상테크',
      eventType: 'recruiting',
      items: [{ label: INTAKE_NOTES_LABEL, value: '동시통역' }],
    })
    expect('eventType' in briefToPrefill({ ...EMPTY_BRIEF, event_type: 'general' })).toBe(false)
  })
})
