import { useEffect, useRef } from 'react'
import { SHEET_INVALID_REASON_LABELS } from '../../types/enums'
import type { SheetExcludedRow } from '../../types/views'
import { maskEmail, maskPhone } from './sheetFormat'

/** 제외 목록 — v2.6 §24.5 / 3.17.1 T3.
 *
 *  이메일 필수를 유지하기로 한 결정은 "탈락한 행을 볼 수 있다"가 성립할 때만 안전하다.
 *  숫자만 보여주면 시트엔 있는데 앱엔 없는 사람이 D-Day에 발견된다.
 *  원본 값은 확인용 미리보기이므로 연락처는 여기서도 마스킹한다(§24.1). */
export default function SheetExcludedDialog({
  rows,
  sheetUrl,
  onClose,
}: {
  rows: SheetExcludedRow[]
  sheetUrl: string | null
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="print-hidden fixed inset-0 z-30 flex items-center justify-center p-4">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="제외된 시트 행"
        className="ui-card relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="t-card-title">제외된 시트 행 {rows.length}건</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-sub">
              아래 행은 앱 명단에 올라가지 않았습니다. 시트에서 고치면 다음 동기화에서 따라옵니다 —
              앱은 시트에 쓰지 않습니다.
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="btn btn-ghost btn-sm shrink-0">
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="overflow-x-auto">
            <table className="ui-table" aria-label="제외 목록">
              <thead>
                <tr>
                  <th className="ui-th w-[88px]">시트 행</th>
                  <th className="ui-th w-[124px]">사유</th>
                  <th className="ui-th">이름 · 소속</th>
                  <th className="ui-th">연락처(마스킹)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sheet_row_id}>
                    <td className="ui-num text-ink-sub">{r.row_number}</td>
                    <td>
                      <span className="ui-badge inline-flex shrink-0 items-center rounded-full bg-negative-tint px-2 py-0.5 text-xs font-medium text-negative">
                        {SHEET_INVALID_REASON_LABELS[r.reason]}
                      </span>
                    </td>
                    <td className="text-ink" title={`${r.name} ${r.org ?? ''}`.trim()}>
                      {r.name || '(이름 없음)'}
                      {r.org && <span className="ml-1 text-ink-sub">· {r.org}</span>}
                    </td>
                    <td className="text-ink-sub">
                      {[r.email ? maskEmail(r.email) : null, r.phone ? maskPhone(r.phone) : null]
                        .filter(Boolean)
                        .join(' · ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {sheetUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-ghost"
            >
              시트에서 고치기 ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
