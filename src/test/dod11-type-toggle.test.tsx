/** @vitest-environment jsdom */
// DoD-11: 행사 유형 토글 — general(일반형)이면 등록 화면의 RSVP 파이프라인은 표시 계층에서만
// 숨겨지고 데이터는 보존된다. recruiting(모객형) 복귀 시 UI가 그대로 복원된다.
// 픽스처 초기화 단위 = 이 파일 (src/test/testUtils.tsx 참조). 픽스처 기본값은 event_type='recruiting'.
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-11 행사 유형 토글', () => {
  it('(a) pm이 설정(S6)에서 일반형으로 전환하면 등록 화면에서 RSVP 모듈이 숨겨진다', async () => {
    renderRoute('/settings')
    const typeSelect = await screen.findByLabelText('행사 유형')
    await userEvent.selectOptions(typeSelect, 'general')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText(/WBS 재전개는 일정 화면에서 실행하세요/)).toBeTruthy()

    renderRoute('/registration')
    // 일반형 안내 배너가 뜨는 시점까지 기다려 event_type 로딩 완료를 보장한다
    expect(await screen.findByText(/일반형 행사 — 모객\(RSVP\) 모듈은 숨김 처리됨/)).toBeTruthy()

    expect(screen.queryByRole('button', { name: 'RSVP' })).toBeNull()
    expect(screen.getByRole('button', { name: '참관객' })).toBeTruthy()
    // RSVP 탭이 숨겨졌으므로 기본 노출은 참관객 탭(att-001의 이름도 '홍초청')
    expect(await screen.findByText('홍초청')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '참관객 전환' })).toBeNull()

    // 통계 탭에서도 RSVP 관련 타일이 숨겨진다
    await userEvent.click(screen.getByRole('button', { name: '통계' }))
    expect(await screen.findByText('등록 수')).toBeTruthy()
    expect(screen.queryByText('응답률')).toBeNull()
    expect(screen.queryByText('RSVP 총원')).toBeNull()
  })

  it('(b) listRsvpContacts 데이터는 삭제되지 않고 그대로 보존된다', async () => {
    const rsvps = await mockProvider().listRsvpContacts('prj-stc26')
    expect(rsvps).toHaveLength(5)
    expect(rsvps.map((r) => r.name)).toContain('홍초청')
  })

  it('(c) 모객형으로 복귀하면 RSVP UI가 다시 노출된다', async () => {
    await mockProvider().updateProject('prj-stc26', { event_type: 'recruiting' })

    renderRoute('/registration')
    expect(await screen.findByRole('button', { name: 'RSVP' })).toBeTruthy()
    expect(screen.queryByText(/일반형 행사/)).toBeNull()

    // 기본 탭(RSVP)이 정상 렌더된다
    expect(await screen.findByText('홍초청')).toBeTruthy()
  })
})
