/** @vitest-environment jsdom */
// v2.5 §10.2·§23 (Phase 3.16c) → v2.13 §23.6 (Phase 3.24 PR-B) — 시나리오 빌더 멘트 원고형:
// 세션 묶음(시각 크게 + 제목 + 프로그램표 연동) · 괄호 지시문과 멘트의 구분 · 블록 추가·고치기·옮기기·지우기(벌크 저장 경유) ·
// 프로그램표 시드(R-O3 — 세션 소개 멘트 + 비상 예비 멘트 3종) · 큐시트로 보내기(R-O5) · 읽기 전용 분기.
// 공용 testUtils(renderRoute)를 건드리지 않기 위해 이 파일 안에서 컴포넌트를 MemoryRouter로 직접 감싸 렌더한다.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ScenarioBuilder from '../components/scenario/ScenarioBuilder'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { getDataProvider } from '../providers'
import type { MockProvider } from '../providers'

const provider = getDataProvider() as MockProvider
const RB27 = PROJECT_ID_REBUILD27
const SCENARIO_ID = 'dlv-rb27-scenario-01'
const CUE_ID = 'dlv-rb27-cue-01'

afterEach(cleanup)

function renderBuilder(deliverableId: string, canEdit: boolean) {
  return render(
    <MemoryRouter>
      <ScenarioBuilder deliverableId={deliverableId} canEdit={canEdit} />
    </MemoryRouter>,
  )
}

async function freshScenario(title: string) {
  return provider.createDeliverable({ project_id: RB27, area: 'ops', category: '시나리오', title })
}

/** 블록의 ⋯ 메뉴에서 고른다 */
async function pickFromMenu(menuLabel: string, item: string) {
  await userEvent.click(screen.getByRole('button', { name: menuLabel }))
  await userEvent.click(within(screen.getByRole('menu', { name: menuLabel })).getByRole('menuitem', { name: item }))
}

describe('시나리오 원고 — RE:BUILD 27 픽스처 렌더 (§23.4 · §23.6)', () => {
  it('세션 3묶음(시각·제목·프로그램표 연동) · 블록 8개 · 구분 배지 5종(MC·영상·의전·전환·지시)', async () => {
    renderBuilder(SCENARIO_ID, true)

    const opening = await screen.findByRole('heading', { name: /오프닝 키노트/ })
    expect(screen.getByRole('heading', { name: /트랙 세션/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /애프터파티/ })).toBeTruthy()
    // 세션 머리 = 시작 시각 크게 + 제목 + 프로그램표 연동 + 길이·비고 한 줄
    const openingHead = opening.parentElement!
    expect(within(openingHead).getByText('10:30')).toBeTruthy()
    expect(within(openingHead).getByText('프로그램표 연동')).toBeTruthy()
    expect(within(openingHead).getByText(/30분 · \(가안\)/)).toBeTruthy()

    expect(screen.getAllByTestId('scenario-block')).toHaveLength(8)
    for (const label of ['MC', '영상', '의전', '전환', '지시']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    // 멘트(MC·의전) 2개가 모두 적혀 있다
    expect(screen.getByTestId('scenario-progress').textContent).toBe('멘트 2 / 2 작성')
  })

  it('멘트는 원고(크게)로, 영상·전환·지시는 괄호 지시문으로 보이고 큐 표기는 칩으로 모인다', async () => {
    renderBuilder(SCENARIO_ID, true)
    await screen.findByRole('heading', { name: /오프닝 키노트/ })

    const ment = screen.getByText(/MC 무대 인사 및 오프닝 키노트 세션 소개/)
    expect(ment.tagName).toBe('P')
    expect(ment.className).toContain('text-base')
    expect(screen.getByText(/^\(오프닝 인트로 영상 재생/)).toBeTruthy()
    expect(screen.getByText('(세션: 오프닝 키노트 (연사 섭외 중))')).toBeTruthy()
    expect(screen.getByText('큐 M-02 · C-11')).toBeTruthy()
  })

  it('세션 목록(왼쪽)이 세션마다 멘트 채움을 보이고, 누르면 주소는 그대로 그 묶음으로 스크롤한다', async () => {
    const calls: string[] = []
    const orig = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      calls.push(this.id)
    }
    try {
      renderBuilder(SCENARIO_ID, true)
      const rail = await screen.findByRole('navigation', { name: '세션 목록' })
      expect(within(rail).getByText('프로그램표 연동 3')).toBeTruthy()
      const link = within(rail).getByRole('link', { name: /오프닝 키노트/ })
      expect(link.textContent).toContain('1/1 ✓')
      await userEvent.click(link)
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatch(/^scn-sec-/)
    } finally {
      Element.prototype.scrollIntoView = orig
    }
  })
})

describe('블록 추가·고치기·옮기기·지우기 — saveScenarioBlocks 벌크 경유', () => {
  it('빈 문서에서도 블록을 더할 수 있고, 멘트 고치기·위로 옮기기·지우기가 전부 저장된다', async () => {
    const fresh = await freshScenario('CRUD 테스트 시나리오')
    const user = userEvent.setup()
    renderBuilder(fresh.id, true)

    await user.click(await screen.findByRole('button', { name: '＋ 블록 추가 (세션 고르기)' }))
    const addCard = screen.getByText(/블록 추가 — 원고에 아직 없는 세션/).parentElement!

    // 추가 #1 — 세션 밖 MC 멘트(기본 구분 = MC)
    await user.type(within(addCard).getByLabelText('시각'), '09:00')
    await user.type(within(addCard).getByLabelText('지시문'), '무대 조명 업')
    await user.type(within(addCard).getByLabelText('멘트'), '안녕하십니까.')
    await user.click(within(addCard).getByRole('button', { name: '추가' }))
    await waitFor(async () => expect(await provider.listScenarioBlocks(fresh.id)).toHaveLength(1))
    expect(await screen.findByText('안녕하십니까.')).toBeTruthy()
    expect(screen.getByText('(무대 조명 업)')).toBeTruthy()

    // 추가 #2 — 영상 블록은 '지시 내용'
    await user.selectOptions(within(addCard).getByLabelText('구분'), 'video')
    await user.type(within(addCard).getByLabelText('시각'), '09:05')
    await user.type(within(addCard).getByLabelText('지시 내용'), '오프닝 영상 재생 V-01')
    await user.click(within(addCard).getByRole('button', { name: '추가' }))
    await waitFor(async () => expect(await provider.listScenarioBlocks(fresh.id)).toHaveLength(2))
    expect((await provider.listScenarioBlocks(fresh.id)).map((b) => b.kind)).toEqual(['mc', 'video'])

    // 아래 추가 칸을 닫고(연속 입력용으로 열려 있다) 멘트 고치기 — ⋯ → 멘트 고치기 → 멘트 칸에 초점
    await user.click(within(addCard).getByRole('button', { name: '취소' }))
    await pickFromMenu('블록 메뉴 09:00 MC', '멘트 고치기')
    const ment = screen.getByLabelText('멘트') as HTMLTextAreaElement
    expect(document.activeElement).toBe(ment)
    await user.clear(ment)
    await user.type(ment, '반갑습니다.')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('반갑습니다.')

    // 위로 옮기기 — 맨 위 블록은 막히고 이유가 붙는다
    await user.click(screen.getByRole('button', { name: '블록 메뉴 09:00 MC' }))
    expect(
      within(screen.getByRole('menu', { name: '블록 메뉴 09:00 MC' })).getByRole('menuitem', { name: '위로 옮기기 — 맨 위라 안 됨' }),
    ).toHaveProperty('disabled', true)
    await user.keyboard('{Escape}')
    await pickFromMenu('블록 메뉴 09:05 영상', '위로 옮기기')
    await waitFor(async () =>
      expect((await provider.listScenarioBlocks(fresh.id)).map((b) => b.kind)).toEqual(['video', 'mc']),
    )

    // 지우기 — 확인 창
    window.confirm = () => true
    await pickFromMenu('블록 메뉴 09:00 MC', '블록 지우기')
    await waitFor(async () => expect(await provider.listScenarioBlocks(fresh.id)).toHaveLength(1))
    expect(screen.queryByText('반갑습니다.')).toBeNull()
  })

  it('비상 예비 멘트는 세션·시각 없이 상황과 멘트만 받는다', async () => {
    const fresh = await freshScenario('비상 멘트 테스트')
    await provider.saveScenarioBlocks(fresh.id, [{ kind: 'mc', time: '14:00', script: '환영합니다.', note: null }])
    const user = userEvent.setup()
    renderBuilder(fresh.id, true)

    const section = (await screen.findByRole('heading', { name: '비상 예비 멘트' })).closest('section')!
    expect(within(section).getByText(/아직 없습니다/)).toBeTruthy()
    await user.click(within(section).getByRole('button', { name: '＋ 비상 멘트' }))
    expect(within(section).queryByLabelText('세션')).toBeNull()
    expect(within(section).queryByLabelText('시각')).toBeNull()
    await user.type(within(section).getByLabelText('상황'), '정전')
    await user.type(within(section).getByLabelText('멘트'), '잠시만 기다려 주십시오.')
    await user.click(within(section).getByRole('button', { name: '추가' }))

    await waitFor(async () => {
      const emergency = (await provider.listScenarioBlocks(fresh.id)).find((b) => b.kind === 'emergency')
      expect(emergency).toMatchObject({ note: '정전', session_id: null, time: null, script: '잠시만 기다려 주십시오.' })
    })
    // 배지 = 상황 이름 · 비상 멘트는 멘트 작성 수에 섞이지 않는다(빈 묶음 자리가 실제 묶음으로 바뀌므로 다시 찾는다)
    const filled = (await screen.findByRole('heading', { name: '비상 예비 멘트' })).closest('section')!
    expect(await within(filled).findByText('정전')).toBeTruthy()
    expect(screen.getByTestId('scenario-progress').textContent).toBe('멘트 1 / 1 작성')
  })
})

describe('시드 — 빈 문서에서만(R-O3) · §23.6 원고 뼈대', () => {
  it('세션마다 소개 멘트 자리 + 비상 예비 멘트 3종 — 연사 정보가 없는 세션은 빈 멘트(추측 없음), 다시 만들기는 409', async () => {
    const fresh = await freshScenario('시드 테스트 시나리오')
    const user = userEvent.setup()
    renderBuilder(fresh.id, true)

    await user.click(await screen.findByRole('button', { name: '프로그램표에서 뼈대 만들기' }))
    const sessions = await provider.listProgramSessions(RB27)
    await waitFor(async () => expect(await provider.listScenarioBlocks(fresh.id)).toHaveLength(sessions.length + 3))

    // RB27 프로그램표에는 연사가 없다 — 소개 멘트는 비워 두고 '멘트 쓰기'로 채운다
    expect(await screen.findAllByText('멘트가 비어 있습니다')).toHaveLength(sessions.length)
    expect(screen.getAllByRole('button', { name: '멘트 쓰기' })).toHaveLength(sessions.length)
    const emergency = screen.getByRole('heading', { name: '비상 예비 멘트' }).closest('section')!
    for (const s of ['영상 장애', '발표자 지연', '음향 교체']) expect(within(emergency).getByText(s)).toBeTruthy()

    expect(screen.queryByRole('button', { name: '프로그램표에서 뼈대 만들기' })).toBeNull()
    await expect(provider.seedScenarioFromProgram(fresh.id)).rejects.toMatchObject({ status: 409 })
  })
})

describe('큐시트로 보내기 — R-O5·§23.3', () => {
  it('기존 큐를 보존하고 후미에 삽입하며, 변환 건수를 화면에 표시한다', async () => {
    const existing = await provider.createCue(CUE_ID, { cue_no: 'C00', segment: '사전', body: '기존 큐(변형 금지)' })
    expect(await provider.listCues(CUE_ID)).toHaveLength(1)

    renderBuilder(SCENARIO_ID, true)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '큐시트로 보내기' }))
    const select = await screen.findByLabelText('대상 큐시트')
    await user.selectOptions(select, CUE_ID)
    await user.click(screen.getByRole('button', { name: '내보내기' }))

    // 후보 = video·transition 블록 중 큐 표기가 있는 3개(§23.3)
    expect(await screen.findByText(/큐 3개를 후미에 추가했습니다/)).toBeTruthy()
    const after = await provider.listCues(CUE_ID)
    expect(after).toHaveLength(4)
    expect(after[0].id).toBe(existing.id)
    expect(after[0].body).toBe('기존 큐(변형 금지)')
  })
})

describe('읽기 전용(canEdit=false) — §10.2', () => {
  it('메뉴·추가·시드·보내기가 없고, 원고와 인쇄는 그대로다', async () => {
    renderBuilder(SCENARIO_ID, false)
    await screen.findByRole('heading', { name: /오프닝 키노트/ })

    expect(screen.queryAllByRole('button', { name: /^블록 메뉴/ })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /＋/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '큐시트로 보내기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '프로그램표에서 뼈대 만들기' })).toBeNull()
    // 비상 예비 멘트가 없는 문서면 읽기 전용에는 빈 묶음도 그리지 않는다
    expect(screen.queryByRole('heading', { name: '비상 예비 멘트' })).toBeNull()

    expect(screen.getByText(/^\(오프닝 인트로 영상 재생/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '인쇄 · MC 배포용' })).toBeTruthy()
  })
})

describe('연사 확인 대기 — 대괄호 자리(§23.6)', () => {
  it('자리가 남은 멘트는 표시되고, 프로그램표에 연사가 들어오면 그 값으로 채울 수 있다', async () => {
    const withSpeaker = await provider.createProgramSession(RB27, {
      title: '초청 강연',
      start_time: '16:40',
      end_time: '17:10',
      speaker_name: '김가상',
      speaker_title: '대표',
      speaker_org: '가상랩',
    })
    const fresh = await freshScenario('연사 확인 테스트')
    await provider.saveScenarioBlocks(fresh.id, [
      { session_id: withSpeaker.id, time: '16:40', kind: 'mc', script: '[소속] [직함] [연사 이름] 님을 모시겠습니다.', note: null },
      { session_id: null, time: '17:20', kind: 'mc', script: '○○○ 님께 감사드립니다.', note: null },
    ])
    const user = userEvent.setup()
    renderBuilder(fresh.id, true)

    const pending = await screen.findAllByTestId('speaker-pending')
    expect(pending).toHaveLength(2)
    expect(screen.getByText('연사 확인 대기 2')).toBeTruthy()
    // 무엇의 자리인지 모르는 ○○○는 채우지 않고 프로그램표로 보낸다
    expect(within(pending[1]).getByRole('link', { name: '프로그램표 열기' }).getAttribute('href')).toBe('/plan')

    await user.click(within(pending[0]).getByRole('button', { name: '프로그램표 연사로 채우기' }))
    expect(await screen.findByText('가상랩 대표 김가상 님을 모시겠습니다.')).toBeTruthy()
    expect(screen.getByText('연사 확인 대기 1')).toBeTruthy()
    const saved = (await provider.listScenarioBlocks(fresh.id)).find((b) => b.session_id === withSpeaker.id)
    expect(saved?.script).toBe('가상랩 대표 김가상 님을 모시겠습니다.')
  })
})
