// S-3 랜딩보드 (v2.1 §10) — 좌: 랜딩 목록 / 우: 선택 랜딩의 유입 지표·발행 상태.
// 발행 방식이 "단일 HTML 내보내기"라 이 화면은 파일을 만들어 주고, 올린 주소를 기록만 한다.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/internal/EmptyState'
import PageHeader from '../components/internal/PageHeader'
import LandingMetrics from '../components/landing/LandingMetrics'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { getDataProvider } from '../providers'
import type { LandingPage } from '../types/entities'

const provider = getDataProvider()

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-track text-ink-sub',
  published: 'bg-positive-tint text-positive',
  closed: 'bg-track text-ink-cap',
}
const STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  published: '발행됨',
  closed: '신청 마감',
}

/** 제목에서 slug 후보를 만든다 — 한글은 못 쓰므로 비면 날짜 기반으로 채운다 */
function slugFrom(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `landing-${Date.now().toString(36)}`
}

export default function LandingBoardPage() {
  const navigate = useNavigate()
  const { projectId, summaries } = useProject()
  const currentSummary = summaries.find((x) => x.id === projectId) ?? null
  const list = useAsync(() => provider.listLandingPages(), [projectId])
  const pages = useMemo(() => list.data ?? [], [list.data])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const selected: LandingPage | null = useMemo(
    () => pages.find((p) => p.id === selectedId) ?? pages[0] ?? null,
    [pages, selectedId],
  )

  const metrics = useAsync(
    () => (selected ? provider.listLandingMetrics(selected.id) : Promise.resolve([])),
    [selected?.id],
  )

  const createLanding = async () => {
    setBusy(true)
    setError(null)
    try {
      const title = currentSummary?.name ? `${currentSummary.name} 랜딩` : '새 랜딩'
      const created = await provider.createLandingPage({ title, slug: slugFrom(currentSummary?.code ?? '') })
      list.reload()
      navigate(`/landing/${created.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '랜딩 생성에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        caption="준비 · S-3"
        title="랜딩보드"
        action={
          <button type="button" className="btn btn-accent" onClick={createLanding} disabled={busy}>
            ＋ 새 랜딩
          </button>
        }
      />

      {error && <p className="text-sm text-negative">{error}</p>}
      {list.error && <p className="text-sm text-negative">{list.error}</p>}

      {list.loading ? (
        <p className="text-sm text-ink-sub">불러오는 중…</p>
      ) : pages.length === 0 ? (
        <EmptyState
          message="아직 만든 랜딩이 없습니다. 행사 개요·세션 데이터가 자동으로 채워집니다."
          action={
            <button type="button" className="btn" onClick={createLanding} disabled={busy}>
              첫 랜딩 만들기
            </button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* 좌: 목록 */}
          <div className="ui-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-track text-left">
                  <th className="px-4 py-2.5 t-caption font-semibold">랜딩</th>
                  <th className="px-4 py-2.5 t-caption font-semibold">상태</th>
                  <th className="px-4 py-2.5 t-caption font-semibold">측정</th>
                  <th className="px-4 py-2.5 t-caption font-semibold">수정</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`cursor-pointer border-t border-border ${
                      selected?.id === p.id ? 'bg-accent-tint' : 'hover:bg-track'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-left font-semibold text-ink hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/landing/${p.id}`)
                        }}
                      >
                        {p.title}
                      </button>
                      <span className="block text-xs text-ink-cap">/{p.slug}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${STATUS_PILL[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-sub">
                      {p.analytics.ga_measurement_id ?? <span className="text-ink-cap">미설정</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-cap">{p.updated_at.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 우: 선택 랜딩 요약 */}
          {selected && (
            <aside className="ui-card flex flex-col gap-3 p-4">
              <div>
                <p className="t-caption">선택 랜딩</p>
                <p className="text-base font-bold text-ink">{selected.title}</p>
              </div>
              {selected.public_url ? (
                <a
                  href={selected.public_url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-xs text-steel underline"
                >
                  {selected.public_url}
                </a>
              ) : (
                <p className="text-xs text-ink-cap">아직 발행되지 않았습니다.</p>
              )}
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <dt className="text-ink-cap">폼 제출</dt>
                <dd className="text-ink-sub">
                  {selected.submit_target === 'registration' ? '등록(S4)으로 유입' : '외부 URL'}
                </dd>
                <dt className="text-ink-cap">GA</dt>
                <dd className="text-ink-sub">{selected.analytics.ga_measurement_id ?? '미설정'}</dd>
                <dt className="text-ink-cap">전환 이벤트</dt>
                <dd className="text-ink-sub">{selected.analytics.conversion_event}</dd>
              </dl>
              <button
                type="button"
                className="btn btn-accent mt-1"
                onClick={() => navigate(`/landing/${selected.id}`)}
              >
                편집·내보내기
              </button>
            </aside>
          )}

          {/* 지표는 전체 폭 */}
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-bold text-ink">유입 지표</h2>
            {metrics.loading ? (
              <p className="text-sm text-ink-sub">불러오는 중…</p>
            ) : (
              <LandingMetrics rows={metrics.data ?? []} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
