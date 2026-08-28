// S0 온보딩 위저드 (설계서 v1.5 §10 S0) — 3단계: ①행사개요 ②담당자 ③유형·확인.
// 완료 전 본체 라우트는 OnboardingGuard가 /settings로 유도한다(App.tsx·testUtils.tsx) — 이 라우트
// 자체는 가드 밖이라 언제든 직접 접근할 수 있다. 이미 완료된 행사는 재완료(409)를 막기 위해
// 스테퍼 대신 안내 + '행사 설정으로' 링크를 보여준다.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import ErrorAlert from '../components/internal/ErrorAlert'
import ProgressBar from '../components/internal/ProgressBar'
import CompletionNotice from '../components/onboarding/CompletionNotice'
import EventTypeStep from '../components/onboarding/EventTypeStep'
import StepIndicator, { type WizardStep } from '../components/onboarding/StepIndicator'
import { missingRequired } from '../components/settings/requiredFields'
import ClientContactsEditor from '../components/settings/ClientContactsEditor'
import MembersEditor from '../components/settings/MembersEditor'
import ProjectOverviewForm from '../components/settings/ProjectOverviewForm'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { EVENT_TYPE_LABELS, ROLE_LABELS, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'

const provider = getDataProvider()

const STEPS: WizardStep[] = [
  { id: 1, label: '행사개요' },
  { id: 2, label: '담당자' },
  { id: 3, label: '유형·확인' },
]

export default function OnboardingPage() {
  const { projectId, reloadSummaries } = useProject()
  const [step, setStep] = useState(1)
  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const navigate = useNavigate()
  const isPm = currentUser.data?.role === 'pm'

  const complete = useMutation(async () => {
    await provider.completeOnboarding(projectId)
    return true
  })

  const handleComplete = async () => {
    const ok = await complete.run()
    if (ok) {
      reloadSummaries()
      navigate('/', { replace: true })
    }
  }

  const alreadyOnboarded = !!project.data?.onboarded_at
  // 시안(온보딩 · 파트너 포털.dc.html) — 카드 상단 전체 진행 막대 + 필수 남은 개수.
  // '완료 단계'는 현재 단계 직전까지(③에 있으면 2/3 = 67%), 필수는 행사 설정과 같은 4항목 기준.
  const doneSteps = step - 1
  const missingCount = missingRequired(project.data ?? {}).length

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="ui-card mx-auto max-w-[720px] p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <BrandLogo variant="black" className="h-5 w-auto" />
          <p className="t-caption">S0</p>
        </div>

        <h1 className="t-page-title">온보딩 위저드</h1>
        <p className="mt-1 text-sm text-ink-sub">행사 정보를 입력하면 본체 화면을 사용할 수 있습니다.</p>

        {project.data && !alreadyOnboarded && (
          <div
            data-testid="onboarding-progress"
            className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-canvas px-3.5 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <ProgressBar done={doneSteps} total={STEPS.length} hideValue />
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs font-medium text-ink-sub">
              {STEPS.length}단계 중 {doneSteps}단계 완료 · 필수 {missingCount}개 남음
            </span>
          </div>
        )}

        {project.loading && <p className="mt-6 text-sm text-ink-cap">불러오는 중…</p>}
        <div className="mt-4">
          <ErrorAlert message={project.error} />
        </div>

        {project.data && alreadyOnboarded && (
          <div className="mt-6 space-y-3 rounded-lg bg-canvas p-4 text-sm">
            <p className="text-ink">이미 세팅이 완료된 행사입니다.</p>
            <Link to="/settings" className="text-steel underline">
              행사 설정으로
            </Link>
          </div>
        )}

        {project.data && !alreadyOnboarded && (
          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className="sm:w-36 sm:shrink-0">
              <StepIndicator steps={STEPS} current={step} />
            </div>

            <div className="min-w-0 flex-1 space-y-6">
              {step === 1 && (
                <section>
                  <h2 className="t-section-title mb-4">① 행사개요</h2>
                  <ProjectOverviewForm
                    projectId={projectId}
                    submitLabel="다음"
                    onSaved={() => {
                      project.reload()
                      setStep(2)
                    }}
                  />
                </section>
              )}

              {step === 2 && (
                <section className="space-y-4">
                  <h2 className="t-section-title mb-1">② 담당자</h2>

                  <div className="rounded-lg bg-canvas p-4">
                    <h3 className="t-card-title mb-3">담당자</h3>
                    <MembersEditor projectId={projectId} onChanged={project.reload} />
                  </div>

                  <div className="rounded-lg bg-canvas p-4">
                    <h3 className="t-card-title mb-3">발주처 연락처·토큰 (선택)</h3>
                    <ClientContactsEditor projectId={projectId} />
                    <p className="mt-2 text-xs text-ink-cap">
                      이 단계는 건너뛰어도 됩니다 — 연락처·토큰은 나중에 행사 설정에서 추가할 수 있습니다.
                    </p>
                  </div>

                  <div className="flex justify-between">
                    <button type="button" onClick={() => setStep(1)} className="btn btn-ghost">
                      이전
                    </button>
                    <button type="button" onClick={() => setStep(3)} className="btn btn-primary">
                      다음
                    </button>
                  </div>
                </section>
              )}

              {step === 3 && project.data && (
                <section className="space-y-4">
                  <h2 className="t-section-title mb-1">③ 유형·확인</h2>

                  <div className="rounded-lg bg-canvas p-4">
                    <h3 className="t-card-title mb-3">행사 유형</h3>
                    <EventTypeStep projectId={projectId} project={project.data} onChanged={project.reload} />
                  </div>

                  <div className="rounded-lg bg-canvas p-4 text-sm text-ink">
                    <h3 className="t-card-title mb-2">요약</h3>
                    {/* 시안 요약 — 라벨/값 2열 정의 그리드 */}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                      <dt className="text-ink-cap">행사명</dt>
                      <dd className="min-w-0">{project.data.name}</dd>
                      <dt className="text-ink-cap">일자</dt>
                      <dd className="min-w-0">
                        {project.data.event_date ? formatDate(project.data.event_date) : '-'}
                      </dd>
                      <dt className="text-ink-cap">장소</dt>
                      <dd className="min-w-0">{project.data.venue ?? '-'}</dd>
                      <dt className="text-ink-cap">유형</dt>
                      <dd className="min-w-0">{EVENT_TYPE_LABELS[project.data.event_type]}</dd>
                      {/* 확인 단계에서 ②에 넣은 담당자를 다시 읽어볼 수 있게 한다 */}
                      <dt className="text-ink-cap">담당</dt>
                      <dd className="min-w-0">
                        {members.data && members.data.length > 0
                          ? members.data.map((m) => `${ROLE_LABELS[m.role]} ${m.profile.name}`).join(' · ')
                          : '-'}
                      </dd>
                    </dl>
                  </div>

                  <CompletionNotice project={project.data} />

                  {!currentUser.loading && !isPm && (
                    <p className="text-xs text-negative">
                      온보딩 완료는 PM만 실행할 수 있습니다. PM 계정으로 로그인해 완료해 주세요.
                    </p>
                  )}
                  <ErrorAlert message={complete.error} />

                  <div className="flex justify-between">
                    <button type="button" onClick={() => setStep(2)} className="btn btn-ghost">
                      이전
                    </button>
                    <button
                      type="button"
                      onClick={handleComplete}
                      disabled={!isPm || complete.pending}
                      className="btn btn-accent"
                    >
                      온보딩 완료
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
