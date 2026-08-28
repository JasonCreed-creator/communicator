/** @vitest-environment jsdom */
// v2.5 §10.2·§23 (Phase 3.16c) — 시나리오 빌더: 세션 그룹 렌더·진행 블록 CRUD/정렬(벌크 저장
// 경유)·프로그램표 시드(R-O3)·큐시트로 내보내기(R-O5)·읽기 전용 분기.
// ScenarioBuilder는 아직 어떤 페이지에도 배선되지 않았다(3.16b가 보드에 배선) — 공용
// testUtils(renderRoute)를 건드리지 않기 위해 quote-import-wizard.test.tsx와 동일하게
// 이 파일 안에서 컴포넌트를 MemoryRouter로 직접 감싸 렌더한다.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ScenarioBuilder from '../components/scenario/ScenarioBuilder'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'
import { SCENARIO_KIND_LABELS } from '../lib/labels'
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

describe('시나리오 빌더 — RE:BUILD 27 픽스처 렌더 (§23.4)', () => {
  it('세션 3그룹·진행 블록 8행·구분 칩 5종 라벨이 렌더된다', async () => {
    renderBuilder(SCENARIO_ID, true)

    // 세션 그룹 헤더 3종(프로그램표 연동 — 등록·웰컴 세션은 블록이 없어 그룹도 없다)
    expect(await screen.findByRole('button', { name: /오프닝 키노트/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /트랙 세션/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /애프터파티/ })).toBeTruthy()

    // 3.16.4 화면 B — 세션 = 개별 카드(카드마다 thead 1행) + 블록 8행 = 11행
    expect(screen.getAllByRole('row')).toHaveLength(11)
    // 프로그램표 연동 배지가 세션 카드 3곳에 붙는다(공통/수동 그룹은 없음)
    expect(screen.getAllByText('프로그램표 연동')).toHaveLength(3)

    // 구분 칩 5종(MC·영상·의전·전환·커스텀) 전부 등장 — RB27 픽스처가 5종을 모두 포함한다
    for (const label of Object.values(SCENARIO_KIND_LABELS)) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })

  it('대본이 행에 인라인 노출된다 — 짧은 대본은 토글 없이 전문이 바로 보인다(3.16.4 읽기 우선)', async () => {
    renderBuilder(SCENARIO_ID, true)
    await screen.findByRole('button', { name: /오프닝 키노트/ })

    // RB27 대본은 전부 72자 이하 — 클릭 없이 본문이 행에 보이고, 풀 멘트 토글은 없다
    expect(screen.getByText(/오프닝 인트로 영상 재생/)).toBeTruthy()
    expect(screen.getByText(/MC 무대 인사 및 오프닝 키노트 세션 소개/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /풀 멘트 펼침/ })).toBeNull()
  })

  it('장문 대본(72자 초과)은 말줄임 미리보기 + "풀 멘트 펼침 ▾" 토글로 전문 패널이 열린다', async () => {
    const LONG = '안녕하십니까, RE:BUILD 27에 오신 여러분을 진심으로 환영합니다. ' .repeat(3).trim()
    const fresh = await provider.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '시나리오',
      title: '장문 대본 테스트 시나리오',
    })
    await provider.saveScenarioBlocks(fresh.id, [
      { session_id: null, time: '09:32', kind: 'mc', script: LONG, note: '프롬프터 #1' },
    ])
    renderBuilder(fresh.id, true)

    await screen.findByRole('button', { name: '풀 멘트 펼침 ▾' })
    // 전문 패널이 열리기 전에는 잘린 미리보기만 있다(말줄임 문자)
    expect(screen.getByText(/…$/)).toBeTruthy()
    // 클릭 시점에 재조회 — 헤더(권한·행사) 비동기 로드의 재렌더와 겹치면 이전 참조가 detach될 수 있다
    await userEvent.click(screen.getByRole('button', { name: '풀 멘트 펼침 ▾' }))
    // 패널 제목 + 전문 렌더
    expect(await screen.findByText(/풀 멘트 — 프롬프터 #1/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '풀 멘트 접기 ▴' })).toBeTruthy()
  })
})

describe('진행 블록 CRUD·정렬 — saveScenarioBlocks 벌크 경유', () => {
  it('행 추가·편집·삭제·↑/↓ 정렬이 전부 반영된다', async () => {
    const fresh = await provider.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '시나리오',
      title: 'CRUD 테스트 시나리오',
    })
    const user = userEvent.setup()
    renderBuilder(fresh.id, true)

    await user.click(await screen.findByRole('button', { name: '+ 진행 블록 (공통·다른 세션)' }))
    await screen.findByText('진행 블록 추가')
    const addForm = screen.getByText('진행 블록 추가').closest('div')!

    // 추가 #1 — 공통/수동 블록
    await user.type(within(addForm).getByLabelText('시각'), '09:00')
    await user.selectOptions(within(addForm).getByLabelText('구분'), 'mc')
    await user.type(within(addForm).getByLabelText('대본'), '첫 블록 대본')
    await user.type(within(addForm).getByLabelText('비고'), '첫 블록')
    await user.click(within(addForm).getByRole('button', { name: '추가' }))

    await waitFor(async () => {
      expect(await provider.listScenarioBlocks(fresh.id)).toHaveLength(1)
    })
    expect(screen.getByText('첫 블록')).toBeTruthy()

    // 추가 #2 — 정렬 테스트용
    await user.type(within(addForm).getByLabelText('시각'), '09:30')
    await user.selectOptions(within(addForm).getByLabelText('구분'), 'video')
    await user.type(within(addForm).getByLabelText('비고'), '두번째 블록')
    await user.click(within(addForm).getByRole('button', { name: '추가' }))

    await waitFor(async () => {
      expect(await provider.listScenarioBlocks(fresh.id)).toHaveLength(2)
    })
    expect(screen.getByText('두번째 블록')).toBeTruthy()
    // 추가는 후미에 붙는다(공통/수동 그룹 안에서 등록 순서 유지)
    expect(
      (await provider.listScenarioBlocks(fresh.id)).map((b) => b.note),
    ).toEqual(['첫 블록', '두번째 블록'])

    // 편집 — 첫 블록 비고 변경
    const firstRow = screen.getByText('첫 블록').closest('tr')!
    await user.click(within(firstRow).getByRole('button', { name: '편집' }))
    const noteInput = within(firstRow).getByLabelText('비고') as HTMLInputElement
    await user.clear(noteInput)
    await user.type(noteInput, '수정된 블록')
    await user.click(within(firstRow).getByRole('button', { name: '저장' }))

    await screen.findByText('수정된 블록')
    expect(
      (await provider.listScenarioBlocks(fresh.id)).find((b) => b.note === '수정된 블록'),
    ).toBeTruthy()

    // 정렬 — 두번째 블록을 위로 이동(공통/수동 그룹 내부 인접 교환)
    const secondRow = screen.getByText('두번째 블록').closest('tr')!
    await user.click(within(secondRow).getByRole('button', { name: '위로' }))

    await waitFor(async () => {
      const ordered = await provider.listScenarioBlocks(fresh.id)
      expect(ordered.map((b) => b.note)).toEqual(['두번째 블록', '수정된 블록'])
    })

    // 삭제 — 수정된 블록 삭제
    window.confirm = () => true
    const editedRow = screen.getByText('수정된 블록').closest('tr')!
    await user.click(within(editedRow).getByRole('button', { name: '삭제' }))

    await waitFor(async () => {
      expect(await provider.listScenarioBlocks(fresh.id)).toHaveLength(1)
    })
    expect(screen.queryByText('수정된 블록')).toBeNull()
    expect(screen.getByText('두번째 블록')).toBeTruthy()
  })
})

describe('시드 — 빈 문서에서만(R-O3)', () => {
  it('빈 시나리오에서 시드 버튼 클릭 시 세션당 2블록씩 생성되고, 이후 버튼이 사라진다(재시드 불가)', async () => {
    const fresh = await provider.createDeliverable({
      project_id: RB27,
      area: 'ops',
      category: '시나리오',
      title: '시드 테스트 시나리오',
    })
    const user = userEvent.setup()
    renderBuilder(fresh.id, true)

    const seedBtn = await screen.findByRole('button', { name: '프로그램표에서 뼈대 만들기' })
    await user.click(seedBtn)

    const sessions = await provider.listProgramSessions(RB27)
    await waitFor(async () => {
      expect(await provider.listScenarioBlocks(fresh.id)).toHaveLength(sessions.length * 2)
    })

    // 재시드 불가 — 블록이 생겼으므로 버튼이 더는 노출되지 않는다(R-O3)
    expect(screen.queryByRole('button', { name: '프로그램표에서 뼈대 만들기' })).toBeNull()

    // 방어적 확인 — API를 직접 호출해도 409(UI 가드와 무관하게 서버가 최종 방어선)
    await expect(provider.seedScenarioFromProgram(fresh.id)).rejects.toMatchObject({ status: 409 })
  })
})

describe('큐시트로 내보내기 — R-O5·§23.3', () => {
  it('기존 큐를 보존하고 후미에 삽입하며, 변환 건수를 화면에 표시한다', async () => {
    const existing = await provider.createCue(CUE_ID, {
      cue_no: 'C00',
      segment: '사전',
      body: '기존 큐(변형 금지)',
    })
    expect(await provider.listCues(CUE_ID)).toHaveLength(1)

    renderBuilder(SCENARIO_ID, true)
    const user = userEvent.setup()

    // 3.16.4 — 내보내기는 헤더 버튼으로 패널을 연 뒤 진행한다(목업 화면 B 버튼 배치)
    await user.click(await screen.findByRole('button', { name: '큐시트로 내보내기' }))
    // RB27에는 큐시트가 1건뿐이라 자동 선택된다 — 명시적으로도 골라 견고하게 만든다
    const select = await screen.findByLabelText('대상 큐시트')
    await user.selectOptions(select, CUE_ID)
    await user.click(screen.getByRole('button', { name: '내보내기' }))

    // 후보 = video·transition 블록 중 큐 표기가 있는 3개(§23.3, MockProvider.opsDocs.test.ts와 동일 기대)
    expect(await screen.findByText(/큐 3개를 후미에 추가했습니다/)).toBeTruthy()

    const after = await provider.listCues(CUE_ID)
    expect(after).toHaveLength(4)
    expect(after[0].id).toBe(existing.id)
    expect(after[0].body).toBe('기존 큐(변형 금지)')
  })
})

describe('읽기 전용(canEdit=false) — §10.2', () => {
  it('편집·삭제·정렬·시드·내보내기 UI가 전부 없고, 대본 열람은 그대로 가능하다', async () => {
    renderBuilder(SCENARIO_ID, false)

    await screen.findByRole('button', { name: /오프닝 키노트/ })

    expect(screen.queryByRole('button', { name: '편집' })).toBeNull()
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull()
    expect(screen.queryByRole('button', { name: '위로' })).toBeNull()
    expect(screen.queryByRole('button', { name: '아래로' })).toBeNull()
    expect(screen.queryByText(/\+ 진행 블록/)).toBeNull()
    expect(screen.queryByText('큐시트로 내보내기')).toBeNull()
    expect(screen.queryByRole('button', { name: '프로그램표에서 뼈대 만들기' })).toBeNull()

    // 대본 열람은 읽기 전용에서도 가능 — 3.16.4부터는 클릭 없이 행에 인라인 노출된다
    expect(screen.getByText(/오프닝 인트로 영상 재생/)).toBeTruthy()
  })
})
