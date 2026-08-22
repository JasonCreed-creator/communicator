// S6 행사 설정 — 3탭: ①행사개요 ②담당자 ③유형·연동 (설계서 v1.5 §10 S6).
// ①탭은 S0 온보딩 ①단계와 동일한 ProjectOverviewForm을 재사용한다.
// pm이 아니면 각 편집 컴포넌트가 읽기 전용으로 전환된다(표시는 유지, 쓰기만 숨김/비활성).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/internal/Card'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import ClientContactsEditor from '../components/settings/ClientContactsEditor'
import MembersEditor from '../components/settings/MembersEditor'
import ProjectOverviewForm from '../components/settings/ProjectOverviewForm'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { EVENT_TYPE_LABELS, ROLE_BAR_CLASSES, ROLE_LABELS, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { MemberRole } from '../types/enums'

const provider = getDataProvider()

type Tab = 'overview' | 'members' | 'integration'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '① 행사개요' },
  { id: 'members', label: '② 담당자' },
  { id: 'integration', label: '③ 유형·연동' },
]

const ROLE_PREVIEW: { role: MemberRole; blurb: string }[] = [
  { role: 'pm', blurb: '계약·정산·컨펌 게이트' },
  { role: 'design', blurb: '랜딩·제작물' },
  { role: 'ops', blurb: '현장·리허설·결과보고' },
  { role: 'reg', blurb: '모객·RSVP·등록' },
]

export default function SettingsPage() {
  const { projectId, reloadSummaries } = useProject()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const isPm = currentUser.data?.role === 'pm'

  const missingCount = project.data
    ? [project.data.name, project.data.code, project.data.event_date, project.data.venue].filter((v) => !v).length
    : 0
  const onboarded = !!project.data?.onboarded_at

  const handleSaved = () => {
    project.reload()
    reloadSummaries()
  }

  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption="S6 · 행사 설정"
        title="행사 설정"
        action={
          project.data ? (
            onboarded ? (
              <span className="inline-flex items-center rounded-full bg-positive-tint px-3 py-1 text-xs font-medium text-positive">
                세팅 완료 · {formatDate((project.data.onboarded_at as string).slice(0, 10))}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-negative-tint px-3 py-1 text-xs font-medium text-negative">
                세팅 미완료 · 필수 {missingCount}개 남음
              </span>
            )
          ) : undefined
        }
      />

      <ErrorAlert message={project.error} />
      <ErrorAlert message={currentUser.error} />
      {project.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}

      {project.data && !onboarded && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent-tint px-4 py-3 text-sm text-ink">
          <p>
            필수 항목 {missingCount}개를 입력하면 행사를 활성화할 수 있습니다 — 입력 후 '행사 목록'에서
            온보딩을 완료하세요.
          </p>
          <button
            type="button"
            onClick={() => navigate('/onboarding')}
            className="btn btn-accent btn-sm shrink-0"
          >
            온보딩 이어서 하기
          </button>
        </div>
      )}

      {project.data && (
        <>
          <div className="flex gap-1 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`border-b-2 px-4 py-2 text-sm font-medium ${
                  tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-sub hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <Card title="행사개요">
              <ProjectOverviewForm projectId={projectId} onSaved={handleSaved} readOnly={!isPm} />
            </Card>
          )}

          {tab === 'members' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card title="담당자">
                <MembersEditor projectId={projectId} onChanged={handleSaved} readOnly={!isPm} />
              </Card>
              <div className="space-y-6">
                <Card title="발주처 연락처·토큰">
                  <ClientContactsEditor projectId={projectId} readOnly={!isPm} />
                </Card>
                <Card title="R&R 미리보기">
                  <ul className="space-y-2 text-sm">
                    {ROLE_PREVIEW.map((r) => (
                      <li key={r.role} className="flex items-center gap-2">
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BAR_CLASSES[r.role]} ${
                            r.role === 'reg' ? 'text-ink' : 'text-white'
                          }`}
                        >
                          {ROLE_LABELS[r.role]}
                        </span>
                        <span className="text-ink-sub">{r.blurb}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          )}

          {tab === 'integration' && (
            <div className="space-y-6">
              <Card title="행사 유형">
                <p className="text-sm text-ink">
                  현재 유형: <strong>{EVENT_TYPE_LABELS[project.data.event_type]}</strong>
                </p>
                <p className="mt-2 text-xs text-ink-cap">
                  행사 유형을 바꿔도 등록 데이터는 삭제되지 않습니다(표시 계층만 전환). WBS 재전개는
                  일정 화면에서 실행하세요. 유형 변경은 ① 행사개요 탭에서 할 수 있습니다.
                </p>
              </Card>

              <Card title="Drive 연결">
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-ink-cap">
                  미연결 — Phase 5에서 이식 예정
                </div>
              </Card>

              <Card title="Slack Webhook">
                <p className="mb-2 text-sm text-ink-sub">{project.data.slack_webhook_url ?? '미등록'}</p>
                <input
                  value=""
                  placeholder="https://hooks.slack.com/services/..."
                  disabled
                  className="ui-input w-full max-w-lg disabled:opacity-60"
                />
                <p className="mt-1 text-xs text-ink-cap">Phase 6에서 이식 예정</p>
              </Card>
            </div>
          )}
        </>
      )}
    </section>
  )
}
