// 공용 비동기 조회/변경 훅 — DataProvider 메서드는 전부 Promise라 페이지마다 useEffect
// 보일러플레이트를 반복하지 않도록 여기서 흡수한다 (CLAUDE.md 하네스 지침).
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
}

/**
 * 조회 훅 — { data, loading, error, reload }.
 * deps가 바뀌거나 reload()가 호출되면 fn을 재실행한다.
 * 에러는 ProviderError.message를 그대로 담아 화면에서 노출한다.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: DependencyList,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const fnRef = useRef(fn)
  fnRef.current = fn
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fnRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ data: null, loading: false, error: messageOf(err) })
      })
    return () => {
      cancelled = true
    }
    // deps는 호출부가 명시적으로 전달 — fn 자체는 매 렌더 새 클로저라도 무방(ref로 흡수)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadTick])

  const reload = useCallback(() => setReloadTick((t) => t + 1), [])

  return { ...state, reload }
}

/**
 * 변경(mutation) 훅 — { run, pending, error, setError }.
 * run()은 실패 시 ProviderError.message를 error에 담고 undefined를 반환한다(throw하지 않음) —
 * 호출부는 반환값 존재 여부로 성공을 판단하고, 성공 시 대상 조회를 reload()하면 된다.
 */
export function useMutation<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
): { run: (...args: Args) => Promise<R | undefined>; pending: boolean; error: string | null; setError: (m: string | null) => void } {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async (...args: Args): Promise<R | undefined> => {
    setPending(true)
    setError(null)
    try {
      const result = await fnRef.current(...args)
      setPending(false)
      return result
    } catch (err) {
      setError(messageOf(err))
      setPending(false)
      return undefined
    }
  }, [])

  return { run, pending, error, setError }
}
