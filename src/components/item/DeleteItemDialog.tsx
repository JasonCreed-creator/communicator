// Phase 4.5(2026-09-25) — 항목 지우기 확인 모달. 사용자 결정: PM만 · **모든 상태** · 항목 이름 입력으로 확인.
// 행사 삭제(DeleteProjectDialog)와 같은 이유로 window.confirm을 쓰지 않는다 — 지울 항목의 이름을 직접 쳐야
// Enter 한 번 오조작과 대상 오인이 함께 걸러진다. 지운 뒤에는 결과(Drive 폴더 보관 여부)를 이 자리에서 알리고,
// 닫으면 호출부가 보드로 옮긴다(지운 항목의 상세 화면에 머무를 수 없다).
import { useEffect, useRef, useState } from 'react'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import { providerKind } from '../../providers/kind'
import type { DeliverableDetail } from '../../types/views'
import type { DeleteDeliverableResult } from '../../types/views'

const provider = getDataProvider()

export default function DeleteItemDialog({
  deliverable,
  leaveLabel,
  onCancel,
  onLeave,
}: {
  deliverable: Pick<DeliverableDetail, 'id' | 'title' | 'area' | 'drive_folder_id' | 'versions' | 'comments' | 'approvals'>
  /** 지운 뒤 이동 버튼 문구 — 예: '디자인 보드로' */
  leaveLabel: string
  onCancel: () => void
  /** 지운 뒤 닫기 — 호출부가 화면을 옮긴다 */
  onLeave: () => void
}) {
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState<DeleteDeliverableResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const leaveRef = useRef<HTMLButtonElement>(null)
  const remove = useMutation(() => provider.deleteDeliverable(deliverable.id))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    if (done) leaveRef.current?.focus()
  }, [done])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (done) onLeave()
      else onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [done, onCancel, onLeave])

  const matches = typed.trim() === deliverable.title.trim()
  const handleDelete = async () => {
    if (!matches) return
    const result = await remove.run()
    if (result) setDone(result)
  }

  const counts = [
    deliverable.versions.length > 0 && `버전 ${deliverable.versions.length}개`,
    deliverable.comments.length > 0 && `코멘트 ${deliverable.comments.length}개`,
    deliverable.approvals.length > 0 && `컨펌 기록 ${deliverable.approvals.length}건`,
  ].filter(Boolean)
  // 실서버에서만 Drive 이야기를 한다(mock·데모에는 Drive가 없다). 공통 영역 항목은 파트 폴더에 바로 두므로 폴더를 옮기지 않는다.
  const liveDrive = providerKind() === 'supabase'
  const hasItemFolder = liveDrive && deliverable.area !== 'common' && !!deliverable.drive_folder_id

  return (
    <div className="print-hidden fixed inset-0 z-30 flex items-center justify-center p-4">
      <div aria-hidden onClick={done ? onLeave : onCancel} className="absolute inset-0 bg-ink/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="항목 지우기"
        data-testid="delete-item-dialog"
        className="ui-card relative z-10 w-full max-w-md p-6"
      >
        {done ? (
          <>
            <h2 className="t-card-title">지웠습니다</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-sub">
              <b className="text-ink">{deliverable.title}</b> 항목을 지웠습니다.
            </p>
            {liveDrive && (
              <p data-testid="delete-item-drive" className="mt-2 text-sm leading-relaxed text-ink-sub">
                {done.drive_archived
                  ? 'Drive의 항목 폴더는 행사 폴더의 99_archive로 옮겼습니다 — 파일은 그대로 있습니다.'
                  : hasItemFolder
                    ? 'Drive의 항목 폴더는 옮기지 못해 원래 자리에 남았습니다 — 필요하면 Drive에서 직접 정리하세요.'
                    : 'Drive에 올린 파일은 지우지 않았습니다.'}
              </p>
            )}
            <div className="mt-5 flex justify-end">
              <button ref={leaveRef} type="button" onClick={onLeave} className="btn btn-primary">
                {leaveLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="t-card-title">이 항목을 지울까요?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-sub">
              <b className="text-ink">{deliverable.title}</b> 항목이 사라집니다
              {counts.length > 0 ? ` — ${counts.join(' · ')}도 함께` : ''}. 일정(WBS)의 연결은 풀립니다.
              <b className="text-negative"> 되돌릴 수 없습니다.</b>
            </p>
            {liveDrive && (
              <p className="mt-2 text-sm leading-relaxed text-ink-sub">
                Drive에 올린 파일은 지우지 않습니다
                {hasItemFolder ? ' — 항목 폴더를 행사 폴더의 99_archive로 옮깁니다.' : '.'}
              </p>
            )}

            <label className="mt-4 block text-sm font-medium text-ink" htmlFor="delete-item-confirm">
              확인을 위해 항목 이름 <b>{deliverable.title}</b>을(를) 입력하세요
            </label>
            <input
              id="delete-item-confirm"
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="ui-input mt-1.5 w-full"
              autoComplete="off"
              placeholder={deliverable.title}
            />

            {remove.error && <p className="mt-3 text-sm text-negative">{remove.error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onCancel} className="btn btn-ghost">
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!matches || remove.pending}
                className="btn btn-ghost-negative"
              >
                영구 삭제
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
