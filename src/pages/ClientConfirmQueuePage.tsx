// S7 발주처 컨펌 큐 (/c/:token) — 대기 항목 승인/수정요청 + 처리 완료 이력. 무로그인 토큰 뷰(§6.3).
import { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import ClientMessage from '../components/client/ClientMessage'
import HistoryRow from '../components/client/HistoryRow'
import QueueItemCard from '../components/client/QueueItemCard'
import SuccessBanner from '../components/client/SuccessBanner'
import { useClientData } from '../components/client/useClientData'
import { getDataProvider } from '../providers'

export default function ClientConfirmQueuePage() {
  const { token = '' } = useParams()
  const provider = getDataProvider()
  const fetcher = useCallback(() => provider.getClientQueue(token), [provider, token])
  const { data, loading, errorKind, error, reload } = useClientData(fetcher)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleApprove = useCallback(
    async (approvalId: string) => {
      await provider.submitClientDecision(token, { approval_id: approvalId, decision: 'approved' })
      setSuccessMessage('승인 처리되었습니다.')
      await reload()
    },
    [provider, token, reload],
  )

  const handleRequestChanges = useCallback(
    async (approvalId: string, comment: string) => {
      await provider.submitClientDecision(token, {
        approval_id: approvalId,
        decision: 'changes_requested',
        comment,
      })
      setSuccessMessage('수정요청이 접수되었습니다.')
      await reload()
    },
    [provider, token, reload],
  )

  if (errorKind === 'gone') {
    return <ClientMessage tone="gone" title="링크가 만료되었습니다" body="담당자에게 새 링크를 요청하세요." />
  }
  if (errorKind === 'not_found') {
    return <ClientMessage tone="error" title="유효하지 않은 링크입니다" />
  }
  if (errorKind === 'other') {
    return (
      <ClientMessage
        tone="error"
        title="오류가 발생했습니다"
        body={error instanceof Error ? error.message : undefined}
      />
    )
  }

  if (loading && !data) {
    return <p className="px-4 py-12 text-center text-sm text-gray-400">불러오는 중입니다...</p>
  }
  if (!data) return null

  return (
    <div className="pb-10">
      <div className="border-b border-gray-200 bg-white px-4 py-4">
        <p className="text-xs font-medium text-gray-400">{data.project_name}</p>
        <h1 className="mt-0.5 text-lg font-bold text-gray-900">
          {data.contact_name ?? '담당자'}님, 확인 부탁드립니다
        </h1>
      </div>

      <div className="space-y-4 px-4 py-4">
        {successMessage && <SuccessBanner message={successMessage} />}

        {data.queue.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            검토할 항목이 없습니다
          </div>
        ) : (
          <ul className="space-y-4">
            {data.queue.map((item) => (
              <li key={item.approval_id}>
                <QueueItemCard item={item} onApprove={handleApprove} onRequestChanges={handleRequestChanges} />
              </li>
            ))}
          </ul>
        )}

        {data.history.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">처리 완료 이력</h2>
            <ul className="space-y-2">
              {data.history.map((h) => (
                <HistoryRow key={h.approval_id} item={h} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
