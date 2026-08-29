// S-3 랜딩보드 (v2.1 §10) — 좌: 랜딩 목록 / 우: 선택 랜딩의 유입 지표·발행 상태.
// 발행 방식이 "단일 HTML 내보내기"라 이 화면은 파일을 만들어 주고, 올린 주소를 기록만 한다.
//
// 3.17b 시안 정렬('랜딩보드 · 견적.dc.html'):
//  · 자체 표 규격(thead bg-track)을 **표 정본**으로 교체 — .ui-table + .ui-th(canvas 면 + 2px 룰),
//    44 고정·zebra·스티키 첫 열·정렬 화살표(정렬 가능한 열에만: 랜딩·수정).
//  · 상태 pill을 **배지 정본**(rounded-full · 12/500)으로 — LevelBadge + landingStatus 매핑.
//  · 빈 상태 5종 분리 — ① 로딩=TableSkeleton · ⑤ 로드 실패=LoadFailedState(재시도).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/internal/EmptyState'
import LoadFailedState from '../components/internal/LoadFailedState'
import PageHeader from '../components/internal/PageHeader'
import SortableTh, { type SortDirection } from '../components/internal/SortableTh'
import { LevelBadge } from '../components/internal/StatusBadge'
import TableSkeleton from '../components/internal/TableSkeleton'
import LandingMetrics from '../components/landing/LandingMetrics'
import { LANDING_STATUS_LABELS, LANDING_STATUS_LEVEL } from '../components/landing/landingStatus'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { getDataProvider } from '../providers'
import type { LandingPage } from '../types/entities'

const provider = getDataProvider()

type SortKey = 'title' | 'updated'

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
  const list = useAsync(() => provider.listLandingPages(projectId), [projectId])
  const pages = useMemo(() => list.data ?? [], [list.data])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 기본 정렬 = 수정 최신순(시안의 활성 화살표 ↓)
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'title' ? 'asc' : 'desc')
    }
  }

  const sorted = useMemo(() => {
    const sign = sortDir === 'asc' ? 1 : -1
    return [...pages].sort((a, b) =>
      sortKey === 'title'
        ? a.title.localeCompare(b.title, 'ko') * sign
        : a.updated_at.localeCompare(b.updated_at) * sign,
    )
  }, [pages, sortKey, sortDir])

  const selected: LandingPage | null = useMemo(
    () => pages.find((p) => p.id === selectedId) ?? sorted[0] ?? null,
    [pages, selectedId, sorted],
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
      const created = await provider.createLandingPage(projectId, {
        title,
        slug: slugFrom(currentSummary?.code ?? ''),
      })
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

      {list.loading ? (
        // ① 로딩 — 실제 행 구조와 같은 스켈레톤(스피너 금지)
        <TableSkeleton rows={3} columns={4} />
      ) : list.error ? (
        // ⑤ 로드 실패 — 원문 그대로 + 재시도
        <LoadFailedState message={list.error} onRetry={list.reload} />
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
          {/* 좌: 목록 — 표 정본 */}
          <div className="ui-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ui-table min-w-[520px] text-sm">
                <thead>
                  <tr>
                    <SortableTh
                      active={sortKey === 'title'}
                      direction={sortDir}
                      onSort={() => toggleSort('title')}
                    >
                      랜딩
                    </SortableTh>
                    <th className="ui-th w-[104px]">상태</th>
                    <th className="ui-th w-[132px]">측정</th>
                    <SortableTh
                      active={sortKey === 'updated'}
                      direction={sortDir}
                      onSort={() => toggleSort('updated')}
                      className="w-[104px]"
                    >
                      수정
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr
                      key={p.id}
                      data-testid={`landing-row-${p.id}`}
                      onClick={() => setSelectedId(p.id)}
                      className="cursor-pointer"
                      // 선택 행은 accent-tint 면 — 스티키 첫 열이 background:inherit라 tr에 인라인으로 건다
                      style={selected?.id === p.id ? { background: 'var(--accent-tint)' } : undefined}
                    >
                      {/* 07 …처리 — 잘린 값은 title 툴팁으로 전체 확인 가능(§05 조건 2) */}
                      <td title={`${p.title} · /${p.slug}`}>
                        <button
                          type="button"
                          className="block max-w-full truncate text-left font-semibold text-ink hover:underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/landing/${p.id}`)
                          }}
                        >
                          {p.title}
                        </button>
                        <span className="block truncate text-xs font-normal text-ink-cap">/{p.slug}</span>
                      </td>
                      <td>
                        <LevelBadge
                          level={LANDING_STATUS_LEVEL[p.status]}
                          label={LANDING_STATUS_LABELS[p.status]}
                        />
                      </td>
                      <td className="text-xs text-ink-sub">
                        {p.analytics.ga_measurement_id ?? <span className="text-ink-cap">미설정</span>}
                      </td>
                      <td className="text-xs text-ink-cap">{p.updated_at.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                <dt className="text-ink-cap">발행</dt>
                <dd className="text-ink-sub">
                  {selected.published_at ? selected.published_at.slice(0, 10) : '미발행'}
                </dd>
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
              <TableSkeleton rows={2} columns={4} />
            ) : metrics.error ? (
              <LoadFailedState message={metrics.error} onRetry={metrics.reload} />
            ) : (
              <LandingMetrics rows={metrics.data ?? []} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
