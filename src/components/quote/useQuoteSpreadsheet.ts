// 견적서 → 구글 스프레드시트 생성 훅 — 에디터 ④·목록 두 화면이 같은 흐름을 쓴다.
// 흐름: provider.exportQuoteXlsx(같은 xlsx) → 세션 토큰 → createQuoteSpreadsheet(서버 함수) → 결과(링크)를 견적 id별로 보관.
// mock 공급자(로그인 없음)에서는 서버를 부르지 않고 안내 오류를 던진다 — 화면은 오류 슬롯에 그 문구를 보여준다.
import { useCallback, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  createQuoteSpreadsheet,
  QuoteSpreadsheetError,
  type QuoteSpreadsheetResult,
} from '../../modules/quote/export/createQuoteSpreadsheet'
import { getDataProvider } from '../../providers'

const provider = getDataProvider()

export interface QuoteSpreadsheetState {
  pending: boolean
  /** 해당 견적으로 만든 최근 결과(없으면 null) */
  resultFor: (quoteId: string | null | undefined) => QuoteSpreadsheetResult | null
  /** 성공 시 결과, 실패 시 throw(Error.message = 사용자 문구) */
  create: (quoteId: string, lang: 'ko' | 'en', mockNotice: string) => Promise<QuoteSpreadsheetResult>
}

export function useQuoteSpreadsheet(): QuoteSpreadsheetState {
  const auth = useAuth()
  const [pending, setPending] = useState(false)
  const [results, setResults] = useState<Record<string, QuoteSpreadsheetResult>>({})

  const create = useCallback(
    async (quoteId: string, lang: 'ko' | 'en', mockNotice: string) => {
      if (auth.mode === 'mock') throw new QuoteSpreadsheetError('forbidden', mockNotice)
      setPending(true)
      try {
        const { file_name, blob } = await provider.exportQuoteXlsx(quoteId, lang)
        const token = await auth.getAccessToken()
        const result = await createQuoteSpreadsheet(blob, file_name, token)
        setResults((prev) => ({ ...prev, [quoteId]: result }))
        return result
      } finally {
        setPending(false)
      }
    },
    [auth],
  )

  const resultFor = useCallback((quoteId: string | null | undefined) => (quoteId ? results[quoteId] ?? null : null), [results])

  return { pending, resultFor, create }
}
