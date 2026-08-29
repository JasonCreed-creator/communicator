// 판매 플래너 (v2.6 §25 · Phase 3.18b) — S-11 파트너 보드 상단 탭.
//
// 대행형 컨퍼런스의 견적(S-2)이 "우리가 쓸 돈"을 쌓는다면, 주최형은 "파트너에게 팔 상품"을
// 정의해 들어올 돈을 계획한다. 그래서 견적 화면을 고치지 않고 별도 도구로 세웠다 —
// 계산은 modules/quote/engine/calcRevenue.ts, 기존 비용형 엔진 파일은 손대지 않는다(§25.8).
//
// 게이트는 **복합 게이트**다: kind='host' && format in (dms, exhibition) — §25.1 권한 ③.
// format 단독으로 화면을 켜고 끄지 않는다(감수 C1).
//
// ★ 금액: 이 화면의 등급 단가(tier.price)는 내부 전용이다. 포털(`/p`)·발주처(`/c`) 어디에도
//   실리지 않는다(§25.8) — 그 계약은 dod48 테스트가 지킨다.
//
// **위치가 components/partner/가 아닌 이유**: dod23 소스 grep 가드는 `components/partner/**`를
// "금액 식별자가 있어서는 안 되는 경로"로 본다(§21.2 R-H3). 이 화면은 반대로 매출을 다루는 게
// 목적인 내부 도구라 그 디렉터리에 두면 가드의 의미가 흐려진다 — 그래서 components/sales/에 둔다.
import { useMemo, useState } from 'react'
import Card from '../internal/Card'
import EmptyState from '../internal/EmptyState'
import ErrorAlert from '../internal/ErrorAlert'
import ProgressBar from '../internal/ProgressBar'
import StatTile from '../internal/StatTile'
import { LevelBadge } from '../internal/StatusBadge'
import StepIndicator, { type WizardStep } from '../onboarding/StepIndicator'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { FORMAT_PRESETS, presetCardOf } from '../../fixtures/formatPresets'
import {
  calcRevenue,
  countSoldByTier,
  totalSessionSlots,
} from '../../modules/quote/engine/calcRevenue'
import { getDataProvider } from '../../providers'
import type { PartnerTier, Project, UUID } from '../../types/entities'

const provider = getDataProvider()

const STEPS: WizardStep[] = [
  { id: 1, label: '상품 정의' },
  { id: 2, label: '목표 시뮬레이션' },
  { id: 3, label: '프리셋 확인' },
]

function krw(n: number | null): string {
  return n == null ? '-' : `${n.toLocaleString('ko-KR')}원`
}

/** KPI 타일용 축약 표기 — 억/만 단위. 원 단위 정확값은 같은 타일의 보조 줄과 표가 그대로 보여준다.
 *  (전각 숫자열이 타일 폭을 넘겨 잘리는 것을 막는 목적이라 반올림하지 않고 절사·분해만 한다) */
function krwShort(n: number): string {
  if (n === 0) return '0원'
  const eok = Math.floor(n / 100_000_000)
  const man = Math.floor((n % 100_000_000) / 10_000)
  const won = n % 10_000
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString('ko-KR')}만` : `${eok}억`
  if (man > 0) return won > 0 ? `${man.toLocaleString('ko-KR')}만+` : `${man.toLocaleString('ko-KR')}만`
  return `${n.toLocaleString('ko-KR')}원`
}

function pct(v: number | null): string {
  return v == null ? '-' : `${Math.round(v * 100)}%`
}

export default function SalesPlanner({ project }: { project: Project }) {
  const projectId = project.id
  const [step, setStep] = useState(1)
  const tiers = useAsync(() => provider.listPartnerTiers(projectId), [projectId])
  const partners = useAsync(() => provider.listPartners(projectId), [projectId])
  const sessions = useAsync(() => provider.listProgramSessions(projectId), [projectId])

  const soldByTier = useMemo(() => countSoldByTier(partners.data ?? []), [partners.data])
  const plan = useMemo(
    () => calcRevenue(tiers.data ?? [], soldByTier),
    [tiers.data, soldByTier],
  )
  const slotDemand = useMemo(
    () => totalSessionSlots(tiers.data ?? [], soldByTier),
    [tiers.data, soldByTier],
  )
  const preset = FORMAT_PRESETS[presetCardOf(project.format, project.event_type)]

  return (
    <section aria-label="판매 플래너" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <div className="sm:w-36 sm:shrink-0">
          <StepIndicator steps={STEPS} current={step} />
        </div>
        <div className="min-w-0 flex-1 space-y-5">
          <ErrorAlert message={tiers.error ?? partners.error} />

          {step === 1 && (
            <TierStep tiers={tiers.data ?? []} loading={tiers.loading} onSaved={tiers.reload} projectId={projectId} />
          )}
          {step === 2 && <SimulationStep plan={plan} slotDemand={slotDemand} />}
          {step === 3 && (
            <PresetStep
              opsNotes={preset.opsNotes}
              presetLabel={preset.cardLabel}
              assumed={preset.assumed}
              sessions={sessions.data ?? []}
              slotDemand={slotDemand}
              onSaved={sessions.reload}
            />
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="btn btn-ghost"
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
              disabled={step === STEPS.length}
              className="btn btn-primary"
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── ① 상품 정의 ─────────────────────────────────────────────────────
function TierStep({
  projectId,
  tiers,
  loading,
  onSaved,
}: {
  projectId: UUID
  tiers: PartnerTier[]
  loading: boolean
  onSaved: () => void
}) {
  if (loading) return <p className="text-sm text-ink-cap">불러오는 중…</p>
  if (tiers.length === 0) {
    return (
      <EmptyState message="등급이 아직 없습니다 — 행사 설정 ③ 유형·연동에서 파트너 등급을 먼저 만들면 여기서 상품 내용을 정의할 수 있습니다." />
    )
  }
  return (
    <div className="space-y-3">
      <div>
        <h3 className="t-section-title">① 상품 정의</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-sub">
          등급마다 파는 내용을 정합니다. <strong>판매 단가는 내부 전용</strong>이라 파트너 포털·발주처
          화면에는 나오지 않습니다.
        </p>
      </div>
      {tiers.map((tier) => (
        <TierCard key={tier.id} projectId={projectId} tier={tier} onSaved={onSaved} />
      ))}
    </div>
  )
}

function TierCard({
  projectId,
  tier,
  onSaved,
}: {
  projectId: UUID
  tier: PartnerTier
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    capacity: tier.capacity == null ? '' : String(tier.capacity),
    session_slots: String(tier.session_slots),
    booth_included: tier.booth_included,
    staff_cap: tier.staff_cap == null ? '' : String(tier.staff_cap),
    price: tier.price == null ? '' : String(tier.price),
  })
  const save = useMutation(() =>
    provider.upsertPartnerTier(projectId, {
      code: tier.code,
      name: tier.name,
      description: tier.description,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      session_slots: Number(form.session_slots || 0),
      booth_included: form.booth_included,
      staff_cap: form.staff_cap === '' ? null : Number(form.staff_cap),
      price: form.price === '' ? null : Number(form.price),
    }),
  )

  const handleSave = async () => {
    if (await save.run()) onSaved()
  }

  return (
    <Card title={tier.name} action={<span className="t-caption">{tier.code}</span>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <NumField
          label="정원"
          hint="비우면 무제한"
          value={form.capacity}
          onChange={(v) => setForm((f) => ({ ...f, capacity: v }))}
        />
        <NumField
          label="발표 세션 수"
          value={form.session_slots}
          onChange={(v) => setForm((f) => ({ ...f, session_slots: v }))}
        />
        <NumField
          label="상주 인력 상한"
          hint="비우면 제한 없음"
          value={form.staff_cap}
          onChange={(v) => setForm((f) => ({ ...f, staff_cap: v }))}
        />
        <NumField
          label="판매 단가 (내부)"
          hint="비우면 미정"
          value={form.price}
          onChange={(v) => setForm((f) => ({ ...f, price: v }))}
        />
        <label className="flex flex-col gap-1 t-caption">
          <span>부스 포함</span>
          <span className="flex h-9 items-center">
            <input
              type="checkbox"
              checked={form.booth_included}
              onChange={(e) => setForm((f) => ({ ...f, booth_included: e.target.checked }))}
              aria-label={`${tier.name} 부스 포함`}
            />
          </span>
        </label>
      </div>
      <ErrorAlert message={save.error} />
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={handleSave} disabled={save.pending} className="btn btn-primary btn-sm">
          {tier.name} 저장
        </button>
      </div>
    </Card>
  )
}

function NumField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 t-caption">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="ui-input"
      />
      {hint && <span className="text-[11px] text-ink-cap">{hint}</span>}
    </label>
  )
}

// ── ② 목표 시뮬레이션 ────────────────────────────────────────────────
function SimulationStep({
  plan,
  slotDemand,
}: {
  plan: ReturnType<typeof calcRevenue>
  slotDemand: number
}) {
  // '판매 현황'은 분자·분모의 기준을 맞춘다 — 정원 무제한 등급의 판매를 정원 있는 등급의
  // 분모와 섞으면 5/4 같은 수치가 나온다(분모에 없는 판매가 분자에 들어간다).
  const cappedLines = plan.lines.filter((l) => l.capacity != null)
  const cappedSold = cappedLines.reduce((sum, l) => sum + l.sold, 0)
  const capacityTotal = cappedLines.reduce((sum, l) => sum + (l.capacity ?? 0), 0)
  const uncappedSold = plan.lines
    .filter((l) => l.capacity == null)
    .reduce((sum, l) => sum + l.sold, 0)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="t-section-title">② 목표 시뮬레이션</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-sub">
          만석 기준 매출과 현재 확정 매출을 비교합니다. 정원이 무제한이거나 단가가 미정인 등급은
          목표 합계에서 빠집니다 — 어느 등급이 빠졌는지 아래에 그대로 적습니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="만석 기준 매출"
          value={krwShort(plan.target_total)}
          support={krw(plan.target_total)}
        />
        <StatTile
          label="확정 매출"
          value={krwShort(plan.sold_total)}
          tone={plan.achievement != null && plan.achievement < 0.5 ? 'accent' : 'default'}
          support={`${krw(plan.sold_total)} · 달성률 ${pct(plan.achievement)}`}
        />
        <StatTile
          label="판매 현황"
          value={capacityTotal > 0 ? `${cappedSold}/${capacityTotal}` : String(uncappedSold)}
          support={
            capacityTotal > 0
              ? `정원 있는 등급 기준${uncappedSold > 0 ? ` · 무제한 등급 ${uncappedSold}건 별도` : ''}`
              : '전 등급 정원 무제한'
          }
        />
        <StatTile
          label="세션 슬롯 수요"
          value={slotDemand}
          support="판매된 등급이 요구하는 발표 세션 수"
        />
      </div>

      {(plan.unpriced_codes.length > 0 || plan.uncapped_codes.length > 0) && (
        <p data-testid="planner-excluded-note" className="rounded-md bg-canvas px-3 py-2 text-xs text-ink-sub">
          {plan.unpriced_codes.length > 0 && <>단가 미정 — {plan.unpriced_codes.join(' · ')}. </>}
          {plan.uncapped_codes.length > 0 && <>정원 무제한 — {plan.uncapped_codes.join(' · ')}.</>}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="ui-table" aria-label="등급별 판매 계획">
          <thead>
            <tr>
              <th className="ui-th">등급</th>
              <th className="ui-th ui-num">정원</th>
              <th className="ui-th ui-num">판매</th>
              <th className="ui-th">진행률</th>
              <th className="ui-th ui-num">단가</th>
              <th className="ui-th ui-num">만석 기준</th>
              <th className="ui-th ui-num">확정</th>
            </tr>
          </thead>
          <tbody>
            {plan.lines.map((l) => (
              <tr key={l.tier_id}>
                <td>
                  <span className="flex items-center gap-1.5">
                    {l.name}
                    {l.oversold && <LevelBadge level="attention" label="정원 초과" />}
                  </span>
                </td>
                <td className="ui-num">{l.capacity ?? '무제한'}</td>
                <td className="ui-num">{l.sold}</td>
                <td className="min-w-24">
                  {l.capacity == null ? (
                    <span className="text-xs text-ink-cap">-</span>
                  ) : (
                    <ProgressBar done={l.sold} total={l.capacity} hideValue />
                  )}
                </td>
                <td className="ui-num">{krw(l.price)}</td>
                <td className="ui-num">{krw(l.target_amount)}</td>
                <td className="ui-num">{krw(l.sold_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ui-table-total">
              <td colSpan={5}>합계</td>
              <td className="ui-num">{krw(plan.target_total)}</td>
              <td className="ui-num">{krw(plan.sold_total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── ③ 프리셋 확인 (운영 프리셋 + 트랙 편성) ──────────────────────────
function PresetStep({
  opsNotes,
  presetLabel,
  assumed,
  sessions,
  slotDemand,
  onSaved,
}: {
  opsNotes: readonly string[]
  presetLabel: string
  assumed: boolean
  sessions: { id: UUID; title: string; track: string | null; section: string | null }[]
  slotDemand: number
  onSaved: () => void
}) {
  const setTrack = useMutation((args: { id: UUID; track: string }) =>
    provider.updateProgramSession(args.id, { track: args.track }),
  )

  const handleTrack = async (id: UUID, track: string) => {
    if (await setTrack.run({ id, track })) onSaved()
  }

  const assigned = sessions.filter((s) => s.track).length

  return (
    <div className="space-y-4">
      <div>
        <h3 className="t-section-title flex items-center gap-2">
          ③ 프리셋 확인
          {assumed && <LevelBadge level="neutral" label="가정" />}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-sub">
          {presetLabel} 프리셋이 전제하는 운영 규칙입니다. 파트너에게 안내할 내용이라 판매 조건과
          어긋나면 여기서 먼저 걸러야 합니다.
        </p>
      </div>

      {opsNotes.length > 0 ? (
        <ul data-testid="planner-ops-notes" className="rounded-lg border border-steel/20 bg-steel-tint px-4 py-3 text-xs leading-relaxed text-steel">
          {opsNotes.map((n) => (
            <li key={n} className="list-disc list-inside">
              {n}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md bg-canvas px-3 py-2 text-xs text-ink-sub">
          이 포맷에는 고정 운영 프리셋이 아직 없습니다 — 운영가이드에서 직접 작성합니다.
        </p>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="t-card-title">트랙 편성</h4>
          <p className="t-caption">
            판매된 세션 슬롯 {slotDemand}개 · 편성된 세션 {assigned}/{sessions.length}
          </p>
        </div>
        {sessions.length === 0 ? (
          <EmptyState message="프로그램 세션이 없습니다 — 행사 설정에서 프로그램표를 먼저 만들면 여기서 트랙을 나눌 수 있습니다." />
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="ui-table" aria-label="트랙 편성">
              <thead>
                <tr>
                  <th className="ui-th">세션</th>
                  <th className="ui-th">구분</th>
                  <th className="ui-th">트랙</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{s.section ?? '-'}</td>
                    <td>
                      <input
                        defaultValue={s.track ?? ''}
                        onBlur={(e) => void handleTrack(s.id, e.target.value)}
                        aria-label={`${s.title} 트랙`}
                        placeholder="예: Back-office"
                        className="ui-input min-h-8 py-1 text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorAlert message={setTrack.error} />
      </div>
    </div>
  )
}
