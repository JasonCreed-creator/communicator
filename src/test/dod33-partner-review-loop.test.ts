// DoD-33 (v2.4 §5.1) — 검토 루프.
//
// 제출(requested→pending_approval) → 승인(final) | 수정요청(코멘트 없으면 422) →
// 재제출(pending_approval 복귀)이 전부 assertTransition 경유이고, 주최형 라벨 세트가 적용된다.
// "전부 assertTransition 경유"의 증명은 두 갈래다 — ① 정상 루프가 전이표의 상태를 정확히
// 밟는다 ② 전이표 밖 경로(전이표에 없는 (from,to,via))는 전부 409로 거부된다.
import { describe, expect, it } from 'vitest'
import { PROJECT_ID_HOST } from '../fixtures/hostFixtures'
import { HOST_STATUS_LABELS } from '../lib/labels'
import { findTransitionRule } from '../lib/statusMachine'
import { mockProvider } from './testUtils'

describe('DoD-33 주최형 라벨 세트 (§5.1 표)', () => {
  it('라벨이 §5.1 표와 1:1이다', () => {
    expect(HOST_STATUS_LABELS.requested).toBe('제출 요청됨')
    expect(HOST_STATUS_LABELS.pending_approval).toBe('검토중')
    expect(HOST_STATUS_LABELS.changes_requested).toBe('수정요청')
    expect(HOST_STATUS_LABELS.approved).toBe('승인됨')
    expect(HOST_STATUS_LABELS.final).toBe('승인됨')
  })

  it('전이표에는 §5.1의 신규 상태쌍(requested→pending_approval)이 partner_submit으로만 있다', () => {
    expect(findTransitionRule('requested', 'pending_approval', 'partner_submit')).toBeTruthy()
    expect(findTransitionRule('requested', 'pending_approval', 'version_upload')).toBeUndefined()
    expect(findTransitionRule('requested', 'pending_approval', 'status_patch')).toBeUndefined()
  })
})

describe('DoD-33 검토 루프 — 전 구간 전이표 경유', () => {
  it('제출→수정요청(코멘트 필수 422)→재제출→승인(final)까지 한 바퀴', async () => {
    const provider = mockProvider()
    // 미제출 파트너(가상실버랩스)의 토큰을 pm이 발급해 흐름 전체를 실기로 돈다
    const partners = await provider.listPartners(PROJECT_ID_HOST)
    const idle = partners.find((p) => p.submission_counts.requested > 0)!
    const token = (
      await provider.issuePartnerToken(idle.id, {
        contact_name: '검증담당',
        contact_email: 'loop@example.com',
      })
    ).token

    const portal = await provider.getPartnerPortal(token)
    const target = portal.submission_items.find((i) => i.status === 'requested')!

    // ① 첫 제출: requested → pending_approval (partner_submit)
    const submitted = await provider.submitPartnerItem(token, target.deliverable_id, {
      text: '1차 제출 내용',
    })
    expect(submitted.status).toBe('pending_approval')

    // ② 코멘트 없는 수정요청은 422(validation) — R-H4
    await expect(
      provider.reviewPartnerSubmission(target.deliverable_id, { decision: 'changes_requested' }),
    ).rejects.toMatchObject({ code: 'validation' })

    // ③ 코멘트를 담으면 수정요청 — 코멘트는 shared로 남는다(파트너가 봐야 한다)
    const rejected = await provider.reviewPartnerSubmission(target.deliverable_id, {
      decision: 'changes_requested',
      comment: '로고 해상도를 300dpi로 다시 주세요.',
    })
    expect(rejected.status).toBe('changes_requested')
    const afterReject = await provider.getPartnerPortal(token)
    const rejectedItem = afterReject.submission_items.find(
      (i) => i.deliverable_id === target.deliverable_id,
    )!
    expect(rejectedItem.comments.some((c) => c.body.includes('300dpi'))).toBe(true)

    // ④ 재제출: changes_requested → pending_approval (version_upload 목적지 분기)
    const resubmitted = await provider.submitPartnerItem(token, target.deliverable_id, {
      file_name: 'logo-300dpi.png',
    })
    expect(resubmitted.status).toBe('pending_approval')

    // ⑤ 승인: pending_approval → approved → final (§5.1 "승인 시 final 동일 규칙")
    const approved = await provider.reviewPartnerSubmission(target.deliverable_id, {
      decision: 'approved',
    })
    expect(approved.status).toBe('final')

    // 승인 후 재제출은 전이표 밖 — 409
    await expect(
      provider.submitPartnerItem(token, target.deliverable_id, { text: '추가 제출' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('전이표 밖 경로는 409다 — 내부 status_patch로 검토 상태를 우회할 수 없다', async () => {
    const provider = mockProvider()
    const items = await provider.listDeliverables(PROJECT_ID_HOST)
    const pending = items.find((d) => d.partner_id !== null && d.status === 'pending_approval')!
    // pending_approval → approved는 client_decision·partner_review 경로에만 있다
    await expect(provider.transitionStatus(pending.id, 'approved')).rejects.toMatchObject({
      code: 'conflict',
    })
    // requested inbound 항목의 내부 업로드는 §5.1이 쓰지 않는 갈래 — 409 (uploadVersion 분기)
    const requested = items.find((d) => d.partner_id !== null && d.status === 'requested')!
    await expect(
      provider.uploadVersion(requested.id, { file_name: 'internal.png' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('내부 업로드로 파트너 항목의 수정요청을 대리 반영해도 검토중으로 복귀한다(분기 정본)', async () => {
    const provider = mockProvider()
    const items = await provider.listDeliverables(PROJECT_ID_HOST)
    const cr = items.find((d) => d.partner_id !== null && d.status === 'changes_requested')!
    await provider.uploadVersion(cr.id, { file_name: 'partner-file-relay.pdf' })
    const after = await provider.getDeliverable(cr.id)
    // draft가 아니라 pending_approval — §5.1 version_upload 목적지 분기(kind='host' inbound)
    expect(after.status).toBe('pending_approval')
  })
})
