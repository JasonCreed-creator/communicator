// S0 온보딩 위저드 (설계서 v1.5 §10 S0) — 3단계: ①행사 개요 ②담당자 ③유형·확인.
// 완료 전 본체 라우트는 OnboardingGuard가 /settings로 유도한다(App.tsx·testUtils.tsx) — 이 라우트
// 자체는 가드 밖이라 언제든 직접 접근할 수 있다. 이미 완료된 행사는 재완료(409)를 막기 위해
// 스테퍼 대신 안내 + '행사 설정으로' 링크를 보여준다.
//
// Phase 3.23 PR-8(디자인지시서 v1.4 §7-2.12 · 캔버스 '온보딩 — 넓은 2열'):
//   · 카드 960 · 머리 줄 = 로고 | '새 행사 만들기' + '단계마다 저장돼요' · [나중에 하기](→ 행사 목록 — 저장 안 한 입력이 있으면 확인)
//   · 단계 제목(h1) = 행사 기본 정보 / 담당자 배정 / 유형 고르고 확인 + 한 줄 설명
//   · 가로 단계 줄(① 행사 개요 — ② 담당자 — ③ 유형·확인) + 오른쪽 'n단계 중 k단계 · 필수 4개 중 m개 입력' + 막대
//   · 1단계 = ProjectOverviewForm layout='onboarding'(넓은 2열 · 선택 항목 접기 · '다음: 담당자')
import { Fragment, useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import ErrorAlert from '../components/internal/ErrorAlert'
import ProgressBar from '../components/internal/ProgressBar'
import CompletionNotice from '../components/onboarding/CompletionNotice'
import FormatStep from '../components/onboarding/FormatStep'
import { REQUIRED_FIELDS, filledRequired } from '../components/settings/requiredFields'
import ClientContactsEditor from '../components/settings/ClientContactsEditor'
import MembersEditor from '../components/settings/MembersEditor'
import ProjectOverviewForm from '../components/settings/ProjectOverviewForm'
import { useProject } from '../context/ProjectContext'
import { useAsync, useMutation } from '../hooks/useAsync'
import { EVENT_TYPE_LABELS, ROLE_LABELS, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'

const provider = getDataProvider()

const STEPS = [
  { id: 1, label: '행사 개요', title: '행사 기본 정보', sub: '필수 4개만 채우면 다음으로 넘어갑니다. 나머지는 행사 설정에서 언제든 고칠 수 있어요.' },
  { id: 2, label: '담당자', title: '담당자 배정', sub: '주소록 인물 카드를 역할 칸에 넣습니다. 발주처 연락처는 나중에 넣어도 됩니다.' },
  { id: 3, label: '유형·확인', title: '유형 고르고 확인', sub: '행사 포맷을 고르고 요약을 확인하면 일정(WBS)이 행사일 기준으로 펼쳐집니다.' },
] as const

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-3 fill-current">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
    </svg>
  )
}

/** 가로 단계 줄 — 지난 단계 = positive 틴트 + 체크 · 지금 = accent 틴트 + 1.5px accent 링 · 다음 = 흰 면 + 보더 링 */
function StepStrip({ current }: { current: number }) {
  return (
    <ol aria-label="온보딩 단계" className="flex min-w-0 flex-1 items-center">
      {STEPS.map((s, i) => {
        const done = s.id < current
        const now = s.id === current
        return (
          <Fragment key={s.id}>
            <li className="flex shrink-0 items-center gap-2" aria-current={now ? 'step' : undefined}>
              <span
                className={`inline-flex size-[22px] items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? 'bg-positive-tint text-positive'
                    : now
                      ? 'bg-accent-tint text-accent-deep shadow-[inset_0_0_0_1.5px_var(--accent)]'
                      : 'bg-card text-ink-cap shadow-[inset_0_0_0_1.5px_var(--border-strong)]'
                }`}
              >
                {done ? <Check /> : s.id}
              </span>
              <span className={`whitespace-nowrap text-[13px] ${now ? 'font-semibold text-ink' : done ? 'font-medium text-brown' : 'font-medium text-ink-cap'}`}>
                {s.label}
              </span>
            </li>
            {i < STEPS.length - 1 && <li aria-hidden className="mx-3 h-px min-w-4 flex-1 bg-border" />}
          </Fragment>
        )
      })}
    </ol>
  )
}

export default function OnboardingPage() {
  const { projectId, reloadSummaries } = useProject()
  const [step, setStep] = useState(1)
  const [overviewDirty, setOverviewDirty] = useState(false)
  // 1단계에서는 저장 전 입력으로 센다 — 칸을 채우는 대로 '필수 4개 중 m개'가 올라간다
  const [liveFilled, setLiveFilled] = useState<number | null>(null)
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
      navigate('/home', { replace: true })
    }
  }

  /** 나중에 하기 — 행사 목록('먼저 확인할 행사'의 이어서 세팅하기)으로. 1단계 입력을 저장하지 않았으면 먼저 묻는다 */
  const handleLater = () => {
    if (step === 1 && overviewDirty && !window.confirm('저장하지 않은 입력이 있습니다. 나가면 이 단계의 입력은 사라집니다. 나갈까요?')) {
      return
    }
    reloadSummaries()
    navigate('/projects')
  }

  const onDirtyChange = useCallback((dirty: boolean) => setOverviewDirty(dirty), [])
  const onRequiredFilledChange = useCallback((n: number) => setLiveFilled(n), [])

  const alreadyOnboarded = !!project.data?.onboarded_at
  const filledCount = step === 1 && liveFilled !== null ? liveFilled : filledRequired(project.data ?? {}).size
  const meta = STEPS[step - 1]

  return (
    <div className="min-h-screen bg-canvas px-4 py-10 sm:pt-16">
      <div className="ui-card mx-auto flex max-w-[960px] flex-col gap-6 px-5 py-7 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3.5">
            <BrandLogo variant="black" className="h-5 w-auto" />
            <span aria-hidden className="h-4 w-px bg-border" />
            <span className="t-caption text-brown">새 행사 만들기</span>
          </span>
          {project.data && !alreadyOnboarded && (
            <span className="flex items-center gap-2.5">
              <span className="t-caption">단계마다 저장돼요</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleLater}>
                나중에 하기
              </button>
            </span>
          )}
        </div>

        {project.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
        <ErrorAlert message={project.error} />

        {project.data && alreadyOnboarded && (
          <>
            <h1 className="t-page-title">행사 기본 정보</h1>
            <div className="space-y-3 rounded-lg bg-canvas p-4 text-sm">
              <p className="text-ink">이미 세팅이 완료된 행사입니다.</p>
              <Link to="/settings" className="text-steel underline">
                행사 설정으로
              </Link>
            </div>
          </>
        )}

        {project.data && !alreadyOnboarded && (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="t-page-title">{meta.title}</h1>
              <p className="text-sm text-ink-sub">{meta.sub}</p>
            </div>

            {/* 단계 줄 + 진행 — 필수는 행사 설정과 같은 4항목 기준 */}
            <div
              data-testid="onboarding-progress"
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[10px] bg-canvas px-4 py-3"
            >
              <div className="min-w-0 max-w-[520px] flex-1">
                <StepStrip current={step} />
              </div>
              <span className="flex shrink-0 items-center gap-2.5">
                <span className="text-[13px] text-brown" data-testid="onboarding-progress-text">
                  {STEPS.length}단계 중 {step}단계 ·{' '}
                  <b className="font-semibold text-ink">
                    필수 {REQUIRED_FIELDS.length}개 중 {filledCount}개 입력
                  </b>
                </span>
                <span className="w-[72px]">
                  <ProgressBar done={filledCount} total={REQUIRED_FIELDS.length} hideValue />
                </span>
              </span>
            </div>

            {step === 1 && (
              <ProjectOverviewForm
                projectId={projectId}
                layout="onboarding"
                submitLabel="다음: 담당자"
                nextHint="다음 단계: 담당자 — 주소록 인물 카드를 역할 칸에 넣습니다"
                onDirtyChange={onDirtyChange}
                onRequiredFilledChange={onRequiredFilledChange}
                onSaved={() => {
                  project.reload()
                  setStep(2)
                }}
              />
            )}

            {step === 2 && (
              <section className="space-y-4" aria-label="담당자 배정">
                <div className="rounded-lg bg-canvas p-4">
                  <h2 className="t-card-title mb-3">담당자</h2>
                  <MembersEditor projectId={projectId} onChanged={project.reload} />
                </div>

                <div className="rounded-lg bg-canvas p-4">
                  <h2 className="t-card-title mb-3">발주처 연락처·토큰 (선택)</h2>
                  <ClientContactsEditor projectId={projectId} />
                  <p className="mt-2 text-xs text-ink-cap">
                    이 단계는 건너뛰어도 됩니다 — 연락처·토큰은 나중에 행사 설정에서 추가할 수 있습니다.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <button type="button" onClick={() => setStep(1)} className="btn btn-ghost">
                    이전
                  </button>
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="t-caption">다음 단계: 유형·확인 — 포맷을 고르고 요약을 봅니다</span>
                    <button type="button" onClick={() => setStep(3)} className="btn btn-primary">
                      다음: 유형·확인
                    </button>
                  </span>
                </div>
              </section>
            )}

            {step === 3 && project.data && (
              <section className="space-y-4" aria-label="유형·확인">
                <div className="rounded-lg bg-canvas p-4">
                  <h2 className="t-card-title mb-3">행사 포맷</h2>
                  <FormatStep projectId={projectId} project={project.data} onChanged={project.reload} />
                </div>

                <div className="rounded-lg bg-canvas p-4 text-sm text-ink">
                  <h2 className="t-card-title mb-2">요약</h2>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                    <dt className="text-ink-cap">행사명</dt>
                    <dd className="min-w-0">{project.data.name}</dd>
                    <dt className="text-ink-cap">일자</dt>
                    <dd className="min-w-0">{project.data.event_date ? formatDate(project.data.event_date) : '-'}</dd>
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

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <button type="button" onClick={() => setStep(2)} className="btn btn-ghost">
                    이전
                  </button>
                  <button type="button" onClick={handleComplete} disabled={!isPm || complete.pending} className="btn btn-accent">
                    온보딩 완료
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
