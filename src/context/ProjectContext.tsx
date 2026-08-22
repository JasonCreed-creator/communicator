// v1.5 — 현재 행사 컨텍스트 (설계서 §2.1): 프론트는 PROJECT_ID 상수를 쓰지 않는다.
// 선택 행사는 localStorage('communicator.currentProjectId')에 보존하고, 저장값이 없으면
// 목록의 첫 진행 중(active) 행사를 기본 선택한다. 라우트는 불변 — URL prefix는 2차(§2.1).
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAsync } from '../hooks/useAsync'
import { getDataProvider } from '../providers'
import type { UUID } from '../types/entities'
import type { ProjectSummary } from '../types/views'

const provider = getDataProvider()
const STORAGE_KEY = 'communicator.currentProjectId'

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // 저장 불가 환경(사생활 보호 모드 등)에서는 세션 내 선택만 유지
  }
}

interface ProjectContextValue {
  /** 현재 선택된 행사 — 모든 화면·컴포넌트는 이 값으로 provider를 호출한다 */
  projectId: UUID
  /** 셀렉터·S-1에서 행사 전환 (마지막 선택 기억) */
  setProject: (id: UUID) => void
  /** 셀렉터·S-1 공용 요약 목록 (§8 GET /projects) */
  summaries: ProjectSummary[]
  /** 생성·종료·설정 변경 후 요약 갱신 */
  reloadSummaries: () => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const list = useAsync(() => provider.listProjects(), [])
  const [selectedId, setSelectedId] = useState<string | null>(() => readStored())

  const summaries = useMemo(() => list.data ?? [], [list.data])
  // 새로 만든 행사를 즉시 신뢰해야 하므로(목록 재조회 전) 저장값 검증은 하지 않는다 —
  // mock 단계에선 행사 삭제가 없어 무효 id가 생기지 않고, 생겨도 화면 404 + 셀렉터로 복구 가능.
  const resolvedId = selectedId ?? summaries.find((s) => s.status === 'active')?.id ?? summaries[0]?.id ?? null

  const setProject = useCallback((id: UUID) => {
    setSelectedId(id)
    writeStored(id)
  }, [])

  if (list.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-ink-cap">불러오는 중…</p>
      </div>
    )
  }
  if (list.error || !resolvedId) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <p className="text-sm text-negative">{list.error ?? '표시할 행사가 없습니다.'}</p>
      </div>
    )
  }

  return (
    <ProjectContext.Provider
      value={{ projectId: resolvedId, setProject, summaries, reloadSummaries: list.reload }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject는 ProjectProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
