import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import BrandLogo from '../BrandLogo'
import ErrorAlert from '../internal/ErrorAlert'
import { canUseQuotes } from '../quote/QuoteGate'
import { useProject } from '../../context/ProjectContext'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { EVENT_TYPE_LABELS, ddayLabel } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { Quote } from '../../types/entities'
import type { ProjectSummary } from '../../types/views'

const provider = getDataProvider()

// 내부 화면 레이아웃 — 디자인지시서 v1 §4: 상단 탭 → 좌측 사이드바(고정 232px, --dark).
// 활성 항목 = 오렌지 3px 좌측 마커 + 텍스트 100%. 로고 아래에 프로젝트 셀렉터(§10 진입점 원칙).
// 모바일(<768px)은 슬림 다크 바 + 햄버거 드로어(열릴 때만 마운트 — 중복 렌더 방지).

function Icon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

// v2.0 §10 진입점 원칙: [셀렉터] → 행사 목록 → **준비**(견적 · 행사 설정) → **운영**(홈 → 디자인 보드 →
// 운영 보드 → 등록 → 일정 → 운영계획서). 견적 메뉴는 app_role admin·sales만 표시.
const NAV_TOP = [
  { to: '/projects', label: '행사 목록', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
]

const NAV_QUOTE = {
  to: '/quotes',
  label: '견적',
  icon: 'M9 7h6M9 11h6M9 15h3M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2Z',
}

const NAV_PREP = [
  {
    // v2.1 S-3 — 견적 다음, 행사 설정 앞. 랜딩은 모객 시작점이라 준비 그룹에 둔다
    to: '/landing',
    label: '랜딩보드',
    icon: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm0 4h18M7 13h6M7 17h10',
  },
  {
    to: '/settings',
    label: '행사 설정',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z',
  },
]

const NAV_OPS = [
  { to: '/', label: '홈', end: true, icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5' },
  { to: '/board/design', label: '디자인 보드', icon: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z' },
  { to: '/board/ops', label: '운영 보드', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/registration', label: '등록', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6' },
  { to: '/schedule', label: '일정', icon: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z' },
  { to: '/plan', label: '운영계획서', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6' },
  // v2.2 S-10 — 운영 그룹 **마지막**. 견적 메뉴와 달리 app_role 게이트가 없다(멤버 전원)
  { to: '/settlement', label: '정산보드', icon: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 7h8M8 11h3M13 11h3M8 15h3M13 15h3' },
]

/** 사이드바 그룹 캡션 — §10 준비/운영 */
function NavGroupCaption({ label }: { label: string }) {
  return <p className="px-5 pb-1 pt-3 text-[11px] font-semibold tracking-widest text-dark-ink/40">{label}</p>
}

function SidebarLink({
  to,
  label,
  end,
  icon,
  onNavigate,
}: {
  to: string
  label: string
  end?: boolean
  icon: string
  onNavigate?: () => void
}) {
  return (
    <NavLink to={to} end={end} onClick={onNavigate} className="block">
      {({ isActive }) => (
        <span
          className={`relative flex items-center gap-2.5 px-5 py-2 text-sm transition-colors ${
            isActive ? 'font-medium text-dark-ink' : 'text-dark-ink/70 hover:text-dark-ink'
          }`}
        >
          {isActive && (
            <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent" />
          )}
          <Icon d={icon} />
          {label}
        </span>
      )}
    </NavLink>
  )
}

// ── 프로젝트 셀렉터 (§10 진입점 원칙) ────────────────────────────────
// 행 부제: 세팅 미완료 > 미결 컨펌 > 지연 > 유형만, 순으로 한 줄만 표시한다.
function selectorSubtitle(s: ProjectSummary): string {
  const type = EVENT_TYPE_LABELS[s.event_type]
  if (!s.onboarded) return `${type} · 세팅 중`
  if (s.pending_approvals > 0) return `${type} · 미결 컨펌 ${s.pending_approvals}`
  if (s.delayed_tasks > 0) return `${type} · 지연 ${s.delayed_tasks}`
  return type
}

function ProjectRow({
  summary,
  isCurrent,
  onSelect,
}: {
  summary: ProjectSummary
  isCurrent: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(summary.id)}
      className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left ${
        isCurrent ? 'bg-accent-tint' : 'hover:bg-track'
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{summary.name}</span>
        <span className="block truncate text-xs text-ink-sub">{selectorSubtitle(summary)}</span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
          isCurrent ? 'bg-accent-tint text-accent-deep' : 'bg-track text-ink-sub'
        }`}
      >
        {summary.event_date ? ddayLabel(summary.event_date) : '일정 미정'}
      </span>
    </button>
  )
}

function ProjectSelector({ onNavigate, canQuotes }: { onNavigate?: () => void; canQuotes: boolean }) {
  const { projectId, setProject, summaries, reloadSummaries } = useProject()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const createMutation = useMutation(() => provider.createProject({}))
  // v2.0 §10 — "견적만 있음 · 행사 미생성" 그룹 (admin·sales만, 열 때 지연 로드)
  const [unlinkedQuotes, setUnlinkedQuotes] = useState<Quote[]>([])
  useEffect(() => {
    if (!open || !canQuotes) return
    let cancelled = false
    provider
      .listQuotes()
      .then((quotes) => {
        if (!cancelled) setUnlinkedQuotes(quotes.filter((q) => !q.project_id))
      })
      .catch(() => {
        // 권한·로드 실패 시 그룹 미표시
      })
    return () => {
      cancelled = true
    }
  }, [open, canQuotes])

  const current = summaries.find((s) => s.id === projectId)
  const active = summaries.filter((s) => s.status === 'active')
  const closed = summaries.filter((s) => s.status === 'closed')

  const close = () => setOpen(false)

  const handleSelect = (id: string) => {
    setProject(id)
    close()
    onNavigate?.()
  }

  const handleCreate = async () => {
    const created = await createMutation.run()
    if (!created) return
    reloadSummaries()
    setProject(created.id)
    close()
    onNavigate?.()
    navigate('/onboarding')
  }

  const handleViewAll = () => {
    close()
    onNavigate?.()
    navigate('/projects')
  }

  return (
    <div className="relative px-5 pb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-dark-ink/15 bg-dark-ink/10 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[11px] text-dark-ink/60">현재 행사</span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-dark-ink">
            {current?.name ?? '행사 선택'}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-dark-ink/60">
          ▾
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="셀렉터 닫기"
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          {/* 3.10.1 R4 — 데스크톱은 사이드바 밖으로 300px 오버레이(행사명 truncate 여유), 모바일 드로어는 현행(좌우 20px) 유지 */}
          <div className="absolute left-5 right-5 top-full z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-[10px] border border-border bg-card p-2 shadow-card md:left-3 md:right-auto md:w-[300px]">
            {active.length > 0 && (
              <div className="mb-1">
                <p className="t-caption px-2 py-1">진행 중 {active.length}</p>
                {active.map((s) => (
                  <ProjectRow key={s.id} summary={s} isCurrent={s.id === projectId} onSelect={handleSelect} />
                ))}
              </div>
            )}
            {closed.length > 0 && (
              <div className="mb-1">
                <p className="t-caption px-2 py-1">종료 {closed.length}</p>
                {closed.map((s) => (
                  <ProjectRow key={s.id} summary={s} isCurrent={s.id === projectId} onSelect={handleSelect} />
                ))}
              </div>
            )}
            {canQuotes && unlinkedQuotes.length > 0 && (
              <div className="mb-1">
                <p className="t-caption px-2 py-1">견적만 있음 · 행사 미생성 {unlinkedQuotes.length}</p>
                {unlinkedQuotes.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      close()
                      onNavigate?.()
                      navigate('/quotes')
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-track"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{q.title}</span>
                      <span className="block truncate text-xs text-ink-sub">견적 v{q.version} · 행사 미생성</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">S-2</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-1 space-y-0.5 border-t border-border pt-1">
              <button
                type="button"
                onClick={handleCreate}
                disabled={createMutation.pending}
                className="block w-full rounded-md px-2.5 py-2 text-left text-sm font-semibold text-accent-deep hover:bg-track"
              >
                ＋ 새 행사 만들기
              </button>
              <button
                type="button"
                onClick={handleViewAll}
                className="block w-full rounded-md px-2.5 py-2 text-left text-sm text-ink-sub hover:bg-track"
              >
                전체 행사 목록 보기 →
              </button>
            </div>
            <ErrorAlert message={createMutation.error} />
          </div>
        </>
      )}
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  // v2.0 — 견적 메뉴는 app_role admin·sales만 (§10). staff는 메뉴 자체 미표시(DoD 25)
  const me = useAsync(() => provider.getCurrentUser(), [])
  const canQuotes = !!me.data && canUseQuotes(me.data)

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-3 pt-6">
        <BrandLogo variant="offwhite" className="h-5 w-auto" />
      </div>
      <ProjectSelector onNavigate={onNavigate} canQuotes={canQuotes} />
      <nav className="flex-1 space-y-0.5 overflow-y-auto py-1">
        {NAV_TOP.map((item) => (
          <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
        ))}
        <NavGroupCaption label="준비" />
        {canQuotes && <SidebarLink {...NAV_QUOTE} onNavigate={onNavigate} />}
        {NAV_PREP.map((item) => (
          <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
        ))}
        <NavGroupCaption label="운영" />
        {NAV_OPS.map((item) => (
          <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-canvas">{children}</div>
}

export default function InternalLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <Shell>
      {/* 데스크톱 사이드바 (≥768px) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] bg-dark md:block">
        <SidebarContent />
      </aside>

      {/* 모바일 슬림 다크 바 + 드로어 (<768px) */}
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-dark px-4 py-3 md:hidden">
        <button
          type="button"
          aria-label="메뉴 열기"
          onClick={() => setDrawerOpen(true)}
          className="-ml-1 flex size-9 items-center justify-center rounded-md text-dark-ink"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <BrandLogo variant="offwhite" className="h-5 w-auto" />
      </header>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-dark/60"
          />
          <div className="absolute inset-y-0 left-0 w-[232px] bg-dark shadow-card">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* 콘텐츠 — §4: --canvas 배경, max-width 1120 중앙 */}
      <div className="md:pl-[232px]">
        <main className="mx-auto max-w-[1120px]">
          <Outlet />
        </main>
      </div>
    </Shell>
  )
}
