/** @vitest-environment jsdom */
// DoD-7: 가이드(instruction) 발행 흐름 — 가이드 발행 → 담당자 화면 '가이드됨' 뱃지 →
// 첫 업로드 시 draft 자동 전환 (CLAUDE.md v1.2 §7 DoD-7).
// 픽스처 초기화 단위 = 이 파일. 아래 테스트는 시나리오 순서대로 실행되며 같은
// MockProvider 상태를 공유한다 (src/test/testUtils.tsx 참조).
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

// PM(usr-pm)이 발행한 가이드가 이 변수로 다음 테스트들에 전달된다.
let issuedItemId = ''

describe('DoD-7 가이드 발행 흐름', () => {
  it('(a) pm이 보드의 통합 "항목 추가" 카드에서 가이드 포함 토글을 켜고 발행하면 보드에 가이드됨 뱃지로 나타난다', async () => {
    renderRoute('/board/design')

    // P7(3.15.1) — 옛 '새 항목 생성'·'가이드 발행' 두 폼이 통합 "항목 추가" 카드 1개로 바뀌었다.
    // 기본 접힘 — 버튼을 눌러야 펼쳐진다.
    await userEvent.click(await screen.findByRole('button', { name: '＋ 항목 추가' }))
    const heading = await screen.findByRole('heading', { name: '항목 추가' })
    const form = heading.closest('div')!.parentElement!

    // pm 전용 "제작 가이드 포함" 토글을 켜야 가이드 필드(내용·참고 링크·스펙 4)가 펼쳐진다
    await userEvent.click(within(form).getByLabelText(/제작 가이드 포함/))

    // 카테고리는 영역별 프리셋 선택이 기본이고, 목록에 없는 항목은 '직접 입력'으로 만든다.
    // '사이니지'는 프리셋에 없는 값이라 자유 입력 경로까지 함께 검증된다.
    await userEvent.selectOptions(within(form).getByLabelText('카테고리'), '__custom__')
    await userEvent.type(within(form).getByLabelText('카테고리'), '사이니지')
    await userEvent.type(within(form).getByLabelText('제목'), '입구 사이니지')
    const assigneeSelect = within(form).getByLabelText('담당자')
    const designOption = await within(assigneeSelect).findByText('이디자')
    await userEvent.selectOptions(assigneeSelect, designOption)
    await userEvent.type(within(form).getByLabelText('가이드 내용'), '입구 사이니지 시안 요청.')
    await userEvent.type(
      within(form).getByLabelText('참고 링크 (선택, 한 줄에 하나씩)'),
      'https://example.com/refs/signage',
    )
    await userEvent.type(within(form).getByLabelText('규격 (선택)'), '2000×3000mm')
    await userEvent.type(within(form).getByLabelText('수량 (선택)'), '2')
    await userEvent.type(within(form).getByLabelText('위치 (선택)'), '로비 입구')
    await userEvent.type(within(form).getByLabelText('종류 (선택)'), '현수막')

    await userEvent.click(within(form).getByRole('button', { name: '가이드 발행' }))

    const row = (await screen.findByText('입구 사이니지')).closest('li')!
    expect(within(row).getByText('가이드됨')).toBeTruthy()

    const created = (await mockProvider().listDeliverables('prj-stc26', { area: 'design' })).find(
      (d) => d.title === '입구 사이니지',
    )
    expect(created).toBeTruthy()
    expect(created!.status).toBe('requested')
    expect(created!.assignee_id).toBe('usr-design')
    expect(created!.brief).toBe('입구 사이니지 시안 요청.')
    issuedItemId = created!.id
  })

  it('(b) design 사용자 홈에 받은 가이드로 해당 항목이 노출된다', async () => {
    mockProvider().switchUser('usr-design')
    renderRoute('/')

    const widget = (await screen.findByRole('heading', { name: '받은 가이드' })).closest('div')!.parentElement!
    expect(within(widget).getByText('입구 사이니지')).toBeTruthy()
    expect(within(widget).getByText('사이니지')).toBeTruthy()
  })

  it('(c) S3 상세에 가이드 카드(브리프+스펙 칩)가 렌더된다', async () => {
    renderRoute(`/items/${issuedItemId}`)

    expect(await screen.findByRole('heading', { name: '가이드 카드' })).toBeTruthy()
    expect(screen.getByText('입구 사이니지 시안 요청.')).toBeTruthy()
    expect(screen.getByText('https://example.com/refs/signage')).toBeTruthy()
    expect(screen.getByText('2000×3000mm')).toBeTruthy()
    expect(screen.getByText('2개')).toBeTruthy()
    expect(screen.getByText('로비 입구')).toBeTruthy()
    expect(screen.getByText('현수막')).toBeTruthy()
    // 상태 액션 바 — requested 안내 문구
    expect(screen.getByText(/첫 버전을 업로드하면 자동으로 초안\(draft\) 상태로 전환됩니다/)).toBeTruthy()
  })

  it('(d) 첫 버전 업로드 시 초안 상태로 자동 전환된다', async () => {
    renderRoute(`/items/${issuedItemId}`)
    await screen.findByText('가이드됨')

    const fileInput = screen.getByLabelText(/파일/) as HTMLInputElement
    await userEvent.upload(fileInput, new File(['fake'], '사이니지_v1.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: '업로드' }))

    expect(await screen.findByText('초안')).toBeTruthy()
    const d = await mockProvider().getDeliverable(issuedItemId)
    expect(d.status).toBe('draft')
    expect(d.versions).toHaveLength(1)
    expect(d.versions[0].version_no).toBe(1)
  })

  it('(e) pm이 아닌 사용자에게는 "제작 가이드 포함" 토글이 노출되지 않는다', async () => {
    // usr-design으로 전환된 상태가 (b)부터 유지된다.
    renderRoute('/board/design')

    // 담당(area) 역할도 통합 카드로 셀프 생성은 여전히 할 수 있다 — 토글만 pm 전용이다.
    await userEvent.click(await screen.findByRole('button', { name: '＋ 항목 추가' }))
    await screen.findByRole('heading', { name: '항목 추가' })
    expect(screen.queryByLabelText(/제작 가이드 포함/)).toBeNull()
    expect(screen.queryByText('가이드 발행')).toBeNull()
  })
})
