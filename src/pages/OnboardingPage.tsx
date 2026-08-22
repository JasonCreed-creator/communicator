// S0 온보딩 위저드 (설계서 v1.4 §10 S0) — 3단계: ①행사 기본개요 ②행사 유형 ③담당자·토큰.
// 완료 전 본체 라우트는 OnboardingGuard가 이 라우트로 리다이렉트한다(App.tsx·testUtils.tsx).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import ErrorAlert from '../components/internal/ErrorAlert'
import AssigneesStep from '../components/onboarding/AssigneesStep'
import EventTypeStep from '../components/onboarding/EventTypeStep'
import OverviewStep from '../components/onboarding/OverviewStep'
import StepIndicator, { type WizardStep } from '../components/onboarding/StepIndicator'
import { PROJECT_ID } from '../fixtures/sampleProject'
import { useAsync } from '../hooks/useAsync'
import { getDataProvider } from '../providers'

const provider = getDataProvider()

const STEPS: WizardStep[] = [
  { id: 1, label: '행사 기본개요' },
  { id: 2, label: '행사 유형' },
  { id: 3, label: '담당자·토큰' },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const project = useAsync(() => provider.getProject(PROJECT_ID), [])
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="ui-card mx-auto max-w-[720px] p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <BrandLogo variant="black" className="h-5 w-auto" />
          <p className="t-caption">S0</p>
        </div>

        <h1 className="t-page-title">온보딩 위저드</h1>
        <p className="mt-1 text-sm text-ink-sub">행사 정보를 입력하면 본체 화면을 사용할 수 있습니다.</p>

        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:gap-8">
          <div className="sm:w-36 sm:shrink-0">
            <StepIndicator steps={STEPS} current={step} />
          </div>

          <div className="min-w-0 flex-1 space-y-6">
            {project.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
            <ErrorAlert message={project.error} />

            {project.data && (
              <>
                {step === 1 && (
                  <OverviewStep
                    project={project.data}
                    onSaved={() => {
                      project.reload()
                      setStep(2)
                    }}
                  />
                )}
                {step === 2 && (
                  <EventTypeStep
                    project={project.data}
                    onPrev={() => setStep(1)}
                    onSaved={() => {
                      project.reload()
                      setStep(3)
                    }}
                  />
                )}
                {step === 3 && (
                  <AssigneesStep onPrev={() => setStep(2)} onComplete={() => navigate('/', { replace: true })} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
