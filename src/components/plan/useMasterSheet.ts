// S9 발행 줄 '마스터 시트 만들기' 상태 — 설계서 v2.21 §27.5 · Phase 6.11 PR-G.
// 클릭에만 만든다(자동 0) · mock은 사실 안내(가짜 링크 금지) · 서버는 masterSheetClient(api/master-sheet) → 링크.
// 앱은 만든 시트를 다시 읽지 않는다(R-M1) — 결과는 링크·파일 이름·탭 이름뿐.
import { useCallback, useState } from 'react'
import { getMasterSheetGateway, MASTER_SHEET_MOCK_MESSAGE } from '../../lib/masterSheet/masterSheetGateway'
import type { MasterSheetResult } from '../../lib/masterSheet/types'

export interface MasterSheetState {
  pending: boolean
  result: MasterSheetResult | null
  error: string | null
  /** mock 사실 안내(실서버가 아니라 만들지 않았다) */
  notice: string | null
  create: () => Promise<void>
}

export function useMasterSheet(projectId: string): MasterSheetState {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<MasterSheetResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const create = useCallback(async () => {
    const gateway = getMasterSheetGateway()
    setError(null)
    setResult(null)
    if (gateway.mode === 'mock') {
      setNotice(MASTER_SHEET_MOCK_MESSAGE)
      return
    }
    setNotice(null)
    setPending(true)
    try {
      setResult(await gateway.client.create(projectId))
    } catch (e) {
      setError(e instanceof Error ? e.message : '마스터 시트를 만들지 못했습니다.')
    } finally {
      setPending(false)
    }
  }, [projectId])

  return { pending, result, error, notice, create }
}
