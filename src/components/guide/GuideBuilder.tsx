// v2.5 §10.2·§23 운영가이드 빌더 → v2.13 §23.5 (Phase 3.24 PR-A · 디자인지시서 §7-2.13) 현장 운영 12섹션.
// 본문 = 왼쪽 섹션 목록(묶음 = 준비 · 당일 · 안전·공통 · 기타 — 채움 상태) + 섹션 카드.
// PR-B(§7-2.14): 옛 문서 머리(StructuredDocHeader)를 걷고 위에 요약 줄(섹션 n/m 채움 · 비어 있는 섹션 ·
// 원본 바뀜 · 연락망 포함 · 인쇄)만 둔다 — 제목·상태·컨펌 발송은 항목 상세 머리와 '다음 단계' 카드가 맡는다.
//
// 표 섹션(data): 설치·철거 · 인력·콜타임 · 무전·지휘 · 역할 분담 · D-day 진행표 · 구간별 체크리스트 ·
// 등록 운영 · VIP 의전 · 안전관리 · (새 문서의) 비상 대응 — 저장하면 provider가 content를 data에서 다시 만든다.
// 마크다운 섹션: 존별 운영(원본 연동 — R-O4 stale 그대로) · 연락망(R-O6) · 옛 문서의 역할별 체크리스트·비상 대응·커스텀.
//
// 옛 문서(4섹션)는 그대로 열린다 — '뼈대 추가'를 눌러야 빠진 섹션이 정본 순서 자리에 끼워진다(기존 섹션 순서·내용 불변).
import { useState } from 'react'
import { flushSync } from 'react-dom'
import ErrorAlert from '../internal/ErrorAlert'
import ProgressBar from '../internal/ProgressBar'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { CONTACTS_SECTION_PLACEHOLDER, assembleZoneSectionContent } from '../../lib/guideAssembly'
import {
  GUIDE_GROUP_LABELS,
  GUIDE_GROUP_ORDER,
  GUIDE_KIND_META,
  guideSkeletonInput,
  guideSummary,
  isGuideSectionEmpty,
  mergeGuideSkeleton,
  missingGuideKinds,
} from '../../lib/guideStructured'
import { getDataProvider } from '../../providers'
import type { GuideSection, GuideSectionData } from '../../types/entities'
import type { GuideSectionKind } from '../../types/enums'
import type { GuideSectionInput } from '../../types/views'
import GuideSectionCard from './GuideSectionCard'

const provider = getDataProvider()

/** 현재 목록을 그대로 GuideSectionInput으로 편다 — 모든 변경(추가·삭제·정렬·수정)은
 *  이 배열을 한 군데만 고쳐 saveGuideSections로 통째 전송하는 방식으로 표현한다. */
function toInput(sections: readonly GuideSection[]): GuideSectionInput[] {
  return sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    content: s.content,
    source_ref: s.source_ref,
    source_stale: s.source_stale,
    data: s.data ?? null,
  }))
}

export default function GuideBuilder({
  deliverableId,
  canEdit,
}: {
  deliverableId: string
  /** pm·ops만 true — §8.2 guide-sections 쓰기 권한 */
  canEdit: boolean
}) {
  const deliverable = useAsync(() => provider.getDeliverable(deliverableId), [deliverableId])
  const sections = useAsync(() => provider.listGuideSections(deliverableId), [deliverableId])
  const [includeContacts, setIncludeContacts] = useState(false)
  // 마크다운 본문 펼침(3.16.4 — 기본 2줄 미리보기) — 인쇄 시 전 섹션을 펼쳐야 하므로 부모가 관리한다
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const list = sections.data ?? []
  const projectId = deliverable.data?.project_id ?? null
  const project = useAsync(
    () => (projectId ? provider.getProject(projectId) : Promise.resolve(null)),
    [projectId],
  )
  const programSessions = useAsync(
    () => (projectId ? provider.listProgramSessions(projectId) : Promise.resolve([])),
    [projectId],
  )
  const sessionList = programSessions.data ?? []

  const seed = useMutation(() => provider.seedGuideFromSources(deliverableId))
  const save = useMutation((next: GuideSectionInput[]) => provider.saveGuideSections(deliverableId, next))
  const [skeletonError, setSkeletonError] = useState<string | null>(null)
  const [addingSkeleton, setAddingSkeleton] = useState(false)

  const replace = async (next: GuideSectionInput[]) => {
    const result = await save.run(next)
    if (result) sections.reload()
    return result
  }

  const handleSeed = async () => {
    const result = await seed.run()
    if (result) sections.reload()
  }

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= list.length) return
    const next = toInput(list)
    ;[next[index], next[j]] = [next[j], next[index]]
    void replace(next)
  }

  const remove = (id: string) => {
    if (!window.confirm('이 섹션을 삭제하시겠습니까?')) return
    void replace(toInput(list.filter((s) => s.id !== id)))
  }

  const addSection = () => {
    void replace([
      ...toInput(list),
      { kind: 'custom', title: '새 섹션', content: '', source_ref: null, source_stale: false, data: null },
    ])
  }

  const saveMarkdown = (id: string, patch: { title: string; content: string }) =>
    replace(toInput(list).map((inp, i) => (list[i].id === id ? { ...inp, ...patch } : inp)))

  const saveData = (id: string, patch: { title: string; data: GuideSectionData }) =>
    replace(toInput(list).map((inp, i) => (list[i].id === id ? { ...inp, title: patch.title, data: patch.data } : inp)))

  const applyDiff = (id: string, newContent: string) =>
    replace(
      toInput(list).map((inp, i) =>
        list[i].id === id ? { ...inp, content: newContent, source_stale: false } : inp,
      ),
    )

  const missing = missingGuideKinds(list)

  /** 옛 문서 — 빠진 섹션만 뼈대로 끼워 넣는다(행사 일시·장소·프로그램표·담당자 수로 채움). 기존 섹션은 그대로 */
  const addSkeleton = async () => {
    if (!projectId || missing.length === 0) return
    setSkeletonError(null)
    setAddingSkeleton(true)
    try {
      const [proj, sessionsNow, members, opsItems] = await Promise.all([
        provider.getProject(projectId),
        provider.listProgramSessions(projectId),
        provider.listMembers(projectId),
        missing.includes('zone') ? provider.listDeliverables(projectId, { area: 'ops' }) : Promise.resolve([]),
      ])
      const ctx = { project: proj, sessions: sessionsNow, memberCount: members.length }
      const additions: GuideSectionInput[] = missing.flatMap((kind): GuideSectionInput[] => {
        if (kind === 'zone') {
          return [
            {
              kind,
              title: GUIDE_KIND_META.zone.title,
              content: assembleZoneSectionContent(opsItems),
              source_ref: 'zone_items',
              source_stale: false,
              data: null,
            },
          ]
        }
        if (kind === 'contacts') {
          return [
            { kind, title: GUIDE_KIND_META.contacts.title, content: CONTACTS_SECTION_PLACEHOLDER, source_ref: null, source_stale: false, data: null },
          ]
        }
        const input = guideSkeletonInput(kind, ctx)
        return input ? [input] : []
      })
      await replace(mergeGuideSkeleton(toInput(list), additions))
    } catch (e) {
      setSkeletonError(e instanceof Error ? e.message : '뼈대를 만들지 못했습니다.')
    } finally {
      setAddingSkeleton(false)
    }
  }

  /** 인쇄 — 미리보기로 접힌 섹션 본문을 전부 펼친 뒤 인쇄한다(스태프 배포용 전문 출력) */
  const handlePrint = () => {
    flushSync(() => {
      setExpanded(new Set(list.map((s) => s.id)))
    })
    window.print()
  }

  const summary = guideSummary(list)
  const filled = summary.filled
  const headcount = project.data?.expected_headcount ?? null
  const emptyTitles = list.filter((s) => isGuideSectionEmpty(s)).map((s) => s.title)
  const staleTitles = list.filter((s) => s.source_stale).map((s) => s.title)

  return (
    <div className="@container space-y-4">
      <section
        aria-label="가이드 요약"
        className="ui-card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold text-ink" data-testid="guide-summary">
            섹션 {summary.filled} / {summary.total} 채움
          </span>
          <span className="w-40">
            <ProgressBar done={summary.filled} total={summary.total} hideValue />
          </span>
          {emptyTitles.length > 0 && list.length > 0 && (
            <span className="t-caption min-w-0">비어 있음: {emptyTitles.join(' · ')}</span>
          )}
          {staleTitles.map((t) => (
            <span
              key={t}
              className="inline-flex whitespace-nowrap rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-deep"
            >
              {t} — 원본 바뀜
            </span>
          ))}
        </div>
        <div className="plan-print-hidden flex flex-wrap items-center gap-3">
          <label className="ui-check-row items-center text-xs text-ink-sub">
            <input
              type="checkbox"
              checked={includeContacts}
              onChange={(e) => setIncludeContacts(e.target.checked)}
              className="ui-check"
            />
            연락망 포함(인쇄)
          </label>
          <button type="button" onClick={handlePrint} className="btn btn-ghost btn-sm">
            인쇄 · 스태프 배포용
          </button>
        </div>
      </section>

      <div className="ui-card p-5">
        <ErrorAlert message={deliverable.error} />
        <ErrorAlert message={sections.error} />
        <ErrorAlert message={seed.error} />
        <ErrorAlert message={save.error} />
        <ErrorAlert message={skeletonError} />

        {sections.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}

        {!sections.loading && list.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-ink-cap">아직 섹션이 없습니다.</p>
            <p className="mt-1 text-xs text-ink-cap">
              설치·철거부터 비상 대응까지 현장 운영 12개 섹션을 행사 일시·장소·프로그램표로 채운 뼈대로 만듭니다.
            </p>
            {canEdit && (
              <button type="button" onClick={handleSeed} disabled={seed.pending} className="btn btn-primary mt-3">
                기본 섹션 만들기
              </button>
            )}
          </div>
        )}

        {list.length > 0 && canEdit && missing.length > 0 && (
          <div
            data-testid="guide-skeleton-banner"
            className="plan-print-hidden mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-4 py-3"
          >
            <p className="min-w-0 text-sm text-ink-sub">
              현장 운영 섹션 {missing.length}개를 뼈대로 추가할 수 있습니다 —{' '}
              <span className="text-ink">{missing.map((k) => GUIDE_KIND_META[k].title).join(' · ')}</span>. 지금 섹션은 그대로 둡니다.
            </p>
            <button type="button" onClick={addSkeleton} disabled={addingSkeleton || save.pending} className="btn btn-ghost btn-sm">
              뼈대 추가
            </button>
          </div>
        )}

        {list.length > 0 && (
          <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[200px_minmax(0,1fr)] @4xl:items-start">
            <GuideRail sections={list} filled={filled} />
            <div className="min-w-0 space-y-3">
              {list.map((s, i) => (
                <GuideSectionCard
                  key={s.id}
                  section={s}
                  number={i + 1}
                  isFirst={i === 0}
                  isLast={i === list.length - 1}
                  canEdit={canEdit}
                  projectId={projectId}
                  sessions={sessionList}
                  headcount={headcount}
                  includeContactsInPrint={includeContacts}
                  saving={save.pending}
                  expanded={expanded.has(s.id)}
                  onToggleExpanded={() => toggleExpanded(s.id)}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onDelete={() => remove(s.id)}
                  onSaveMarkdown={saveMarkdown}
                  onSaveData={saveData}
                  onApplyDiff={applyDiff}
                />
              ))}
              {canEdit && (
                <button
                  type="button"
                  onClick={addSection}
                  disabled={save.pending}
                  className="plan-print-hidden btn btn-ghost btn-sm"
                >
                  + 섹션 추가
                </button>
              )}
            </div>
          </div>
        )}

        {/* 목업 화면 C 하단 각주 카드 */}
        <div className="plan-print-hidden mt-4 rounded-lg border border-dashed border-border-strong bg-canvas px-4 py-3 text-xs leading-relaxed text-ink-sub">
          연동 필드는 원본(존운영·R&R)이 바뀌면 &quot;갱신 있음&quot;으로 표시된 뒤 확인을 거쳐
          반영됩니다 — 자동 덮어쓰기 없음(기준 견적 갱신과 같은 차이 확인 패턴). 개인정보는
          화면·운영계획서 조립에 넣지 않고 인쇄 스냅숏에만 포함 옵션입니다.
        </div>
      </div>
    </div>
  )
}

// ── 섹션 목록(묶음별 · 채움 상태) — 넓은 칸에서만(좁은 보드 인라인에서는 카드만) ─────────────
function GuideRail({ sections, filled }: { sections: readonly GuideSection[]; filled: number }) {
  const groupOf = (kind: GuideSectionKind) => GUIDE_KIND_META[kind]?.group ?? 'other'
  return (
    <nav aria-label="섹션 목록" className="plan-print-hidden hidden rounded-lg border border-border p-2 @4xl:sticky @4xl:top-4 @4xl:block">
      <p className="px-2 pb-1 pt-1 text-xs font-semibold text-ink" data-testid="guide-filled">
        섹션 {filled} / {sections.length} 채움
      </p>
      {GUIDE_GROUP_ORDER.map((g) => {
        const items = sections.map((s, i) => ({ s, i })).filter(({ s }) => groupOf(s.kind) === g)
        if (items.length === 0) return null
        return (
          <div key={g}>
            <p className="px-2 pb-1 pt-2 text-[11px] font-medium tracking-wide text-ink-cap">{GUIDE_GROUP_LABELS[g]}</p>
            <ul>
              {items.map(({ s, i }) => {
                const state = s.source_stale ? 'stale' : isGuideSectionEmpty(s) ? 'empty' : 'ok'
                return (
                  <li key={s.id}>
                    <a
                      href={`#guide-sec-${s.id}`}
                      // 주소(해시)는 바꾸지 않고 카드로만 스크롤 — 데모 아티팩트는 해시 라우팅이라 '#…'가 곧 화면 이동이 된다
                      onClick={(e) => {
                        e.preventDefault()
                        document.getElementById(`guide-sec-${s.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
                      }}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-track"
                    >
                      <span className="w-5 text-[11px] tabular-nums text-ink-cap">{String(i + 1).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      {state === 'ok' && (
                        <span className="text-xs text-positive" aria-label="채움">
                          ✓
                        </span>
                      )}
                      {state === 'empty' && <span className="whitespace-nowrap text-xs text-ink-cap">비어 있음</span>}
                      {state === 'stale' && <span className="whitespace-nowrap text-xs font-semibold text-accent-deep">바뀜</span>}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
