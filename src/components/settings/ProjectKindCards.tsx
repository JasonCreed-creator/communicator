// 행사 설정 ③ 성격 카드 (설계서 v2.4 §10.1 화면 A) — 대행형/주최형 선택형 카드.
// 전환은 표시 계층만 바꾼다(R-H1) — 확인 다이얼로그로 안내 후 updateProject({kind})만 호출한다.
import { useMutation } from '../../hooks/useAsync'
import { PROJECT_KIND_LABELS } from '../../lib/labels'
import { getDataProvider } from '../../providers'
import type { UUID } from '../../types/entities'
import type { ProjectKind } from '../../types/enums'
import ErrorAlert from '../internal/ErrorAlert'

const provider = getDataProvider()

const KIND_BLURB: Record<ProjectKind, string> = {
  agency: '발주처의 의뢰를 받아 대행 운영합니다 — 컨펌 큐·발주처 연락처를 씁니다.',
  host: '직접 파트너사를 모집·운영합니다 — 파트너 등급·제출 포털·파트너 보드를 씁니다.',
}

export default function ProjectKindCards({
  projectId,
  kind,
  onChanged,
  readOnly = false,
}: {
  projectId: UUID
  kind: ProjectKind
  onChanged: () => void
  readOnly?: boolean
}) {
  const save = useMutation((next: ProjectKind) => provider.updateProject(projectId, { kind: next }))

  const handleSelect = async (next: ProjectKind) => {
    if (readOnly || next === kind) return
    const ok = window.confirm(
      `${PROJECT_KIND_LABELS[next]}으로 전환하시겠습니까?\n\n표시 계층만 전환되며 데이터는 보존됩니다 — ` +
        '기존에 입력된 발주처 연락처·파트너 정보는 지워지지 않고, 필요하면 언제든 되돌릴 수 있습니다.',
    )
    if (!ok) return
    const result = await save.run(next)
    if (result) onChanged()
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(['agency', 'host'] as ProjectKind[]).map((k) => {
          const active = kind === k
          return (
            <button
              key={k}
              type="button"
              disabled={readOnly || save.pending}
              onClick={() => handleSelect(k)}
              className={`rounded-[10px] border p-4 text-left transition-colors disabled:opacity-60 ${
                active ? 'border-accent bg-accent-tint' : 'border-border bg-card hover:bg-track'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="t-card-title">{PROJECT_KIND_LABELS[k]}</span>
                {active && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                    현재
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-ink-sub">{KIND_BLURB[k]}</p>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-cap">
        성격을 바꿔도 데이터는 삭제되지 않습니다(표시 계층만 전환) — 유형(일반형/모객형) 토글과 같은
        원칙입니다.
      </p>
      <ErrorAlert message={save.error} />
    </div>
  )
}
