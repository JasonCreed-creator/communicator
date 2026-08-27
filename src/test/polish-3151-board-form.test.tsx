/** @vitest-environment jsdom */
// Phase 3.15.1 지시문 P7 — 보드 하단 통합 "항목 추가" 카드.
// dod7-brief-flow.test.tsx·board-presets.test.tsx가 가이드 모드(토글 on) 경로를 이미 덮으므로,
// 이 파일은 그 두 파일이 다루지 않는 나머지 계약만 검증한다:
//   (a) 기본 접힘 — 버튼 상시 노출, 클릭 전엔 폼이 렌더되지 않는다
//   (b) 토글 꺼짐 = 기존 셀프 생성 경로(status='draft', brief 없음)
//   (c) 카테고리 '큐시트' 생성 직후 인라인 에디터가 보드 화면 안에서 바로 열린다(채택안: 인라인 패널)
//   (d) P6-⑥ 보드 그룹 헤딩 라벨 치환 — 데이터(category)는 그대로, 표시만 바뀐다
//   (e) P5-③ 제목 검색
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('P7 통합 "항목 추가" 카드 — 접힘·토글 끔 경로·큐시트 인라인', () => {
  it('(a) 기본 접힘 — 버튼만 보이고, 클릭해야 카드가 펼쳐진다', async () => {
    renderRoute('/board/design')

    const btn = await screen.findByRole('button', { name: '＋ 항목 추가' })
    expect(screen.queryByRole('heading', { name: '항목 추가' })).toBeNull()

    await userEvent.click(btn)
    expect(await screen.findByRole('heading', { name: '항목 추가' })).toBeTruthy()
  })

  it('(b) 토글을 끈 채(기본값) 제출하면 기존 셀프 생성 경로 — status=draft, brief 없음', async () => {
    renderRoute('/board/ops')

    await userEvent.click(await screen.findByRole('button', { name: '＋ 항목 추가' }))
    const heading = await screen.findByRole('heading', { name: '항목 추가' })
    const form = heading.closest('div')!.parentElement!

    // 가이드 포함 토글은 기본 꺼짐 — 가이드 전용 필드(가이드 내용 등)가 없다
    expect(within(form).queryByLabelText('가이드 내용')).toBeNull()

    await userEvent.selectOptions(within(form).getByLabelText('카테고리'), '운영안')
    await userEvent.type(within(form).getByLabelText('제목'), '현장 운영안 초안')
    await userEvent.click(within(form).getByRole('button', { name: '생성' }))

    const row = (await screen.findByText('현장 운영안 초안')).closest('li')!
    expect(within(row).getByText('초안')).toBeTruthy()
    expect(within(row).queryByText('가이드됨')).toBeNull()

    const created = (await mockProvider().listDeliverables('prj-stc26', { area: 'ops' })).find(
      (d) => d.title === '현장 운영안 초안',
    )
    expect(created).toBeTruthy()
    expect(created!.status).toBe('draft')
    expect(created!.brief).toBeFalsy()
  })

  it('(c) 카테고리 "큐시트"로 생성하면 직후 보드 화면 안 인라인 패널로 큐시트 에디터가 열린다', async () => {
    renderRoute('/board/ops')

    await userEvent.click(await screen.findByRole('button', { name: '＋ 항목 추가' }))
    const heading = await screen.findByRole('heading', { name: '항목 추가' })
    const form = heading.closest('div')!.parentElement!

    await userEvent.selectOptions(within(form).getByLabelText('카테고리'), '큐시트')
    await userEvent.type(within(form).getByLabelText('제목'), '폐막식 큐시트')
    await userEvent.click(within(form).getByRole('button', { name: '생성' }))

    // "항목 추가" 카드는 접혀 돌아가고, 새 인라인 패널이 바로 뜬다 — 파일 업로드 폼이 아니라 정형 표
    const panel = await screen.findByRole('heading', { name: /큐시트 바로 편집 — 폐막식 큐시트/ })
    const panelRoot = panel.closest('div')!.parentElement!
    expect(within(panelRoot).getByText('작성된 큐가 없습니다.')).toBeTruthy()
    expect(within(panelRoot).getByText('행 추가')).toBeTruthy() // pm이라 편집 가능

    // 보드 목록에도 정상적으로 반영된다(중복 렌더가 아니라 두 곳 다 최신 상태)
    expect(await screen.findByText('폐막식 큐시트')).toBeTruthy()

    const created = (await mockProvider().listDeliverables('prj-stc26', { area: 'ops' })).find(
      (d) => d.title === '폐막식 큐시트',
    )
    expect(created?.category).toBe('큐시트')

    // 닫기로 패널을 접을 수 있다
    await userEvent.click(within(panelRoot).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('heading', { name: /큐시트 바로 편집/ })).toBeNull()
  })
})

describe('P6-⑥ 보드 그룹 헤딩 라벨 — "발주 제작물" → "컨펌 대상 제작물" (표시만)', () => {
  it('실측 이식 픽스처(RE:BUILD 27)의 category=발주 제작물 그룹이 "컨펌 대상 제작물"로 표시된다', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-rebuild27')
    renderRoute('/board/design')

    expect(await screen.findByText('컨펌 대상 제작물')).toBeTruthy()
    expect(screen.queryByText('발주 제작물')).toBeNull()

    // 데이터(Deliverable.category)는 원문 그대로 저장돼 있다 — 화면 표시만 바뀐 것
    const items = await mockProvider().listDeliverables('prj-rebuild27', { area: 'design' })
    expect(items.some((d) => d.category === '발주 제작물')).toBe(true)
  })
})

describe('P5-③ 보드 제목 검색', () => {
  it('제목으로 검색하면 일치하는 항목만 남고, 지우면 전부 돌아온다', async () => {
    // 앞선 P6-⑥ 검사가 currentProjectId를 RE:BUILD 27로 바꿔 두므로 명시적으로 되돌린다.
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/board/design')

    await screen.findByText('메인 키비주얼')
    expect(screen.getByText('참가자 명찰')).toBeTruthy()

    const search = screen.getByLabelText('제목 검색')
    await userEvent.type(search, '명찰')

    expect(screen.getByText('참가자 명찰')).toBeTruthy()
    expect(screen.queryByText('메인 키비주얼')).toBeNull()

    await userEvent.clear(search)
    expect(await screen.findByText('메인 키비주얼')).toBeTruthy()
    expect(screen.getByText('참가자 명찰')).toBeTruthy()
  })
})

describe('P8 InfoTip — 보드 화면', () => {
  it('페이지 헤더·상태 범례·가이드 토글에 도움말이 뜬다(화면당 5개 이내)', async () => {
    localStorage.setItem('communicator.currentProjectId', 'prj-stc26')
    renderRoute('/board/design')

    // 헤더 InfoTip(BOARD_HELP) — h1 자체 텍스트는 오염되지 않는다
    expect(await screen.findByRole('heading', { name: '디자인 보드' })).toBeTruthy()
    const helpButtons = screen.getAllByRole('button', { name: '도움말' })
    expect(helpButtons.length).toBeGreaterThanOrEqual(1)

    // 상태 범례 — 뱃지마다 InfoTip 아이콘 대신 title 속성 하나로 과밀을 피한다
    const legend = screen.getByLabelText('상태 범례')
    expect(within(legend).getByText('가이드됨').getAttribute('title')).toContain('PM이 제작 지시를 발행')

    // 항목 추가를 펼치면 pm 전용 토글 옆에도 InfoTip이 하나 더 뜬다(화면당 5개 이내 유지)
    await userEvent.click(screen.getByRole('button', { name: '＋ 항목 추가' }))
    await screen.findByRole('heading', { name: '항목 추가' })
    const afterExpand = screen.getAllByRole('button', { name: '도움말' })
    expect(afterExpand.length).toBe(helpButtons.length + 1)
    expect(afterExpand.length).toBeLessThanOrEqual(5)
  })
})
