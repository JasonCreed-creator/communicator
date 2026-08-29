// S-3 랜딩 빌더 (v2.1 §10) — 섹션 조립 · 측정 설정 · 미리보기 · 단일 HTML 내보내기.
// autofill이 켜진 섹션은 행사 데이터(개요·세션·존)에서 조립되므로 여기서 직접 입력하지 않는다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../components/internal/PageHeader'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { autofillSections, type AutofillSource } from '../lib/landingAutofill'
import {
  buildLandingHtml,
  isValidGaId,
  isValidGtmId,
  landingFileName,
} from '../lib/landingExport'
import {
  ITEM_FIELD_LABELS,
  LANDING_SECTION_LABELS,
  SECTION_SUPPORTS_AUTOFILL,
  SECTION_USES_ITEMS,
} from '../lib/landingTemplate'
import { getDataProvider } from '../providers'
import type { LandingPage, LandingSection } from '../types/entities'

const provider = getDataProvider()

/** 브라우저에서 파일로 저장 — 외부 의존 없이 Blob + a[download] */
function downloadHtml(name: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function LandingEditorPage() {
  const { landingId = '' } = useParams()
  const navigate = useNavigate()
  const { projectId } = useProject()

  const loaded = useAsync(() => provider.getLandingPage(landingId), [landingId])
  const [page, setPage] = useState<LandingPage | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (loaded.data) setPage(loaded.data)
  }, [loaded.data])

  // autofill 소스 — 행사 개요·세션·존 운영 항목
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const sessions = useAsync(() => provider.listProgramSessions(projectId), [projectId])
  const deliverables = useAsync(() => provider.listDeliverables(projectId, { area: 'ops' }), [projectId])

  const source: AutofillSource | null = useMemo(() => {
    if (!project.data) return null
    return {
      project: project.data,
      sessions: sessions.data ?? [],
      zoneDeliverables: (deliverables.data ?? []).filter((d) => d.category?.includes('존')),
    }
  }, [project.data, sessions.data, deliverables.data])

  /** 미리보기·내보내기에 쓰는 최종 섹션 — autofill을 한 번 통과시킨 결과 */
  const resolvedSections = useMemo(() => {
    if (!page) return []
    return source ? autofillSections(page.sections, source) : page.sections
  }, [page, source])

  const patch = useCallback((fn: (p: LandingPage) => LandingPage) => {
    setPage((prev) => (prev ? fn(prev) : prev))
    setDirty(true)
    setNotice(null)
  }, [])

  const patchSection = useCallback(
    (id: string, fn: (s: LandingSection) => LandingSection) => {
      patch((p) => ({ ...p, sections: p.sections.map((s) => (s.id === id ? fn(s) : s)) }))
    },
    [patch],
  )

  const moveSection = (id: string, dir: -1 | 1) => {
    patch((p) => {
      const arr = [...p.sections]
      const i = arr.findIndex((s) => s.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= arr.length) return p
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...p, sections: arr.map((s, k) => ({ ...s, sort_order: k + 1 })) }
    })
  }

  const save = async () => {
    if (!page) return
    setSaving(true)
    setError(null)
    try {
      const saved = await provider.updateLandingPage(page.id, {
        title: page.title,
        slug: page.slug,
        sticky_nav: page.sticky_nav,
        cta_label: page.cta_label,
        submit_target: page.submit_target,
        external_submit_url: page.external_submit_url,
        analytics: page.analytics,
        sections: page.sections,
        form_fields: page.form_fields,
        consents: page.consents,
      })
      setPage(saved)
      setDirty(false)
      setNotice('저장했습니다.')
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const exportHtml = () => {
    if (!page) return
    downloadHtml(landingFileName(page), buildLandingHtml(page, resolvedSections))
  }

  const publish = async () => {
    if (!page) return
    const url = window.prompt('내보낸 HTML을 올린 공개 주소를 입력하세요', page.public_url ?? 'https://')
    if (url === null) return
    setError(null)
    try {
      setPage(await provider.publishLandingPage(page.id, url.trim() || null))
      setNotice(url.trim() ? '발행으로 표시했습니다.' : '초안으로 되돌렸습니다.')
    } catch (e) {
      setError(e instanceof Error ? e.message : '발행 표시에 실패했습니다.')
    }
  }

  if (loaded.loading) return <p className="text-sm text-ink-sub">불러오는 중…</p>
  if (loaded.error) return <p className="text-sm text-negative">{loaded.error}</p>
  if (!page) return null

  const gaBad = !!page.analytics.ga_measurement_id && !isValidGaId(page.analytics.ga_measurement_id)
  const gtmBad = !!page.analytics.gtm_container_id && !isValidGtmId(page.analytics.gtm_container_id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        caption="준비 · S-3"
        title={page.title}
        action={
          <>
            <button type="button" className="btn" onClick={() => navigate('/landing')}>
              ← 랜딩보드
            </button>
            <button type="button" className="btn" onClick={() => setPreviewOpen((v) => !v)}>
              {previewOpen ? '미리보기 닫기' : '미리보기'}
            </button>
            <button type="button" className="btn" onClick={exportHtml}>
              HTML 내려받기
            </button>
            <button type="button" className="btn" onClick={publish}>
              발행 표시
            </button>
            <button type="button" className="btn btn-accent" onClick={save} disabled={saving || !dirty}>
              {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
            </button>
          </>
        }
      />

      {notice && <p className="text-sm text-positive">{notice}</p>}
      {error && <p className="text-sm text-negative">{error}</p>}

      {previewOpen && (
        <iframe
          title="랜딩 미리보기"
          className="h-[70vh] w-full rounded-[10px] border border-border bg-white"
          srcDoc={buildLandingHtml(page, resolvedSections)}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 좌: 섹션 목록 */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-ink">섹션 {page.sections.length}개</h2>
          {page.sections.map((s, i) => {
            const resolved = resolvedSections.find((r) => r.id === s.id) ?? s
            const labels = ITEM_FIELD_LABELS[s.type]
            return (
              <section key={s.id} className="ui-card p-4">
                <header className="flex flex-wrap items-center gap-2">
                  <span className="t-caption">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-sm font-bold text-ink">{LANDING_SECTION_LABELS[s.type]}</span>
                  {s.autofill && (
                    <span className="rounded bg-steel-tint px-1.5 py-0.5 text-[10px] font-bold text-steel">
                      행사 데이터 연동
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button type="button" className="btn px-2 py-1 text-xs" onClick={() => moveSection(s.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="btn px-2 py-1 text-xs" onClick={() => moveSection(s.id, 1)}>
                      ↓
                    </button>
                    <label className="ui-check-row ml-2 items-center text-xs text-ink-sub">
                      <input
                        type="checkbox"
                        className="ui-check"
                        checked={s.visible}
                        onChange={(e) => patchSection(s.id, (x) => ({ ...x, visible: e.target.checked }))}
                      />
                      노출
                    </label>
                  </div>
                </header>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 t-caption">
                    헤드라인
                    <input
                      className="ui-input"
                      value={s.headline ?? ''}
                      placeholder={s.autofill ? '(행사 데이터에서 자동)' : ''}
                      onChange={(e) =>
                        patchSection(s.id, (x) => ({ ...x, headline: e.target.value || null }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 t-caption">
                    보조 카피
                    <input
                      className="ui-input"
                      value={s.body ?? ''}
                      placeholder={s.autofill ? '(행사 데이터에서 자동)' : ''}
                      onChange={(e) => patchSection(s.id, (x) => ({ ...x, body: e.target.value || null }))}
                    />
                  </label>
                </div>

                {SECTION_SUPPORTS_AUTOFILL[s.type] && (
                  <label className="ui-check-row mt-2 items-center text-xs text-ink-sub">
                    <input
                      type="checkbox"
                      className="ui-check"
                      checked={s.autofill}
                      onChange={(e) => patchSection(s.id, (x) => ({ ...x, autofill: e.target.checked }))}
                    />
                    행사 데이터로 자동 채우기 (끄면 아래 항목을 직접 편집합니다)
                  </label>
                )}

                {SECTION_USES_ITEMS[s.type] && (
                  <div className="mt-3">
                    {s.autofill ? (
                      <div className="rounded-[8px] bg-track p-3 text-xs text-ink-sub">
                        행사 데이터에서 {resolved.items.length}건이 조립됩니다
                        {resolved.items.length > 0 && (
                          <span className="text-ink-cap">
                            {' '}
                            · {resolved.items.slice(0, 3).map((it) => it.label).join(' / ')}
                            {resolved.items.length > 3 ? ' …' : ''}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {s.items.map((it) => (
                          <div key={it.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                            <input
                              className="ui-input"
                              placeholder={labels.label}
                              value={it.label}
                              onChange={(e) =>
                                patchSection(s.id, (x) => ({
                                  ...x,
                                  items: x.items.map((y) =>
                                    y.id === it.id ? { ...y, label: e.target.value } : y,
                                  ),
                                }))
                              }
                            />
                            <input
                              className="ui-input"
                              placeholder={labels.detail}
                              value={it.detail ?? ''}
                              onChange={(e) =>
                                patchSection(s.id, (x) => ({
                                  ...x,
                                  items: x.items.map((y) =>
                                    y.id === it.id ? { ...y, detail: e.target.value || null } : y,
                                  ),
                                }))
                              }
                            />
                            <input
                              className="ui-input"
                              placeholder={labels.meta}
                              value={it.meta ?? ''}
                              onChange={(e) =>
                                patchSection(s.id, (x) => ({
                                  ...x,
                                  items: x.items.map((y) =>
                                    y.id === it.id ? { ...y, meta: e.target.value || null } : y,
                                  ),
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn px-2 py-1 text-xs"
                              onClick={() =>
                                patchSection(s.id, (x) => ({
                                  ...x,
                                  items: x.items.filter((y) => y.id !== it.id),
                                }))
                              }
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn self-start px-3 py-1 text-xs"
                          onClick={() =>
                            patchSection(s.id, (x) => ({
                              ...x,
                              items: [
                                ...x.items,
                                {
                                  id: `${x.id}-new-${x.items.length + 1}-${Date.now().toString(36)}`,
                                  label: '',
                                  detail: null,
                                  meta: null,
                                  image_url: null,
                                  sort_order: x.items.length + 1,
                                },
                              ],
                            }))
                          }
                        >
                          ＋ 항목 추가
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {/* 우: 페이지 설정 · 측정 */}
        <aside className="flex flex-col gap-4">
          <div className="ui-card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-bold text-ink">페이지 설정</h2>
            <label className="flex flex-col gap-1 t-caption">
              제목
              <input
                className="ui-input"
                value={page.title}
                onChange={(e) => patch((p) => ({ ...p, title: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 t-caption">
              slug (파일명·주소)
              <input
                className="ui-input"
                value={page.slug}
                onChange={(e) => patch((p) => ({ ...p, slug: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 t-caption">
              CTA 라벨
              <input
                className="ui-input"
                value={page.cta_label}
                onChange={(e) => patch((p) => ({ ...p, cta_label: e.target.value }))}
              />
            </label>
            <label className="ui-check-row items-center text-xs text-ink-sub">
              <input
                type="checkbox"
                className="ui-check"
                checked={page.sticky_nav}
                onChange={(e) => patch((p) => ({ ...p, sticky_nav: e.target.checked }))}
              />
              상단 고정 내비 노출
            </label>
            <label className="flex flex-col gap-1 t-caption">
              폼 제출 대상
              <select
                className="ui-input ui-select"
                value={page.submit_target}
                onChange={(e) =>
                  patch((p) => ({ ...p, submit_target: e.target.value as LandingPage['submit_target'] }))
                }
              >
                <option value="registration">등록(S4)으로 유입</option>
                <option value="external">외부 URL로 제출</option>
              </select>
            </label>
            {page.submit_target === 'external' && (
              <label className="flex flex-col gap-1 t-caption">
                제출 URL
                <input
                  className="ui-input"
                  value={page.external_submit_url ?? ''}
                  onChange={(e) =>
                    patch((p) => ({ ...p, external_submit_url: e.target.value || null }))
                  }
                />
              </label>
            )}
          </div>

          <div className="ui-card flex flex-col gap-3 p-4">
            <h2 className="text-sm font-bold text-ink">측정 (GA)</h2>
            <label className="flex flex-col gap-1 t-caption">
              GA4 측정 ID
              <input
                className="ui-input"
                placeholder="G-XXXXXXXXXX"
                value={page.analytics.ga_measurement_id ?? ''}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    analytics: { ...p.analytics, ga_measurement_id: e.target.value || null },
                  }))
                }
              />
            </label>
            {gaBad && <p className="text-xs text-negative">형식이 올바르지 않아 스크립트가 삽입되지 않습니다.</p>}
            <label className="flex flex-col gap-1 t-caption">
              GTM 컨테이너 ID (선택)
              <input
                className="ui-input"
                placeholder="GTM-XXXXXXX"
                value={page.analytics.gtm_container_id ?? ''}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    analytics: { ...p.analytics, gtm_container_id: e.target.value || null },
                  }))
                }
              />
            </label>
            {gtmBad && <p className="text-xs text-negative">형식이 올바르지 않아 스크립트가 삽입되지 않습니다.</p>}
            <label className="flex flex-col gap-1 t-caption">
              전환 이벤트 이름
              <input
                className="ui-input"
                value={page.analytics.conversion_event}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    analytics: { ...p.analytics, conversion_event: e.target.value },
                  }))
                }
              />
            </label>
            <p className="text-xs text-ink-cap">
              내려받은 HTML의 &lt;head&gt;에 삽입됩니다. 폼을 열면 <code>form_start</code>, 제출하면 위
              전환 이벤트가 발화합니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
