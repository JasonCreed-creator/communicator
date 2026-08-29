// S8-b 발주처 제출 자료 (/c/:token/materials) — 고객사가 보내주셔야 할 항목.
// 시안 「발주처 보드」 새 탭. 목록은 새 provider 메서드 없이 기존 발주처 계약에서 파생한다
// (clientDerive.ts) — 지금은 계약에 인바운드 요청 필드가 없어 항상 빈 상태 ②로 정직하게 비운다.
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ClientMaterialCard from '../components/client/ClientMaterialCard'
import ClientMessage from '../components/client/ClientMessage'
import { useClientData } from '../components/client/useClientData'
import { deriveClientMaterials, type ClientMaterialRequest } from '../components/client/clientDerive'
import EmptyState from '../components/internal/EmptyState'
import { getDataProvider } from '../providers'

export default function ClientMaterialsPage() {
  const { token = '' } = useParams()
  const provider = getDataProvider()
  const fetcher = useCallback(
    async () => {
      const [status, queue] = await Promise.all([
        provider.getClientStatus(token),
        provider.getClientQueue(token),
      ])
      return { status, queue }
    },
    [provider, token],
  )
  const { data, loading, errorKind, error } = useClientData(fetcher)
  const [notice, setNotice] = useState<string | null>(null)

  const handleUpload = useCallback((material: ClientMaterialRequest) => {
    // 발주처 직접 업로드 경로는 아직 열려 있지 않다 — 게이트 뒤에 숨기지 않고 안내한다.
    setNotice(`‘${material.title}’ 파일 접수는 준비 중입니다. 담당 PM에게 메일로 보내주세요.`)
  }, [])

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
    return <p className="px-4 py-12 text-center text-sm text-ink-cap">불러오는 중입니다...</p>
  }
  if (!data) return null

  const materials = deriveClientMaterials(data.queue, data.status)

  return (
    <div className="px-4 py-4 pb-10">
      <p className="text-sm leading-relaxed text-ink-sub">
        행사 준비에 필요한 자료입니다. 담당 PM이 자료를 요청하면 항목과 기한이 여기에 표시됩니다.
      </p>

      {notice && (
        <p
          role="status"
          className="mt-3 rounded-md border border-steel/20 bg-steel-tint px-3 py-2 text-sm text-steel"
        >
          {notice}
        </p>
      )}

      {materials.length === 0 ? (
        <div className="ui-card mt-3 px-4">
          <EmptyState
            message="아직 요청된 제출 자료가 없습니다."
            action={
              <Link to={`/c/${token}/status`} className="btn btn-ghost h-11">
                진행 현황 보기
              </Link>
            }
          />
          <p className="pb-6 text-center text-xs leading-relaxed text-ink-cap">
            담당 PM이 요청한 자료(원고·명단·로고 원본 등)가 기한·설명과 함께 이 자리에 카드로 쌓입니다.
          </p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {materials.map((m) => (
            <li key={m.id}>
              <ClientMaterialCard material={m} onUpload={handleUpload} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
