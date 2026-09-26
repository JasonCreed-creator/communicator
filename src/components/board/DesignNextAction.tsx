// 디자인 보드 '다음 행동' — 문구 1줄 + 버튼 1개(ghost-sm). 표의 마지막 칸과 갤러리 카드 아래 줄이 같이 쓴다(§7-2.6).
// 상태 전이는 기존 경로만 탄다(내부검토 요청 = transitionStatus). 업로드·컨펌 발송은 검사·경고가 있는 항목 상세로 보낸다.
import { useMemo, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { activeClientLinks } from '../internal/ClientLinkWarning'
import RequestAckNote from '../item/RequestAckNote'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { appUrl } from '../../lib/basePath'
import { getDataProvider } from '../../providers'
import type { DesignNextAction, DesignRow } from './designBoardRows'

const provider = getDataProvider()

/** 발주처 링크 버튼이 할 일 — 살아 있는 링크가 하나면 그 자리에서 복사, 아니면(없음·여럿) 행사 설정 ② 담당자로 */
export type ClientLinkTarget = { kind: 'copy'; url: string } | { kind: 'settings' }

export const CLIENT_LINK_SETTINGS_PATH = '/settings?tab=members'

/**
 * 발주처 링크 버튼의 대상 — 디자인 보드·항목 상세 공용. 필요한 사람(대행형 PM)에게만 링크를 읽는다(enabled).
 * 권한이 없어 조회가 실패하면 null — 버튼을 그리지 않는다(추측 금지).
 */
export function useClientLinkTarget(projectId: string, enabled: boolean): ClientLinkTarget | null {
  const tokens = useAsync(
    () => (enabled ? provider.listClientTokens(projectId) : Promise.resolve(null)),
    [projectId, enabled],
  )
  return useMemo<ClientLinkTarget | null>(() => {
    if (!tokens.data) return null
    const active = activeClientLinks(tokens.data)
    return active.length === 1 ? { kind: 'copy', url: appUrl(`c/${active[0].token}`) } : { kind: 'settings' }
  }, [tokens.data])
}

/** 표 행 클릭(상세 열기)으로 번지지 않게 — 칸 안 버튼·링크는 제 할 일만 한다 */
const stop = (e: MouseEvent) => e.stopPropagation()

export default function DesignNextActionView({
  row,
  next,
  clientLink,
  onChanged,
  compact = false,
}: {
  row: DesignRow
  next: DesignNextAction
  clientLink: ClientLinkTarget | null
  onChanged: () => void
  /** 갤러리 카드 — 문구를 한 줄로 자른다 */
  compact?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2.5" data-testid="design-next-action">
      <span className="min-w-0">
        <span
          className={`block text-[13px] ${next.muted ? 'text-ink-sub' : 'text-brown'} ${compact ? 'truncate' : 'whitespace-normal'}`}
          title={compact ? next.text : undefined}
        >
          {next.text}
        </span>
        {!compact && <RequestAckNote line={row.ack ?? null} />}
      </span>
      {next.action && (
        <ActionButton row={row} kind={next.action.kind} label={next.action.label} clientLink={clientLink} onChanged={onChanged} />
      )}
    </div>
  )
}

function ActionButton({
  row,
  kind,
  label,
  clientLink,
  onChanged,
}: {
  row: DesignRow
  kind: NonNullable<DesignNextAction['action']>['kind']
  label: string
  clientLink: ClientLinkTarget | null
  onChanged: () => void
}) {
  const d = row.deliverable
  const cls = 'btn btn-ghost btn-sm shrink-0'
  switch (kind) {
    case 'upload':
      return (
        <Link to={`/items/${d.id}?upload=1`} onClick={stop} className={cls}>
          {label}
        </Link>
      )
    case 'open':
      return (
        <Link to={`/items/${d.id}`} onClick={stop} className={cls}>
          {label}
        </Link>
      )
    case 'partner_review':
      return (
        <Link to={`/partners?partner=${d.partner_id ?? ''}`} onClick={stop} className={cls}>
          {label}
        </Link>
      )
    case 'review_request':
      return <ReviewRequestButton deliverableId={d.id} label={label} onChanged={onChanged} />
    case 'client_link':
      return <ClientLinkButton target={clientLink} label={label} />
    case 'download':
      return row.latest ? <DownloadLink versionId={row.latest.id} fileName={row.latest.file_name} label={label} /> : null
  }
}

function ReviewRequestButton({ deliverableId, label, onChanged }: { deliverableId: string; label: string; onChanged: () => void }) {
  const transition = useMutation(() => provider.transitionStatus(deliverableId, 'internal_review'))
  const handle = async (e: MouseEvent) => {
    e.stopPropagation()
    const result = await transition.run()
    if (result) onChanged()
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button type="button" onClick={handle} disabled={transition.pending} className="btn btn-ghost btn-sm">
        {label}
      </button>
      {transition.error && (
        <span role="alert" className="max-w-[220px] whitespace-normal text-right text-xs text-negative">
          {transition.error}
        </span>
      )}
    </span>
  )
}

/**
 * 발주처에게 이메일은 아직 가지 않는다(Phase 6b) — 답을 재촉하려면 링크를 직접 다시 전한다.
 * 링크가 하나면 복사, 여럿·없음이면 어느 링크를 쓸지 고르는 행사 설정 ② 담당자로 보낸다(추측으로 하나를 고르지 않는다).
 */
export function ClientLinkButton({
  target,
  label,
  copyLabel = '링크 복사',
  small = true,
}: {
  target: ClientLinkTarget | null
  label: string
  /** 링크가 하나라 바로 복사할 때의 문구 */
  copyLabel?: string
  /** 표 칸(ghost-sm) · 카드(ghost 기본 크기) */
  small?: boolean
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const size = small ? 'btn btn-ghost btn-sm' : 'btn btn-ghost'
  if (!target) return null
  if (target.kind === 'settings') {
    return (
      <Link to={CLIENT_LINK_SETTINGS_PATH} onClick={stop} className={`${size} shrink-0`} title="행사 설정 ② 담당자 — 발주처 링크 복사·발급">
        {label}
      </Link>
    )
  }
  const copy = async (e: MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(target.url)
      setState('copied')
      setTimeout(() => setState('idle'), 1500)
    } catch {
      setState('failed')
    }
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button type="button" onClick={copy} className={size} title="발주처 컨펌 화면 주소를 복사합니다 — 메신저로 다시 전하세요">
        {state === 'copied' ? '복사됨' : copyLabel}
      </button>
      {state === 'failed' && (
        <Link to={CLIENT_LINK_SETTINGS_PATH} onClick={stop} className="text-xs text-negative underline underline-offset-2">
          복사하지 못했습니다 — 행사 설정에서 복사
        </Link>
      )}
    </span>
  )
}

/** 최종본 받기 — 파일 주소가 준비된 뒤에만 링크가 된다(항목 상세의 최신본 다운로드와 같은 방식) */
function DownloadLink({ versionId, fileName, label }: { versionId: string; fileName: string; label: string }) {
  const url = useAsync(() => provider.getFileUrl(versionId), [versionId])
  if (!url.data) {
    return (
      <button type="button" disabled className="btn btn-ghost btn-sm shrink-0">
        {label}
      </button>
    )
  }
  return (
    <a href={url.data} download={fileName} target="_blank" rel="noreferrer" onClick={stop} className="btn btn-ghost btn-sm shrink-0">
      {label}
    </a>
  )
}
