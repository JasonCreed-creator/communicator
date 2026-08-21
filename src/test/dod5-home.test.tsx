/** @vitest-environment jsdom */
// DoD-5: 홈 대시보드 — 미결 컨펌·D-day·인박스·영역 진행률·최근 활동 렌더.
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-5 홈 대시보드', () => {
  it('미결 컨펌·인박스·마일스톤·진행률·활동이 픽스처로 렌더된다', async () => {
    renderRoute('/')

    // 미결 컨펌 (apr-001 → dlv-001)
    expect(await screen.findByText('메인 키비주얼')).toBeTruthy()
    // 미등록 인박스 2건
    expect(screen.getByText(/리플렛 시안 수정본\.pdf/)).toBeTruthy()
    expect(screen.getByText(/조명 견적 메모\.xlsx/)).toBeTruthy()
    // 다가오는 마일스톤 (미완료 최상단: 키비주얼 확정)
    expect(screen.getByText('키비주얼 확정')).toBeTruthy()
    // D-day 라벨(행사 or 기한)이 최소 1개 존재
    expect(screen.getAllByText(/D[-+]|D-day/).length).toBeGreaterThan(0)
    // 영역별 진행률 축 라벨
    expect(screen.getAllByText('디자인').length).toBeGreaterThan(0)
    expect(screen.getAllByText('운영').length).toBeGreaterThan(0)
  })
})
