// 디자인 보드 행 계산 — 디자인지시서 v1.4 §7-2.6 (Phase 3.23 PR-3 · 캔버스 "커뮤니케이터 UX 개편" 디자인 보드).
// 한 행 = 항목 1건 + 최신 버전 + 아직 답이 없는 컨펌. 표·갤러리는 이 결과를 그리기만 한다 — 차례·지연·다음 행동의
// 판정은 여기 한 곳이다. provider·상태 머신은 건드리지 않는다(전이는 기존 경로 그대로 — 여기서는 "무엇을 할 차례인가"만 읽는다).
// 다음 행동 문구는 항목 상세의 '다음 단계'(ItemDetailPage NextStepBlock)와 같은 뜻을 쓴다.
import { daysUntil, waitingDays } from '../../lib/labels'
import type { Approval, Deliverable, Version } from '../../types/entities'
import type { DeliverableDetail } from '../../types/views'

/** 누구 차례인가 — 우리(내부) · 상대(대행형 = 발주처, 주최형 파트너 항목 = 파트너) · 끝남 */
export type DesignTurn = 'ours' | 'waiting' | 'done'
export type DesignTurnFilter = 'all' | DesignTurn

export interface DesignRow {
  deliverable: Deliverable
  /** 최신 버전 — 없으면 null */
  latest: Version | null
  /** 아직 답이 없는 컨펌 요청(발주처에 가 있는 것) — '보낸 지 n일'의 기준 */
  openApproval: Approval | null
}

export function toDesignRow(detail: DeliverableDetail): DesignRow {
  const { versions, approvals, comments: _comments, ...deliverable } = detail
  let openApproval: Approval | null = null
  for (const a of approvals) if (a.decided_at === null) openApproval = a
  return { deliverable, latest: versions[0] ?? null, openApproval }
}

/**
 * 차례 판정. 파트너 항목(주최형 inbound)은 방향이 반대다 — 제출·재제출은 파트너 차례, 검토중은 우리 차례.
 * 승인(approved)은 확정본으로 전환 중이라 사람이 할 일이 없다 → 끝남.
 */
export function designTurn(d: Pick<Deliverable, 'status' | 'partner_id'>): DesignTurn {
  const partner = d.partner_id !== null
  switch (d.status) {
    case 'final':
    case 'approved':
      return 'done'
    case 'pending_approval':
      return partner ? 'ours' : 'waiting'
    case 'requested':
    case 'changes_requested':
      return partner ? 'waiting' : 'ours'
    default:
      return 'ours'
  }
}

/** 기한이 지났고 아직 끝나지 않았다 — 끝난 항목에는 지연을 붙이지 않는다(§7-2.2) */
export function isDesignOverdue(row: DesignRow, today: Date = new Date()): boolean {
  const due = row.deliverable.due_date
  return !!due && designTurn(row.deliverable) !== 'done' && daysUntil(due, today) < 0
}

/**
 * 급한 순 — 늦은 것(가장 오래 늦은 것부터) → 우리 차례 → 상대 차례 → 끝남. 같은 급은 기한 이른 순(없으면 뒤), 제목 순.
 * 캔버스 캡션 "급한 순 — 늦은 것, 우리 차례가 위로".
 */
export function sortDesignRows(rows: readonly DesignRow[], today: Date = new Date()): DesignRow[] {
  const rank = (r: DesignRow) => {
    if (isDesignOverdue(r, today)) return 0
    const turn = designTurn(r.deliverable)
    return turn === 'ours' ? 1 : turn === 'waiting' ? 2 : 3
  }
  return [...rows].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    const da = a.deliverable.due_date ?? '9999-12-31'
    const db = b.deliverable.due_date ?? '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    return a.deliverable.title.localeCompare(b.deliverable.title, 'ko')
  })
}

export function matchesDesignFilter(
  row: DesignRow,
  turn: DesignTurnFilter,
  lateOnly: boolean,
  today: Date = new Date(),
): boolean {
  if (turn !== 'all' && designTurn(row.deliverable) !== turn) return false
  if (lateOnly && !isDesignOverdue(row, today)) return false
  return true
}

/**
 * 제목 아래 한 줄의 규격 조각 — `규격 · 수량개`, 규격이 비었으면 `규격 미입력`(제작물 리스트가 규격을 모은다 — 빈 칸을 드러낸다).
 * 카테고리는 호출부가 앞에 붙인다(표시 이름 `categoryGroupLabel`).
 */
export function designSpecParts(d: Pick<Deliverable, 'spec_size' | 'spec_qty'>): string[] {
  if (!d.spec_size) return ['규격 미입력']
  return d.spec_qty ? [d.spec_size, `${d.spec_qty}개`] : [d.spec_size]
}

/**
 * 다음 행동의 버튼 종류.
 *  upload — 항목 상세의 업로드 카드로(`?upload=1` — 잠금 안내·Drive 경고·진행률이 있는 한 곳에서만 올린다)
 *  review_request — 내부검토 요청(기존 전이 draft→internal_review)
 *  open — 항목 상세 열기(PM 검토·컨펌 발송은 미리보기 검사가 있는 상세에서)
 *  partner_review — 파트너 보드에서 검토
 *  client_link — 발주처 링크(재전달용 — 이메일은 아직 가지 않는다 §9 Phase 6b)
 *  download — 최종본 받기
 */
export type DesignActionKind = 'upload' | 'review_request' | 'open' | 'partner_review' | 'client_link' | 'download'

export interface DesignNextAction {
  text: string
  /** 할 일이 없는 행(끝남·상대 차례)은 옅게 */
  muted: boolean
  action: { kind: DesignActionKind; label: string } | null
}

export interface DesignActionContext {
  /** 이 영역에 쓸 수 있는가(pm·design, 종료 행사 아님) */
  canWrite: boolean
  isPm: boolean
  /** 주최형 행사 — 발주처 컨펌 없이 내부에서 확정한다 */
  isHost: boolean
  now?: Date
}

export function designNextAction(row: DesignRow, ctx: DesignActionContext): DesignNextAction {
  const { deliverable: d, latest, openApproval } = row
  const partner = d.partner_id !== null
  const act = (kind: DesignActionKind, label: string) => ({ kind, label })
  switch (d.status) {
    case 'requested':
      return partner
        ? { text: '파트너 제출 기다림', muted: true, action: null }
        : { text: '첫 시안 올리기', muted: false, action: ctx.canWrite ? act('upload', '올리기') : null }
    case 'draft':
      if (!latest) {
        return { text: '시안 올리고 내부검토 요청', muted: false, action: ctx.canWrite ? act('upload', '올리기') : null }
      }
      return ctx.canWrite
        ? { text: `v${latest.version_no} 올림 — PM에게 넘기기`, muted: false, action: act('review_request', '내부검토 요청') }
        : { text: '담당자가 다듬는 중', muted: false, action: null }
    case 'internal_review':
      if (!ctx.isPm) return { text: 'PM 검토 기다림', muted: true, action: null }
      return {
        text: ctx.isHost || partner ? '검토 후 내부에서 확정' : '검토 후 발주처로 보내기',
        muted: false,
        action: act('open', '검토하기'),
      }
    case 'pending_approval': {
      if (partner) {
        return { text: '파트너 제출물 검토', muted: false, action: ctx.canWrite ? act('partner_review', '검토하기') : null }
      }
      const days = openApproval ? waitingDays(openApproval.requested_at, ctx.now) : null
      const since = days === null ? '' : days === 0 ? ' · 오늘 보냄' : ` · 보낸 지 ${days}일`
      return {
        text: `발주처 답 기다림${since}`,
        muted: false,
        action: ctx.isPm && !ctx.isHost ? act('client_link', '발주처 링크') : null,
      }
    }
    case 'changes_requested':
      return partner
        ? { text: '파트너 재제출 기다림', muted: true, action: null }
        : { text: '수정 요청 반영 — 새 버전 올리기', muted: false, action: ctx.canWrite ? act('upload', '올리기') : null }
    case 'approved':
      return { text: '승인됨 — 최종본으로 정리 중', muted: true, action: null }
    case 'final':
      return { text: '끝 — 최종본 확정됨', muted: true, action: latest ? act('download', '최종본 받기') : null }
  }
}

/** 갤러리 썸네일로 그릴 수 있는 파일(이미지) — PDF·기타는 파일 표지로 */
const THUMB_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

export function isThumbnailFile(fileName: string): boolean {
  const i = fileName.lastIndexOf('.')
  return i >= 0 && THUMB_EXTENSIONS.includes(fileName.slice(i + 1).toLowerCase())
}

/** 파일 표지에 쓰는 확장자 표기(대문자, 없으면 '파일') */
export function fileKindLabel(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i >= 0 && i < fileName.length - 1 ? fileName.slice(i + 1).toUpperCase() : '파일'
}
