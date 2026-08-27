// P9 — "구글시트 연동" 자리 표시. Drive 이식(Phase 5) 전까지는 안내만 띄운다(게이트 뒤에 숨기지 않는다 —
// §10 진입점 원칙). 새 필드·스키마는 만들지 않는다.
import { useState } from 'react'

export default function GoogleSheetsButton() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-ghost shrink-0">
        구글시트 연동
      </button>
      {open && (
        <div
          role="note"
          className="absolute left-0 top-full z-20 mt-2 w-72 rounded-md border border-border bg-card p-3 text-xs leading-relaxed text-ink-sub shadow-lg"
        >
          구글 계정 연동(Drive 이식 단계)과 함께 열립니다. 그때까지는 시트를 xlsx로 내려받아 임포트해
          주세요.
          <div className="mt-2 text-right">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
