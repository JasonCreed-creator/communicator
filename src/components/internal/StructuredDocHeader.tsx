// 3.16.4 — 정형 문서(시나리오·운영가이드) 빌더 공용 헤더. 목업 v2.5 화면 B·C의 헤더 컴포지션
// 정본: 좌측 "{문서유형} — {문서명}" + 상태 배지 + 설명줄, 우측 보조 액션(내보내기·인쇄 등) +
// [컨펌 발송](주황). 버튼 배치만 목업 정본이고 동작은 기존 상태 머신 그대로다 —
// 발송 가능 = internal_review + PM + requires_approval + 대행형(주최형은 버튼 자체를 숨김, DoD 31).
// 불가 상태는 disabled + 사유 InfoTip. 발송은 requestApproval(version_id 'auto') — provider가
// 인쇄 스냅숏(.pdf)을 자동 버전 등록한다(§8 doc-snapshot).
import { useState, type FormEvent, type ReactNode } from 'react'
import ErrorAlert from './ErrorAlert'
import InfoTip from './InfoTip'
import StatusBadge from './StatusBadge'
import { useMutation } from '../../hooks/useAsync'
import {
  DOC_SEND_NEEDS_REVIEW_HELP,
  DOC_SEND_NO_APPROVAL_HELP,
  DOC_SEND_PM_ONLY_HELP,
} from '../../lib/helpTexts'
import { getDataProvider } from '../../providers'
import type { DeliverableStatus } from '../../types/enums'

const provider = getDataProvider()

export default function StructuredDocHeader({
  docTypeLabel,
  title,
  status,
  desc,
  deliverableId,
  actions,
  isHost,
  isPm,
  requiresApproval,
  onSent,
}: {
  /** '시나리오' | '운영가이드' — 헤더 표기 "{유형} — {문서명}" */
  docTypeLabel: string
  title: string
  status: DeliverableStatus
  /** 헤더 아래 설명줄(목업 .desc) */
  desc: string
  deliverableId: string
  /** 컨펌 발송 왼쪽에 배치되는 보조 액션(큐시트로 내보내기·인쇄 등) */
  actions?: ReactNode
  /** 주최형이면 발주처 발송 UI를 그리지 않는다(DoD 31) */
  isHost: boolean
  isPm: boolean
  requiresApproval: boolean
  onSent?: () => void
}) {
  const [sendOpen, setSendOpen] = useState(false)
  const [dueAt, setDueAt] = useState('')
  const send = useMutation(() =>
    provider.requestApproval(deliverableId, {
      version_id: 'auto',
      due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
    }),
  )

  const canSend = status === 'internal_review' && isPm && requiresApproval
  const sendDisabledReason = !requiresApproval
    ? DOC_SEND_NO_APPROVAL_HELP
    : status !== 'internal_review'
      ? DOC_SEND_NEEDS_REVIEW_HELP
      : !isPm
        ? DOC_SEND_PM_ONLY_HELP
        : null

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    const result = await send.run()
    if (result) {
      setSendOpen(false)
      setDueAt('')
      onSent?.()
    }
  }

  return (
    <div className="border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="t-card-title flex flex-wrap items-center gap-2">
            <span className="min-w-0">
              {docTypeLabel} — {title}
            </span>
            <StatusBadge status={status} />
          </h2>
          <p className="mt-1 text-xs text-ink-sub">{desc}</p>
        </div>
        <div className="plan-print-hidden flex flex-wrap items-center gap-2">
          {actions}
          {!isHost && (
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSendOpen((v) => !v)}
                disabled={!canSend}
                className="btn btn-accent btn-sm"
              >
                컨펌 발송
              </button>
              {sendDisabledReason && <InfoTip text={sendDisabledReason} />}
            </span>
          )}
        </div>
      </div>

      {sendOpen && canSend && (
        <form
          onSubmit={handleSend}
          className="plan-print-hidden mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-canvas p-3"
        >
          <p className="w-full text-xs text-ink-sub">
            발송 시 인쇄 스냅숏(.pdf)이 자동 버전으로 등록됩니다.
          </p>
          <label className="flex flex-col gap-1 t-caption">
            컨펌 기한
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="ui-input"
            />
          </label>
          <button type="submit" disabled={send.pending} className="btn btn-accent btn-sm">
            발송
          </button>
          <button type="button" onClick={() => setSendOpen(false)} className="btn btn-ghost btn-sm">
            취소
          </button>
          <ErrorAlert message={send.error} />
        </form>
      )}
    </div>
  )
}
