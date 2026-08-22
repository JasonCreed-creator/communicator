/** @vitest-environment jsdom */
// DoD-15: WBS 산출물 연결 뱃지 — 2.8 태스크에 dlv-007 상태 뱃지가 뜨고, dlv-007이 final까지
// 진행되면 provider 자동 done 처리(이미 구현)가 S5 재렌더에도 반영되는지 확인 (CLAUDE.md v1.4 §4 3.7c).
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_TOKEN } from '../fixtures/sampleProject'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

describe('DoD-15 WBS 산출물 연결 뱃지·자동 완료', () => {
  it('2.8 태스크에 연결된 dlv-007의 상태 뱃지(가이드됨)가 렌더된다', async () => {
    renderRoute('/schedule')
    await screen.findByText('2.8')

    const row = screen.getByText('2.8').closest('tr')!
    expect(within(row).getByText('가이드됨')).toBeTruthy()
    expect(within(row).getByText('메인 게이트 현수막')).toBeTruthy()
  })

  it('dlv-007을 final까지 진행하면 2.8이 done으로 표시된다', async () => {
    const p = mockProvider()
    p.switchUser('usr-design')
    await p.uploadVersion('dlv-007', { file_name: '현수막_시안.png' }) // requested → draft
    await p.transitionStatus('dlv-007', 'internal_review')

    p.switchUser('usr-pm')
    const detail = await p.getDeliverable('dlv-007')
    const latest = detail.versions[0]
    const approval = await p.requestApproval('dlv-007', { version_id: latest.id })
    await p.submitClientDecision(DEMO_TOKEN, { approval_id: approval.id, decision: 'approved' })

    // provider 측 자동 done 확인 (정본 동작)
    const task28 = (await p.listWbsTasks('prj-stc26')).find((t) => t.code === '2.8')!
    expect(task28.status).toBe('done')

    renderRoute('/schedule')
    await screen.findByText('2.8')

    const row = screen.getByText('2.8').closest('tr')!
    expect(within(row).getByText('완료')).toBeTruthy() // WBS_STATUS_LABELS.done
    expect(within(row).getByText('확정')).toBeTruthy() // STATUS_LABELS.final on linked badge
    // 완료 태스크는 취소선 스타일
    const titleSpan = within(row).getByText('제작물 (배너·렌탈장비·기념품·현수막)')
    expect(titleSpan.className).toContain('line-through')
  })
})
