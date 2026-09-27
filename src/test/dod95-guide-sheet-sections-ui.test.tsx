/** @vitest-environment jsdom */
// DoD 95 (Phase 6.11 PR-A · 설계서 v2.21 §27.2) — 화면: 운영가이드 빌더의 답사 체크리스트(확인 n/m) · 설치 도면(항목 연결 → 최신 버전
// 미리보기 · PDF는 링크만) · 참가자 안내(원고·상태 → 발송 완료 n/m) · 홈 '오늘 할 일'의 참가자 안내 행 · 운영계획서 04·06 표.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import GuideBuilder from '../components/guide/GuideBuilder'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { toIsoDate } from '../lib/wbs'
import type { GuideMessagingData } from '../types/entities'
import { mockProvider, renderRoute } from './testUtils'

const provider = mockProvider()

function renderBuilder(id: string, canEdit = true) {
  return render(
    <MemoryRouter>
      <GuideBuilder deliverableId={id} canEdit={canEdit} />
    </MemoryRouter>,
  )
}

async function freshSeeded(title: string) {
  const d = await provider.createDeliverable({ project_id: PROJECT_ID, area: 'ops', category: '운영가이드', title })
  await provider.seedGuideFromSources(d.id)
  return d.id
}

const card = (name: string) => screen.getByRole('heading', { name }).closest('article') as HTMLElement

afterEach(cleanup)

describe('DoD 95 — 운영가이드 빌더 화면(마스터 시트 대체 3종)', () => {
  it('(a) 답사 체크리스트 — 확인 0/14 → 확인내용을 적고 저장하면 확인 1/14 · 저장된 글에 확인 내용', async () => {
    provider.switchUser('usr-pm')
    const id = await freshSeeded('답사 가이드')
    renderBuilder(id)
    await screen.findByRole('heading', { name: '답사 체크리스트' })
    const survey = card('답사 체크리스트')
    expect(within(survey).getByTestId('survey-progress').textContent).toBe('확인 0 / 14')
    expect(within(survey).getByText('답사일 미정')).toBeTruthy()
    await userEvent.click(within(survey).getByRole('button', { name: '고치기' }))
    await userEvent.type(within(survey).getByRole('textbox', { name: '주차 확인내용' }), '지하 2층 200대')
    await userEvent.type(within(survey).getByLabelText('답사일'), '2026-09-30')
    await userEvent.click(within(survey).getByRole('button', { name: '저장' }))
    await waitFor(async () => {
      const saved = (await provider.listGuideSections(id)).find((s) => s.kind === 'survey')!
      expect(saved.data?.type === 'survey' && saved.data.rows[0].finding).toBe('지하 2층 200대')
      expect(saved.content).toContain('확인 지하 2층 200대')
    })
    expect(within(card('답사 체크리스트')).getByTestId('survey-progress').textContent).toBe('확인 1 / 14')
    expect(within(card('답사 체크리스트')).getByText(/답사일 9월 30일/)).toBeTruthy()
  })

  it('(b) 설치 도면 — 비어 있음 → 도면 추가 + 항목 연결(디자인 · 메인 키비주얼) → 최신 PNG 미리보기 · PDF 항목은 링크만 · 파일 입력 0', async () => {
    provider.switchUser('usr-pm')
    const id = await freshSeeded('도면 가이드')
    renderBuilder(id)
    await screen.findByRole('heading', { name: '설치 도면' })
    const plan = card('설치 도면')
    expect(within(plan).getByText('비어 있음')).toBeTruthy()
    await userEvent.click(within(plan).getByRole('button', { name: '고치기' }))
    expect(within(plan).queryByLabelText(/파일/)).toBeNull()
    await userEvent.click(within(plan).getByRole('button', { name: '＋ 도면 추가' }))
    await userEvent.type(within(plan).getByRole('textbox', { name: '도면 1 이름' }), '무대 평면도')
    await userEvent.selectOptions(within(plan).getByRole('combobox', { name: '무대 평면도 연결 항목' }), 'dlv-001')
    await userEvent.click(within(plan).getByRole('button', { name: '＋ 도면 추가' }))
    await userEvent.type(within(plan).getByRole('textbox', { name: '도면 2 이름' }), '명찰 배치')
    await userEvent.selectOptions(within(plan).getByRole('combobox', { name: '명찰 배치 연결 항목' }), 'dlv-002')
    await userEvent.click(within(plan).getByRole('button', { name: '저장' }))
    await waitFor(async () => {
      const saved = (await provider.listGuideSections(id)).find((s) => s.kind === 'floorplan')!
      expect(saved.data?.type === 'floorplan' && saved.data.items.map((it) => it.deliverable_id)).toEqual(['dlv-001', 'dlv-002'])
    })
    const after = card('설치 도면')
    expect(within(after).queryByText('비어 있음')).toBeNull()
    const img = await within(after).findByTestId('floorplan-image')
    expect(img.getAttribute('alt')).toBe('무대 평면도 도면 v2')
    expect(within(after).getByTestId('floorplan-link-only').textContent).toContain('이미지가 아니라 링크만')
    expect(within(after).getAllByRole('link', { name: /열기$/ }).map((a) => a.getAttribute('href'))).toEqual(['/items/dlv-001', '/items/dlv-002'])
  })

  it('(c) 참가자 안내 — 발송 완료 0/6 · 원고를 적고 상태를 발송 완료로 저장 → 1/6 · 원고 보기 · 발송 도구 안내', async () => {
    provider.switchUser('usr-pm')
    const id = await freshSeeded('안내 가이드')
    renderBuilder(id)
    await screen.findByRole('heading', { name: '참가자 안내' })
    const msg = card('참가자 안내')
    expect(within(msg).getByTestId('messaging-progress').textContent).toBe('발송 완료 0 / 6')
    expect(within(msg).getByText(/발송은 알림톡·이메일 도구에서/)).toBeTruthy()
    expect(within(msg).queryByText('원고 보기')).toBeNull()
    await userEvent.click(within(msg).getByRole('button', { name: '고치기' }))
    // 단계 6개의 원고 칸 가운데 넷째(최종 참가 안내)
    await userEvent.type(within(msg).getAllByLabelText('원고')[3], '안녕하세요. 최종 참가 안내입니다.')
    await userEvent.selectOptions(within(msg).getByRole('combobox', { name: '최종 참가 안내 상태' }), 'sent')
    await userEvent.click(within(msg).getByRole('button', { name: '저장' }))
    await waitFor(async () => {
      const saved = (await provider.listGuideSections(id)).find((s) => s.kind === 'messaging')!
      const d = saved.data as GuideMessagingData
      expect(d.rows[3].status).toBe('sent')
      expect(d.rows[3].body).toContain('최종 참가 안내입니다')
      // 요약 글(content)에는 원고 본문이 없다
      expect(saved.content).not.toContain('안녕하세요')
    })
    const after = card('참가자 안내')
    expect(within(after).getByTestId('messaging-progress').textContent).toBe('발송 완료 1 / 6')
    expect(within(after).getByText('원고 보기')).toBeTruthy()
    expect(within(after).getByText('발송 완료')).toBeTruthy()
  })

  it('(d) 읽기 전용 — 3종 모두 고치기·추가 없이 표만', async () => {
    provider.switchUser('usr-pm')
    const id = await freshSeeded('읽기 가이드')
    renderBuilder(id, false)
    await screen.findByRole('heading', { name: '참가자 안내' })
    for (const name of ['답사 체크리스트', '설치 도면', '참가자 안내']) {
      expect(within(card(name)).queryByRole('button', { name: '고치기' })).toBeNull()
    }
  })
})

describe('DoD 95 — 홈 · 운영계획서', () => {
  it('(e) 홈 오늘 할 일 — 오늘 발송일인 참가자 안내가 행으로(원고 열기 → 운영가이드) · 발송 완료·미래 단계는 없음', async () => {
    provider.switchUser('usr-pm')
    const id = await freshSeeded('홈 안내 가이드')
    const sections = await provider.listGuideSections(id)
    const today = toIsoDate(new Date())
    await provider.saveGuideSections(
      id,
      sections.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        content: s.content,
        source_ref: s.source_ref,
        source_stale: s.source_stale,
        data:
          s.kind === 'messaging'
            ? {
                type: 'messaging',
                rows: [
                  { stage: '오늘 보낼 안내', send_on: today, send_at: '09:00', channel: 'alimtalk', audience: '참가 확정자', subject: '', body: '원고', status: 'ready' },
                  { stage: '이미 보낸 안내', send_on: today, send_at: null, channel: 'email', audience: '', subject: '', body: '', status: 'sent' },
                  { stage: '나중 안내', send_on: '2099-01-01', send_at: null, channel: 'sms', audience: '', subject: '', body: '', status: 'draft' },
                ],
              }
            : (s.data ?? null),
      })),
    )
    renderRoute('/home')
    const row = await screen.findByText('참가자 안내 · 오늘 보낼 안내')
    const tr = row.closest('[data-testid="today-row"]') as HTMLElement
    expect(tr.getAttribute('data-kind')).toBe('messaging')
    expect(within(tr).getByText('오늘 발송')).toBeTruthy()
    expect(within(tr).getByRole('link', { name: '원고 열기' }).getAttribute('href')).toBe(`/items/${id}`)
    expect(screen.queryByText('참가자 안내 · 이미 보낸 안내')).toBeNull()
    expect(screen.queryByText('참가자 안내 · 나중 안내')).toBeNull()
  })

  it('(f) 운영계획서 04 존별 운영에 도면·답사 확인 사항 · 06 등록 통계에 참가자 안내 일정(원고 없음)', async () => {
    provider.switchUser('usr-pm')
    // 운영계획서는 빌더 데이터를 가진 **첫** 운영가이드 항목을 읽는다 — 이 파일의 앞 테스트가 만든 문서가 그것이다(싱글턴 provider)
    const guides = (await provider.listDeliverables(PROJECT_ID, { area: 'ops' })).filter((d) => d.category === '운영가이드')
    let id = ''
    for (const g of guides) {
      if ((await provider.listGuideSections(g.id)).length > 0) {
        id = g.id
        break
      }
    }
    if (!id) id = await freshSeeded('운영계획서 가이드')
    const sections = await provider.listGuideSections(id)
    await provider.saveGuideSections(
      id,
      sections.map((s) => {
        const base = { id: s.id, kind: s.kind, title: s.title, content: s.content, source_ref: s.source_ref, source_stale: s.source_stale }
        if (s.kind === 'floorplan') return { ...base, data: { type: 'floorplan' as const, items: [{ title: '무대 평면도', deliverable_id: 'dlv-001', note: '' }] } }
        if (s.kind === 'survey' && s.data?.type === 'survey')
          return { ...base, data: { ...s.data, visited_on: '2026-09-30', rows: s.data.rows.map((r, i) => (i === 0 ? { ...r, finding: '지하 2층 200대' } : r)) } }
        if (s.kind === 'messaging')
          return {
            ...base,
            data: {
              type: 'messaging' as const,
              rows: [{ stage: '최종 참가 안내', send_on: '2026-10-15', send_at: '10:00', channel: 'alimtalk' as const, audience: '참가 확정자', subject: '제목', body: '비밀 원고 본문', status: 'ready' as const }],
            },
          }
        return { ...base, data: s.data ?? null }
      }),
    )
    renderRoute('/plan')
    const floorplans = await screen.findByTestId('plan-floorplans')
    expect(within(floorplans).getByRole('img', { name: '무대 평면도 도면' })).toBeTruthy()
    const survey = screen.getByTestId('plan-survey')
    expect(within(survey).getByText('지하 2층 200대')).toBeTruthy()
    expect(within(survey).getByText(/답사일 9월 30일/)).toBeTruthy()
    const messaging = screen.getByTestId('plan-messaging')
    expect(within(messaging).getByText('최종 참가 안내')).toBeTruthy()
    expect(within(messaging).getByText('10월 15일 10:00')).toBeTruthy()
    expect(within(messaging).getByText('발송 준비됨')).toBeTruthy()
    expect(screen.queryByText('비밀 원고 본문')).toBeNull()
  })
})
