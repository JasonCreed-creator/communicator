// 발주처 화면(S7·S8) 공용 데이터 로딩 훅 — 토큰 조회 결과를 로딩/에러/재조회로 표준화한다.
// 에러는 ProviderError.status로 분기(410=gone, 404=not_found, 그 외=other) — CLAUDE.md 오류 규약.
import { useCallback, useEffect, useState } from 'react'
import { isProviderError } from '../../lib/errors'

export type ClientErrorKind = 'gone' | 'not_found' | 'other'

export interface UseClientDataResult<T> {
  data: T | null
  loading: boolean
  error: unknown
  /** null = 에러 없음 */
  errorKind: ClientErrorKind | null
  reload: () => Promise<void>
}

export function useClientData<T>(fetcher: () => Promise<T>): UseClientDataResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetcher()
      setData(result)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    void reload()
  }, [reload])

  let errorKind: ClientErrorKind | null = null
  if (error) {
    if (isProviderError(error)) {
      errorKind = error.status === 410 ? 'gone' : error.status === 404 ? 'not_found' : 'other'
    } else {
      errorKind = 'other'
    }
  }

  return { data, loading, error, errorKind, reload }
}
