// v1.5 — 현재 행사 컨텍스트 (설계서 §2.1): 프론트는 고정 행사 ID 상수를 쓰지 않는다.
// 선택 행사는 localStorage('communicator.currentProjectId')에 보존하고, 저장값이 없으면
// 목록의 첫 진행 중(active) 행사를 기본 선택한다. 라우트는 불변 — URL prefix는 2차(§2.1).
//
// v2.8 §4-1c — 행사 하드 삭제가 생기면서 두 가지가 바뀌었다.
//   ① 저장값을 목록과 대조한다. 예전에는 "mock 단계에선 행사 삭제가 없어 무효 id가 생기지
//      않는다"는 전제로 검증을 건너뛰었는데, 그 전제가 깨졌다. 검증이 없으면 현재 행사를
//      지운 뒤 죽은 id가 localStorage에 남아 새로고침을 해도 전 화면이 404가 된다.
//   ② 행사 0건이 도달 가능한 상태가 됐다(전부 삭제 / 시드 정리 후 첫 도입). 예전의
//      "표시할 행사가 없습니다." 문구는 빠져나갈 길이 없는 막다른 길이라, 그 자리에서
//      첫 행사를 만드는 CTA로 바꾼다(§4-2c 진입점 원칙 — 다른 화면 이름만 안내로 주지 않는다).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useAsync, useMutation } from '../hooks/useAsync'
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

function clearStored(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 위와 같음
  }
}

interface ProjectContextValue {
  /** 현재 선택된 행사 — 모든 화면·컴포넌트는 이 값으로 provider를 호출한다 */
  projectId: UUID
  /** 셀렉터·S-1에서 행사 전환 (마지막 선택 기억) */
  setProject: (id: UUID) => void
  /** 셀렉터·S-1 공용 요약 목록 (§8 GET /projects) */
  summaries: ProjectSummary[]
  /** 생성·종료·삭제·설정 변경 후 요약 갱신 */
  reloadSummaries: () => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const list = useAsync(() => provider.listProjects(), [])
  const [selectedId, setSelectedId] = useState<string | null>(() => readStored())

  const summaries = useMemo(() => list.data ?? [], [list.data])

  // 저장값 대조 — 목록에 없는 id는 지워졌거나 권한을 잃은 행사다.
  //
  // 다만 "목록에 없다"만으로 판정하면 **방금 만든 행사**를 죽은 id로 오해한다. 생성 경로는
  //   createProject → reloadSummaries() → setProject(새 id) → navigate
  // 인데, reloadSummaries()는 tick만 올리고 loading=true는 이펙트에서 세워지므로 그 사이에
  // 렌더가 한 번 끼어든다. 그 렌더의 summaries는 아직 **옛 목록**이라 새 행사가 없다.
  // (2026-09-07 실측: dod20 새 행사 흐름이 이 창에서 다른 행사로 튕겼다.)
  //
  // 그래서 "선택한 뒤에 목록이 새로 도착했는가"를 함께 본다. 도착하지 않았으면 아직 검증할
  // 수 없으므로 선택을 그대로 믿고, 도착했는데도 없으면 그때 죽은 id로 판정한다.
  const dataRef = useRef<ProjectSummary[] | null>(null)
  dataRef.current = list.data
  const selectedAtRef = useRef<ProjectSummary[] | null>(null)

  const verified = list.data !== selectedAtRef.current
  const known = selectedId !== null && summaries.some((s) => s.id === selectedId)
  const usable = selectedId !== null && (known || !verified)
  const resolvedId = usable
    ? selectedId
    : (summaries.find((s) => s.status === 'active')?.id ?? summaries[0]?.id ?? null)

  // 죽은 저장값은 비운다 — 두지 않으면 새로고침 때 같은 404가 되살아난다.
  useEffect(() => {
    if (list.loading || list.error) return
    if (selectedId !== null && verified && !known) {
      clearStored()
      setSelectedId(null)
    }
  }, [list.loading, list.error, selectedId, verified, known])

  const setProject = useCallback((id: UUID) => {
    // 선택 시점의 목록을 붙잡아 둔다 — 이 목록이 바뀌기 전까지는 검증하지 않는다(위 설명).
    selectedAtRef.current = dataRef.current
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
  if (list.error) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <p className="text-sm text-negative">{list.error}</p>
      </div>
    )
  }
  if (!resolvedId) {
    return <NoProjectsYet onCreated={list.reload} setProject={setProject} />
  }

  return (
    <ProjectContext.Provider
      value={{ projectId: resolvedId, setProject, summaries, reloadSummaries: list.reload }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

/**
 * 행사 0건 — 첫 도입이거나 전부 삭제한 직후. 내부 화면은 전부 ProjectScope 안이라
 * 이 자리를 막다른 길로 두면 S-1조차 열 수 없다. 그래서 안내가 아니라 **여기서 바로**
 * 첫 행사를 만든다(S-1의 '새 행사 만들기'와 같은 경로: 자리표시 행사 생성 → S0 위저드).
 */
function NoProjectsYet({
  onCreated,
  setProject,
}: {
  onCreated: () => void
  setProject: (id: UUID) => void
}) {
  const navigate = useNavigate()
  const createMutation = useMutation(() => provider.createProject({}))

  const handleCreate = async () => {
    const created = await createMutation.run()
    if (!created) return
    onCreated()
    setProject(created.id)
    navigate('/onboarding')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="ui-card max-w-md p-8 text-center" data-testid="no-projects-empty">
        <h1 className="t-card-title">아직 행사가 없습니다</h1>
        <p className="t-caption mt-2">
          첫 행사를 만들면 개요·담당자·유형을 차례로 입력하는 안내가 이어집니다.
        </p>
        {createMutation.error && (
          <p className="mt-3 text-sm text-negative">{createMutation.error}</p>
        )}
        <button
          type="button"
          onClick={handleCreate}
          disabled={createMutation.pending}
          className="btn btn-accent mt-5"
        >
          ＋ 첫 행사 만들기
        </button>
      </div>
    </div>
  )
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject는 ProjectProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
