/** @vitest-environment jsdom */
// DoD 72 — 디자인 보드 '다음 행동' 표 · 차례 칩 · 갤러리 (Phase 3.23 PR-3 · 디자인지시서 v1.4 §7-2.6).
// ① 차례 판정(대행형·파트너 항목) ② 지연(끝난 항목 제외) ③ 급한 순 ④ 규격 한 줄 ⑤ 다음 행동 문구·버튼·권한
// ⑥ 화면: 칩 건수·거르기·필터 빈 상태 ⑦ 행마다 다음 행동 1개 · 올리기 = 상세 업로드 카드로 · 발주처 링크 복사/설정
// ⑧ 내부검토 요청 ⑨ 갤러리(이미지·파일 표지·빈 자리) + 보기 기억 ⑩ 머리의 채운 버튼 1개 · 권한 ⑪ 주최형 파트너 항목
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DESIGN_VIEW_STORAGE_KEY } from '../components/board/DesignBoard'
import {
  designNextAction,
  designSpecParts,
  designTurn,
  fileKindLabel,
  isDesignOverdue,
  isThumbnailFile,
  matchesDesignFilter,
  sortDesignRows,
  type DesignRow,
} from '../components/board/designBoardRows'
import { PROJECT_ID, PROJECT_ID_HOST } from '../fixtures/sampleProject'
import type { Approval, Deliverable, Version } from '../types/entities'
import type { DeliverableStatus } from '../types/enums'
import { addDays, toIsoDate } from '../lib/wbs'
import { mockProvider, renderRoute } from './testUtils'

afterEach(cleanup)

// ── 순수 판정 ─────────────────────────────────────────────────────────────
const TODAY = new Date(2026, 8, 25, 10, 0, 0)
const day = (offset: number) => toIsoDate(new Date(2026, 8, 25 + offset))

function mk(
  status: DeliverableStatus,
  opts: { due?: string | null; partner?: boolean; versionNo?: number; fileName?: string; openAt?: string; title?: string } = {},
): DesignRow {
  const deliverable = {
    id: `d-${status}-${opts.title ?? ''}`,
    project_id: 'p',
    area: 'design',
    category: '배너',
    title: opts.title ?? status,
    status,
    assignee_id: null,
    due_date: opts.due === undefined ? null : opts.due,
    drive_folder_id: null,
    requires_approval: true,
    brief: null,
    brief_refs: null,
    spec_size: null,
    spec_qty: null,
    spec_location: null,
    spec_type: null,
    content: null,
    partner_id: opts.partner ? 'ptn-x' : null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  } as Deliverable
  const latest = opts.versionNo
    ? ({ id: 'v1', deliverable_id: deliverable.id, version_no: opts.versionNo, drive_file_id: 'x', file_name: opts.fileName ?? 'a.png', note: null, uploaded_by: null, created_at: '2026-09-20T00:00:00.000Z' } as Version)
    : null
  const openApproval = opts.openAt
    ? ({ id: 'a1', deliverable_id: deliverable.id, version_id: 'v1', requested_by: null, requested_at: opts.openAt, due_at: null, decided_at: null, decision: null, client_comment: null, decided_via_token: null } as Approval)
    : null
  return { deliverable, latest, openApproval }
}

describe('DoD 72 ① 차례 판정', () => {
  it('대행형: 가이드됨·초안·내부검토·수정요청 = 우리 · 컨펌대기 = 발주처 · 승인·확정 = 끝남', () => {
    const own: Record<DeliverableStatus, string> = {
      requested: 'ours',
      draft: 'ours',
      internal_review: 'ours',
      pending_approval: 'waiting',
      changes_requested: 'ours',
      approved: 'done',
      final: 'done',
    }
    for (const [s, t] of Object.entries(own)) expect(designTurn(mk(s as DeliverableStatus).deliverable), s).toBe(t)
  })

  it('파트너 항목은 방향이 반대 — 제출·재제출 = 파트너 차례, 검토중 = 우리 차례', () => {
    expect(designTurn(mk('requested', { partner: true }).deliverable)).toBe('waiting')
    expect(designTurn(mk('changes_requested', { partner: true }).deliverable)).toBe('waiting')
    expect(designTurn(mk('pending_approval', { partner: true }).deliverable)).toBe('ours')
    expect(designTurn(mk('final', { partner: true }).deliverable)).toBe('done')
  })
})

describe('DoD 72 ② 지연 · ③ 급한 순 · ④ 규격', () => {
  it('지연 = 기한이 지났고 끝나지 않았다(오늘 마감·기한 없음·끝난 항목은 아님)', () => {
    expect(isDesignOverdue(mk('draft', { due: day(-1) }), TODAY)).toBe(true)
    expect(isDesignOverdue(mk('pending_approval', { due: day(-1) }), TODAY)).toBe(true)
    expect(isDesignOverdue(mk('final', { due: day(-1) }), TODAY)).toBe(false)
    expect(isDesignOverdue(mk('approved', { due: day(-1) }), TODAY)).toBe(false)
    expect(isDesignOverdue(mk('draft', { due: day(0) }), TODAY)).toBe(false)
    expect(isDesignOverdue(mk('draft'), TODAY)).toBe(false)
  })

  it('늦은 것(오래 늦은 순) → 우리 차례 → 상대 차례 → 끝남, 같은 급은 기한 이른 순·기한 없음은 뒤', () => {
    const rows = [
      mk('final', { due: day(-10), title: '끝남' }),
      mk('pending_approval', { due: day(3), title: '발주처' }),
      mk('draft', { due: day(5), title: '우리+5' }),
      mk('pending_approval', { due: day(-2), title: '늦음-2' }),
      mk('requested', { due: day(-5), title: '늦음-5' }),
      mk('draft', { title: '우리-기한없음' }),
    ]
    expect(sortDesignRows(rows, TODAY).map((r) => r.deliverable.title)).toEqual([
      '늦음-5',
      '늦음-2',
      '우리+5',
      '우리-기한없음',
      '발주처',
      '끝남',
    ])
  })

  it('칩 거르기 — 차례와 지연만은 함께 걸린다', () => {
    const late = mk('draft', { due: day(-1) })
    const fine = mk('draft', { due: day(1) })
    expect(matchesDesignFilter(late, 'ours', true, TODAY)).toBe(true)
    expect(matchesDesignFilter(fine, 'ours', true, TODAY)).toBe(false)
    expect(matchesDesignFilter(late, 'waiting', false, TODAY)).toBe(false)
    expect(matchesDesignFilter(fine, 'all', false, TODAY)).toBe(true)
  })

  it('규격 한 줄 — 비었으면 "규격 미입력", 수량은 "n개"', () => {
    expect(designSpecParts({ spec_size: null, spec_qty: null })).toEqual(['규격 미입력'])
    expect(designSpecParts({ spec_size: '23000×5000mm', spec_qty: 1 })).toEqual(['23000×5000mm', '1개'])
    expect(designSpecParts({ spec_size: '90×120mm', spec_qty: null })).toEqual(['90×120mm'])
  })

  it('썸네일은 이미지 파일만, 나머지는 확장자 표지', () => {
    expect(isThumbnailFile('a_v2.PNG')).toBe(true)
    expect(isThumbnailFile('a.jpeg')).toBe(true)
    expect(isThumbnailFile('a.pdf')).toBe(false)
    expect(isThumbnailFile('a.ai')).toBe(false)
    expect(fileKindLabel('a_v1.pdf')).toBe('PDF')
    expect(fileKindLabel('noext')).toBe('파일')
  })
})

describe('DoD 72 ⑤ 다음 행동 — 상세의 다음 단계와 같은 뜻, 버튼은 권한이 있을 때만', () => {
  const writer = { canWrite: true, isPm: false, isHost: false, now: TODAY }
  const pm = { canWrite: true, isPm: true, isHost: false, now: TODAY }
  const reader = { canWrite: false, isPm: false, isHost: false, now: TODAY }

  it('가이드됨·빈 초안·수정요청 = 올리기(쓰기 권한 있을 때만)', () => {
    expect(designNextAction(mk('requested'), writer)).toEqual({ text: '첫 시안 올리기', muted: false, action: { kind: 'upload', label: '올리기' } })
    expect(designNextAction(mk('requested'), reader).action).toBeNull()
    expect(designNextAction(mk('draft'), writer)).toMatchObject({ text: '시안 올리고 내부검토 요청', action: { kind: 'upload' } })
    expect(designNextAction(mk('changes_requested'), writer)).toMatchObject({ text: '수정 요청 반영 — 새 버전 올리기', action: { kind: 'upload' } })
  })

  it('버전 있는 초안 = 내부검토 요청(읽기 권한만이면 담당자 작업)', () => {
    expect(designNextAction(mk('draft', { versionNo: 2 }), writer)).toEqual({
      text: 'v2 올림 — PM에게 넘기기',
      muted: false,
      action: { kind: 'review_request', label: '내부검토 요청' },
    })
    expect(designNextAction(mk('draft', { versionNo: 2 }), reader)).toMatchObject({ text: '담당자가 다듬는 중', action: null })
  })

  it('내부검토 = PM만 검토하기(대행형 발주처로 · 주최형 내부 확정), 나머지는 기다림', () => {
    expect(designNextAction(mk('internal_review'), writer)).toMatchObject({ text: 'PM 검토 기다림', muted: true, action: null })
    expect(designNextAction(mk('internal_review'), pm)).toMatchObject({ text: '검토 후 발주처로 보내기', action: { kind: 'open' } })
    expect(designNextAction(mk('internal_review'), { ...pm, isHost: true }).text).toBe('검토 후 내부에서 확정')
  })

  it('컨펌대기 = 보낸 지 n일(오늘이면 오늘 보냄) · 발주처 링크는 대행형 PM에게만', () => {
    const waiting = mk('pending_approval', { versionNo: 1, openAt: '2026-09-22T01:00:00.000Z' })
    expect(designNextAction(waiting, pm)).toEqual({
      text: '발주처 답 기다림 · 보낸 지 3일',
      muted: false,
      action: { kind: 'client_link', label: '발주처 링크' },
    })
    expect(designNextAction(waiting, writer).action).toBeNull()
    expect(designNextAction(waiting, { ...pm, isHost: true }).action).toBeNull()
    const today = mk('pending_approval', { openAt: '2026-09-25T09:00:00.000Z' })
    expect(designNextAction(today, pm).text).toBe('발주처 답 기다림 · 오늘 보냄')
  })

  it('파트너 항목 — 검토중은 파트너 보드에서 검토, 제출·재제출은 기다림', () => {
    expect(designNextAction(mk('pending_approval', { partner: true }), writer)).toMatchObject({
      text: '파트너 제출물 검토',
      action: { kind: 'partner_review', label: '검토하기' },
    })
    expect(designNextAction(mk('requested', { partner: true }), writer)).toMatchObject({ text: '파트너 제출 기다림', action: null })
    expect(designNextAction(mk('changes_requested', { partner: true }), writer)).toMatchObject({ text: '파트너 재제출 기다림', action: null })
  })

  it('승인 = 정리 중(버튼 없음) · 확정 = 최종본 받기(버전이 있을 때만)', () => {
    expect(designNextAction(mk('approved'), pm)).toMatchObject({ muted: true, action: null })
    expect(designNextAction(mk('final', { versionNo: 1 }), reader)).toEqual({
      text: '끝 — 최종본 확정됨',
      muted: true,
      action: { kind: 'download', label: '최종본 받기' },
    })
    expect(designNextAction(mk('final'), reader).action).toBeNull()
  })
})

// ── 화면 ────────────────────────────────────────────────────────────────
// 기한을 오늘 기준으로 옮겨 결정적으로 만든다: 무대 백월 배너(초안·버전 없음) 3일 지남 · 메인 키비주얼(컨펌대기) 1일 지남 ·
// 메인 게이트 현수막(가이드됨) 5일 남음 · 참가자 명찰(확정) 20일 전. 발주처 링크는 살아 있는 것 하나만 남긴다.
const today = toIsoDate(new Date())
let singleToken = ''

beforeAll(async () => {
  const p = mockProvider()
  p.switchUser('usr-pm')
  await p.updateDeliverable('dlv-003', { due_date: addDays(today, -3) })
  await p.updateDeliverable('dlv-001', { due_date: addDays(today, -1) })
  await p.updateDeliverable('dlv-007', { due_date: addDays(today, 5) })
  await p.updateDeliverable('dlv-002', { due_date: addDays(today, -20) })
  for (const t of await p.listClientTokens(PROJECT_ID)) if (!t.revoked_at) await p.revokeClientToken(t.token)
  const issued = await p.issueClientToken({ project_id: PROJECT_ID, contact_id: 'cct-001', expires_at: '2099-01-01T00:00:00.000Z' })
  singleToken = issued.token
})

afterAll(() => {
  try {
    localStorage.removeItem(DESIGN_VIEW_STORAGE_KEY)
  } catch {
    // 무시
  }
})

const titles = () => screen.getAllByTestId('design-row').map((r) => within(r).getAllByRole('link')[0].textContent)
const rowOf = (title: string) => screen.getByText(title).closest('tr')!

async function openBoard(projectId: string = PROJECT_ID) {
  localStorage.setItem('communicator.currentProjectId', projectId)
  renderRoute('/board/design')
  await screen.findAllByTestId('design-row')
}

describe('DoD 72 ⑥ 칩 — 건수·거르기·필터 빈 상태', () => {
  it('급한 순으로 서고, 전체 = 우리 + 발주처 + 끝남, 지연만 = 기한 지난 미완료', async () => {
    await openBoard()
    expect(titles()).toEqual(['무대 백월 배너', '메인 키비주얼', '메인 게이트 현수막', '참가자 명찰'])
    const chip = (name: RegExp) => screen.getByRole('button', { name })
    expect(chip(/^전체 4$/)).toBeTruthy()
    expect(chip(/^우리 차례 2$/)).toBeTruthy()
    expect(chip(/^발주처 차례 1$/)).toBeTruthy()
    expect(chip(/^끝남 1$/)).toBeTruthy()
    expect(chip(/지연만 2$/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^파트너 차례/ })).toBeNull()
  })

  it('우리 차례 → 우리 행만, 지연만을 더하면 늦은 우리 행만, 둘 다 풀면 전부', async () => {
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: /^우리 차례/ }))
    expect(screen.getAllByTestId('design-row').every((r) => r.getAttribute('data-turn') === 'ours')).toBe(true)
    expect(titles()).toEqual(['무대 백월 배너', '메인 게이트 현수막'])
    await userEvent.click(screen.getByRole('button', { name: /지연만/ }))
    expect(titles()).toEqual(['무대 백월 배너'])
    expect(within(rowOf('무대 백월 배너')).getByText('3일 지남').className).toContain('text-negative')
    await userEvent.click(screen.getByRole('button', { name: /^전체/ }))
    expect(titles()).toEqual(['무대 백월 배너', '메인 키비주얼'])
    await userEvent.click(screen.getByRole('button', { name: /지연만/ }))
    expect(titles()).toHaveLength(4)
  })

  it('걸러서 0건이면 필터 빈 상태 — 전체 건수·적용 필터·초기화', async () => {
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: /^끝남/ }))
    await userEvent.type(screen.getByLabelText('제목 검색'), '키비주얼')
    expect(screen.getByText(/조건에 맞는 항목이 없습니다\. 전체 4건 중 0건\./)).toBeTruthy()
    expect(screen.getByText('끝남', { selector: 'li' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '필터 초기화' }))
    expect(await screen.findAllByTestId('design-row')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /^전체/ }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('DoD 72 ⑦ 다음 행동 칸', () => {
  it('행마다 다음 행동 1줄 + 버튼·링크는 최대 1개, 끝난 항목은 "완료"(지남 없음)', async () => {
    await openBoard()
    for (const row of screen.getAllByTestId('design-row')) {
      const cell = within(row).getByTestId('design-next-action')
      expect(cell.querySelectorAll('a, button').length).toBeLessThanOrEqual(1)
    }
    const done = rowOf('참가자 명찰')
    expect(within(done).getByText('끝 — 최종본 확정됨')).toBeTruthy()
    expect(within(done).getByText('완료')).toBeTruthy()
    expect(within(done).queryByText(/일 지남/)).toBeNull()
    const download = await within(done).findByRole('link', { name: '최종본 받기' })
    expect(download.hasAttribute('download')).toBe(true)
  })

  it('올리기는 항목 상세의 업로드 카드로 간다 — 도착하면 파일 입력에 초점', async () => {
    await openBoard()
    const upload = within(rowOf('무대 백월 배너')).getByRole('link', { name: '올리기' })
    expect(upload.getAttribute('href')).toBe('/items/dlv-003?upload=1')
    expect(within(rowOf('무대 백월 배너')).getByText('시안 올리고 내부검토 요청')).toBeTruthy()
    await userEvent.click(upload)
    await screen.findByRole('heading', { level: 1, name: '무대 백월 배너' })
    await waitFor(() => expect(document.activeElement?.id).toBe('version-upload-file'))
  })

  it('컨펌대기 행 — 보낸 지 n일, 살아 있는 발주처 링크가 하나면 그 자리에서 복사', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await openBoard()
    const row = rowOf('메인 키비주얼')
    expect(within(row).getByText(/^발주처 답 기다림 · 보낸 지 \d+일$/)).toBeTruthy()
    const copy = await within(row).findByRole('button', { name: '링크 복사' })
    await userEvent.click(copy)
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`/c/${singleToken}$`)))
    expect(await within(row).findByRole('button', { name: '복사됨' })).toBeTruthy()
  })

  it('링크가 여럿이면 추측으로 고르지 않고 행사 설정 ② 담당자로 보낸다', async () => {
    await mockProvider().issueClientToken({ project_id: PROJECT_ID, contact_id: 'cct-001', expires_at: '2099-01-01T00:00:00.000Z' })
    await openBoard()
    const link = await within(rowOf('메인 키비주얼')).findByRole('link', { name: '발주처 링크' })
    expect(link.getAttribute('href')).toBe('/settings?tab=members')
  })

  it('디자인 담당에게는 발주처 링크 버튼이 없고(PM 몫), 올리기는 있다', async () => {
    mockProvider().switchUser('usr-design')
    await openBoard()
    // 올리기가 보이면 현재 사용자까지 읽힌 것이다 — 그 뒤에 '없음'을 본다
    expect(await within(rowOf('무대 백월 배너')).findByRole('link', { name: '올리기' })).toBeTruthy()
    expect(within(rowOf('메인 키비주얼')).queryByRole('button', { name: '링크 복사' })).toBeNull()
    expect(within(rowOf('메인 키비주얼')).queryByRole('link', { name: '발주처 링크' })).toBeNull()
    mockProvider().switchUser('usr-pm')
  })
})

describe('DoD 72 ⑩ 머리 — 채운 버튼 1개 · 권한', () => {
  it('PM: 채운 버튼은 머리의 "＋ 항목 추가" 하나 — 누르면 폼이 열리고 머리 버튼은 물러난다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    const { container } = renderRoute('/board/design')
    await screen.findAllByTestId('design-row')
    await screen.findByRole('button', { name: '＋ 항목 추가' })
    const filled = container.querySelectorAll('.btn-accent, .btn-primary')
    expect(filled).toHaveLength(1)
    expect(filled[0].textContent).toBe('＋ 항목 추가')
    await userEvent.click(filled[0] as HTMLElement)
    expect(await screen.findByRole('heading', { name: '항목 추가' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '＋ 항목 추가' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '접기' }))
    expect(screen.getByRole('button', { name: '＋ 항목 추가' })).toBeTruthy()
  })

  it('등록 담당(쓰기 권한 없음): 항목 추가·올리기가 없고 열람 안내가 뜬다', async () => {
    mockProvider().switchUser('usr-reg')
    await openBoard()
    expect(await screen.findByText('이 영역에는 쓰기 권한이 없습니다(열람만 가능).')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '＋ 항목 추가' })).toBeNull()
    expect(screen.queryByRole('link', { name: '올리기' })).toBeNull()
    mockProvider().switchUser('usr-pm')
  })
})

describe('DoD 72 ⑨ 갤러리 — 최신 시안 썸네일 · 보기 기억', () => {
  it('목록 ↔ 갤러리 전환, 이미지는 썸네일 · PDF는 표지 · 버전 없으면 점선 자리(올릴 수 있으면 업로드 카드로)', async () => {
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: '갤러리' }))
    const cards = await screen.findAllByTestId('design-card')
    expect(cards).toHaveLength(4)
    expect(screen.queryByTestId('design-board-table')).toBeNull()

    const cardOf = (title: string) => cards.find((c) => c.textContent!.includes(title))!
    const img = await within(cardOf('메인 키비주얼')).findByTestId('design-thumb-image')
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(within(cardOf('메인 키비주얼')).getByRole('link', { name: '메인 키비주얼 v2 크게 보기' })).toBeTruthy()
    expect(within(cardOf('참가자 명찰')).getByTestId('design-thumb-file').textContent).toContain('PDF')
    const empty = within(cardOf('메인 게이트 현수막')).getByTestId('design-thumb-empty')
    const emptyLink = within(empty).getByRole('link')
    expect(emptyLink.textContent).toContain('아직 시안 없음 — 첫 시안 올리기')
    expect(emptyLink.getAttribute('href')).toBe('/items/dlv-007?upload=1')
    expect(empty.textContent).toContain('23000×5000mm')
    // 카드 아래 줄 = 다음 행동(표와 같은 판정)
    expect(within(cardOf('메인 게이트 현수막')).getByText('첫 시안 올리기')).toBeTruthy()
    expect(localStorage.getItem(DESIGN_VIEW_STORAGE_KEY)).toBe('gallery')
  })

  it('다시 열면 고른 보기가 그대로다', async () => {
    localStorage.setItem('communicator.currentProjectId', PROJECT_ID)
    renderRoute('/board/design')
    expect(await screen.findAllByTestId('design-card')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '갤러리' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: '목록' }))
    expect(await screen.findByTestId('design-board-table')).toBeTruthy()
  })
})

describe('DoD 72 ⑧ 내부검토 요청 — 버전이 생긴 초안', () => {
  it('버전을 올린 초안 행은 "내부검토 요청" 한 번으로 내부검토가 되고 PM 몫(검토하기)으로 바뀐다', async () => {
    await mockProvider().uploadVersion('dlv-003', { file_name: '백월_v1.png' })
    await openBoard()
    const row = rowOf('무대 백월 배너')
    expect(within(row).getByText('v1 올림 — PM에게 넘기기')).toBeTruthy()
    await userEvent.click(within(row).getByRole('button', { name: '내부검토 요청' }))
    await waitFor(() => expect(within(rowOf('무대 백월 배너')).getByText('내부검토')).toBeTruthy())
    expect(within(rowOf('무대 백월 배너')).getByRole('link', { name: '검토하기' }).getAttribute('href')).toBe('/items/dlv-003')
    expect((await mockProvider().getDeliverable('dlv-003')).status).toBe('internal_review')
  })
})

describe('DoD 72 ⑪ 주최형 — 파트너 항목', () => {
  it('상대 차례 칩은 "파트너 차례", 파트너 항목은 주최형 라벨·기다림 문구', async () => {
    await openBoard(PROJECT_ID_HOST)
    expect(screen.getByRole('button', { name: /^파트너 차례 \d+$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^발주처 차례/ })).toBeNull()
    const partnerRows = screen.getAllByTestId('design-row').filter((r) => within(r).queryByText('제출 요청됨'))
    expect(partnerRows.length).toBeGreaterThan(0)
    for (const r of partnerRows) {
      expect(r.getAttribute('data-turn')).toBe('waiting')
      expect(within(r).getByText('파트너 제출 기다림')).toBeTruthy()
    }
  })
})
