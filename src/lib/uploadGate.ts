// 새 버전(파일·Drive 링크)을 올릴 수 있는가 + 올린 파일이 어디에 있는가 — Phase 4.3.1(2026-09-25 실사용 결함).
//   · 컨펌대기 항목에서 파일을 고르고 누른 뒤에야 'pending_approval'이라는 영문 코드로 실패했다 →
//     업로드 카드·헤더 버튼·provider 가드가 같은 목록(UPLOADABLE_STATUSES)과 같은 한글 문구를 쓴다.
//   · Drive 미연결 때 올린 파일이 어디에도 저장되지 않는데 화면에서 구분되지 않았다 → 버전마다 저장 위치 표시.
// 전이표(statusMachine)는 건드리지 않는다 — 업로드가 되는 상태 목록을 한 곳에 모았을 뿐이다.
import type { ProviderKind } from '../providers/kind'
import type { DeliverableStatus } from '../types/enums'
import { HOST_STATUS_LABELS, STATUS_LABELS, type StatusLevel } from './labels'

/** 새 버전을 받는 상태 — requested는 첫 업로드로 draft, changes_requested는 수정본으로 draft(§5) */
export const UPLOADABLE_STATUSES: readonly DeliverableStatus[] = [
  'requested',
  'draft',
  'internal_review',
  'changes_requested',
]

export interface UploadLock {
  /** 화면에 보이는 상태 이름(주최형 파트너 항목은 주최형 라벨 — §5.1) */
  label: string
  /** 왜 막혔고 다음에 무엇을 하면 되는지 — 한 문장 */
  reason: string
}

/** 업로드가 막혔으면 상태 이름·이유, 열려 있으면 null */
export function uploadLock(status: DeliverableStatus, opts: { hasPartner?: boolean } = {}): UploadLock | null {
  const hasPartner = opts.hasPartner === true
  const label = (hasPartner ? HOST_STATUS_LABELS : STATUS_LABELS)[status]
  // v2.4 §5.1 — 파트너 inbound 항목의 첫 버전은 파트너가 /p 제출 링크로만 올린다(provider 가드와 같은 판정)
  if (hasPartner && status === 'requested') {
    return { label, reason: '파트너 제출 항목입니다 — 첫 버전은 파트너가 제출 링크로 올립니다.' }
  }
  if (UPLOADABLE_STATUSES.includes(status)) return null
  if (status === 'pending_approval') {
    return {
      label,
      reason: hasPartner
        ? '파트너 제출물을 검토하는 중입니다 — 수정요청을 보내면 파트너가 다시 제출합니다.'
        : '발주처가 이 안을 보고 있습니다 — 발주처가 수정요청을 보내면 다시 올릴 수 있습니다.',
    }
  }
  if (status === 'approved') {
    return { label, reason: '승인되어 확정본으로 전환하는 중입니다 — 새 버전은 올리지 않습니다.' }
  }
  return { label, reason: '확정된 항목입니다 — 바꿔야 하면 새 항목을 만들어 진행하세요.' }
}

/** provider 가드 오류 문구 — 영문 상태 코드 대신 상태 이름 + 다음 할 일 */
export function uploadBlockedMessage(status: DeliverableStatus, opts: { hasPartner?: boolean } = {}): string {
  const lock = uploadLock(status, opts)
  return lock ? `'${lock.label}' 상태에서는 새 버전을 올릴 수 없습니다 — ${lock.reason}` : ''
}

/** Drive 미연결 때 서버가 버전 행에 남기는 자리표시 id의 접두어(SQL upload_version·스냅숏 버전) */
export const PENDING_FILE_PREFIX = 'pending:'

export interface VersionStorage {
  label: string
  level: StatusLevel
  /** 마우스를 올렸을 때 보이는 설명 */
  title: string
}

/**
 * 버전 1건이 실제로 어디에 있는가(④) — 실서버에서만 표시한다. mock은 전부 이 브라우저의 데모라
 * 버전마다 같은 표식을 붙이면 소음이다(업로드 카드가 이미 데모라고 적는다) → null.
 */
export function versionStorage(driveFileId: string, kind: ProviderKind): VersionStorage | null {
  if (kind !== 'supabase') return null
  if (driveFileId.startsWith(PENDING_FILE_PREFIX)) {
    return {
      label: '임시 · 저장 안 됨',
      level: 'attention',
      title: 'Drive가 연결되지 않았을 때 올린 버전입니다 — 파일은 올린 브라우저 탭에만 있어 새로고침하면 사라집니다. 기록만 남습니다.',
    }
  }
  return { label: 'Drive', level: 'neutral', title: '파일이 Drive 저장소(행사 폴더)에 있습니다.' }
}
