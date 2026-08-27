import { describe, expect, it } from 'vitest'
import { ProviderError } from './errors'
import {
  assertTransition,
  buildVersionFileName,
  findTransitionRule,
  isPreviewFileName,
  TRANSITION_RULES,
} from './statusMachine'

describe('statusMachine — 설계서 §5·§5.1 전이표', () => {
  it('전이표는 12개 규칙과 1:1이다 (v1.2: requested→draft / v2.4 §5.1: 주최형 inbound 4건 추가)', () => {
    expect(TRANSITION_RULES).toHaveLength(12)
  })

  it('표 안의 전이는 통과한다', () => {
    expect(assertTransition('requested', 'draft', 'version_upload').from).toBe('requested')
    expect(assertTransition('draft', 'internal_review', 'status_patch').from).toBe('draft')
    expect(assertTransition('changes_requested', 'draft', 'version_upload').via).toBe('version_upload')
    expect(assertTransition('approved', 'final', 'system').to).toBe('final')
  })

  it('v2.4 §5.1 — 주최형 inbound 신규 전이 4건', () => {
    // 신규 상태쌍은 이 한 줄뿐(파트너 첫 제출)
    expect(assertTransition('requested', 'pending_approval', 'partner_submit').via).toBe('partner_submit')
    // 재제출 — 기존 version_upload 전이의 목적지 분기(host_inbound 표시). 기존
    // changes_requested→draft(version_upload) 규칙과 공존하며 서로 다른 to로 구분된다.
    const reinbound = findTransitionRule('changes_requested', 'pending_approval', 'version_upload')
    expect(reinbound?.host_inbound).toBe(true)
    expect(findTransitionRule('changes_requested', 'draft', 'version_upload')?.host_inbound).toBeUndefined()
    // 내부 검토(신규 상태쌍이 아니라 기존 pending_approval의 두 목적지를 새 경로로 표기)
    expect(assertTransition('pending_approval', 'approved', 'partner_review').via).toBe('partner_review')
    expect(assertTransition('pending_approval', 'changes_requested', 'partner_review').requires_comment).toBe(true)
  })

  it('표 밖의 전이는 409 conflict', () => {
    const cases: Array<[string, string, string]> = [
      ['requested', 'draft', 'status_patch'], // 가이드 해제는 수동 전이 불가 — 업로드·인박스 연결 경로만
      ['requested', 'internal_review', 'status_patch'], // 산출물 없이 리뷰 진입 금지
      ['draft', 'pending_approval', 'status_patch'], // 내부 리뷰 건너뛰기 금지
      ['draft', 'final', 'status_patch'],
      ['internal_review', 'pending_approval', 'status_patch'], // 발송은 approval_request 경로만
      ['pending_approval', 'approved', 'status_patch'], // 승인은 발주처 토큰 경로만
      ['final', 'draft', 'status_patch'], // final은 종단 상태
    ]
    for (const [from, to, via] of cases) {
      try {
        // eslint 없음 — 타입은 테스트 편의상 우회
        assertTransition(from as never, to as never, via as never)
        expect.unreachable(`통과되면 안 되는 전이: ${from}→${to}(${via})`)
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect((e as ProviderError).status).toBe(409)
      }
    }
  })
})

describe('컨펌 발송 조건 — 미리보기 포맷(§5)', () => {
  it('PDF·PNG·JPG만 허용', () => {
    expect(isPreviewFileName('a_v2.pdf')).toBe(true)
    expect(isPreviewFileName('a_v2.PNG')).toBe(true)
    expect(isPreviewFileName('a_v2.jpeg')).toBe(true)
    expect(isPreviewFileName('a_v2.ai')).toBe(false)
    expect(isPreviewFileName('a_v2.psd')).toBe(false)
    expect(isPreviewFileName('확장자없음')).toBe(false)
  })
})

describe('파일명 규약 — §7.2', () => {
  it('YYMMDD_{code}_{category}_{title}_v{n}.{ext}', () => {
    const name = buildVersionFileName({
      date: new Date(2026, 7, 19), // 2026-08-19 (로컬)
      project_code: 'STC26',
      category: '키비주얼',
      title: '메인 키비주얼',
      version_no: 3,
      original_file_name: '작업본 final(진짜).png',
    })
    expect(name).toBe('260819_STC26_키비주얼_메인 키비주얼_v3.png')
  })
})
