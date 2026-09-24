// Drive 연결 상태 훅 — 업로드 카드 안내·행사 설정 Drive 카드가 쓴다. 60초 모듈 캐시(항목마다 서버를 두드리지 않게).
// mock은 서버가 없어 상태를 묻지 않는다({mode:'mock'}).
import { useCallback, useEffect, useState } from 'react'
import type { DriveStatus } from './driveClient'
import { getDriveGateway } from './driveGateway'

const TTL_MS = 60_000
let cache: { at: number; value: DriveStatus | null; error: string | null } | null = null

/** 테스트용 */
export function resetDriveStatusCache(): void {
  cache = null
}

export function useDriveStatus(): {
  mode: 'mock' | 'server'
  status: DriveStatus | null
  error: string | null
  loading: boolean
  reload: () => void
} {
  const gateway = getDriveGateway()
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<{ status: DriveStatus | null; error: string | null; loading: boolean }>(() =>
    cache && Date.now() - cache.at < TTL_MS
      ? { status: cache.value, error: cache.error, loading: false }
      : { status: null, error: null, loading: gateway.mode === 'server' },
  )

  useEffect(() => {
    if (gateway.mode !== 'server') return
    if (tick === 0 && cache && Date.now() - cache.at < TTL_MS) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    gateway.client
      .status()
      .then((value) => {
        cache = { at: Date.now(), value, error: null }
        if (!cancelled) setState({ status: value, error: null, loading: false })
      })
      .catch((e: unknown) => {
        const error = e instanceof Error ? e.message : 'Drive 상태를 확인하지 못했습니다.'
        cache = { at: Date.now(), value: null, error }
        if (!cancelled) setState({ status: null, error, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [gateway, tick])

  const reload = useCallback(() => {
    cache = null
    setTick((t) => t + 1)
  }, [])

  return { mode: gateway.mode, ...state, reload }
}
