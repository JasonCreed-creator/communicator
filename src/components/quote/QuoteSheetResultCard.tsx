// 구글 스프레드시트 생성 결과 카드 — 링크(새 탭)·링크 복사·공유 대상. 에디터 ④·목록 공용.
import { useEffect, useState } from 'react'
import type { QuoteSpreadsheetResult } from '../../modules/quote/export/createQuoteSpreadsheet'
import type { QuoteStrings } from './quoteStrings'

export default function QuoteSheetResultCard({ result, t }: { result: QuoteSpreadsheetResult; t: QuoteStrings }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div role="status" className="rounded-md border border-positive/30 bg-positive-tint px-3 py-2.5 text-sm" data-testid="gsheet-result">
      <p className="font-semibold text-positive">📗 {t.gsheetDone}</p>
      <p className="mt-1 break-all text-ink-sub">{result.file_name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a className="btn btn-ghost btn-sm" href={result.url} target="_blank" rel="noopener noreferrer">
          {t.gsheetOpen}
        </a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>
          {copied ? t.gsheetCopied : t.gsheetCopy}
        </button>
        {result.shared_with && (
          <span className="text-xs text-ink-cap">
            {t.gsheetSharedWith} {result.shared_with}
          </span>
        )}
      </div>
    </div>
  )
}
