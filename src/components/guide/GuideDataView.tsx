// 운영가이드 표 섹션 — 읽기 화면 (설계서 v2.13 §23.5 · 디자인지시서 §7-2.13). 섹션 종류마다 한 모양.
// 인쇄에서도 이 화면이 그대로 나간다(접힘 없음). 금액·개인 연락처는 어떤 섹션에도 없다(R-O6).
import type {
  GuideChecklistsData,
  GuideDayplanData,
  GuideDayplanRow,
  GuideEmergencyRow,
  GuideMark,
  GuideRaciData,
  GuideRadioData,
  GuideRegistrationData,
  GuideSafetyRow,
  GuideSectionData,
  GuideSetupData,
  GuideSetupRow,
  GuideStaffingData,
  GuideStaffingRow,
  GuideVipRow,
} from '../../types/entities'
import { estimateRegistration, guideDateLabel, staffingTotal } from '../../lib/guideStructured'
import { GuideLinesView, GuideRowsView, type GuideColumn } from './GuideRows'

export const SETUP_COLUMNS: GuideColumn<GuideSetupRow>[] = [
  { key: 'date', label: '날짜', short: true, width: '110px', placeholder: guideDateLabel(null, -1) },
  { key: 'time', label: '시각', short: true, width: '120px', placeholder: '09:00–18:00' },
  { key: 'task', label: '작업', placeholder: '설치 · 기술 리허설' },
  { key: 'place', label: '장소', placeholder: '홀·로비' },
  { key: 'owner', label: '담당', width: '140px', placeholder: '우리 · 협력사' },
]

export const STAFFING_COLUMNS: GuideColumn<GuideStaffingRow>[] = [
  { key: 'role', label: '역할', placeholder: '현장 운영 요원' },
  { key: 'count', label: '인원', kind: 'number', width: '72px' },
  { key: 'call_time', label: '콜타임', short: true, width: '96px', placeholder: '12:00' },
  { key: 'duty', label: '주 업무', placeholder: '등록 안내 · 대기열' },
  { key: 'channel', label: '무전', short: true, width: '96px', placeholder: 'CH2' },
]

export const VIP_COLUMNS: GuideColumn<GuideVipRow>[] = [
  { key: 'target', label: '대상', placeholder: '[직함] [이름]' },
  { key: 'arrival', label: '도착', short: true, width: '96px', placeholder: '13:30' },
  { key: 'route', label: '동선 · 대기 공간' },
  { key: 'seat', label: '좌석', width: '120px' },
  { key: 'owner', label: '담당', width: '120px' },
]

export const SAFETY_COLUMNS: GuideColumn<GuideSafetyRow>[] = [
  { key: 'item', label: '항목', short: true, width: '110px' },
  { key: 'action', label: '조치' },
  { key: 'owner', label: '담당', width: '120px' },
]

export const EMERGENCY_COLUMNS: GuideColumn<GuideEmergencyRow>[] = [
  { key: 'situation', label: '상황', width: '150px' },
  { key: 'action', label: '1차 조치' },
  { key: 'owner', label: '담당', width: '120px' },
  { key: 'channel', label: '무전', short: true, width: '80px' },
]

export const DAYPLAN_GROUP_LABELS: Record<GuideDayplanRow['group'], string> = {
  pre: '사전 준비',
  main: '본행사',
  post: '마무리',
}

const MARK_VIEW: Record<GuideMark, { symbol: string; label: string; className: string }> = {
  main: { symbol: '●', label: '주관', className: 'text-accent-deep' },
  help: { symbol: '○', label: '협조', className: 'text-steel' },
  none: { symbol: '—', label: '해당 없음', className: 'text-border-strong' },
}

export function MarkLegend() {
  return (
    <span className="text-xs text-ink-cap">
      <span className="text-accent-deep">●</span> 주관 · <span className="text-steel">○</span> 협조 · — 해당 없음
    </span>
  )
}

function SetupView({ data }: { data: GuideSetupData }) {
  return (
    <div className="space-y-3">
      <GuideRowsView columns={SETUP_COLUMNS} rows={data.rows} empty="설치·철거 일정이 비어 있습니다." />
      <GuideLinesView title="시설 규정 메모" lines={data.notes} />
    </div>
  )
}

function StaffingView({ data }: { data: GuideStaffingData }) {
  return (
    <div className="space-y-2">
      <GuideRowsView columns={STAFFING_COLUMNS} rows={data.rows} empty="현장 인력이 비어 있습니다." />
      <p className="text-sm text-ink">
        <span className="font-semibold">합계 {staffingTotal(data)}명</span>
        <span className="t-caption ml-2">인원을 적은 줄만 더합니다</span>
      </p>
      {data.extra.trim() && <p className="text-sm text-ink-sub">{data.extra}</p>}
    </div>
  )
}

function RadioView({ data }: { data: GuideRadioData }) {
  const chain = data.chain.map((c) => c.trim()).filter(Boolean)
  return (
    <div className="space-y-3">
      {data.channels.length === 0 ? (
        <p className="text-sm text-ink-sub">무전 채널이 비어 있습니다.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-4">
          {data.channels.map((c, i) => (
            <li key={i} className="rounded-lg border border-border px-3 py-2.5">
              <p className="text-base font-bold text-ink">{c.code || '—'}</p>
              <p className="text-sm font-semibold text-ink">{c.name}</p>
              <p className="text-xs text-ink-cap">{c.members}</p>
            </li>
          ))}
        </ul>
      )}
      {chain.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 font-semibold text-ink">지휘 흐름</span>
          {chain.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-ink-cap">
                  →
                </span>
              )}
              <span className="rounded-full bg-track px-2 py-0.5 text-xs font-medium text-brown">{c}</span>
            </span>
          ))}
        </p>
      )}
      {data.rule.trim() && <p className="text-sm text-ink-sub">{data.rule}</p>}
    </div>
  )
}

function RaciView({ data }: { data: GuideRaciData }) {
  if (data.rows.length === 0) return <p className="text-sm text-ink-sub">역할 분담이 비어 있습니다.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="ui-th">업무 영역</th>
            {data.parties.map((p, i) => (
              <th key={i} className="ui-th text-center">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-b border-track">
              <td className="px-3 py-2 align-top text-sm text-ink">
                {r.area}
                {r.note.trim() && <span className="t-caption ml-2">{r.note}</span>}
              </td>
              {r.marks.map((m, j) => {
                const v = MARK_VIEW[m] ?? MARK_VIEW.none
                return (
                  <td key={j} className="px-3 py-2 text-center align-top">
                    <span className={`text-base ${v.className}`} aria-label={`${data.parties[j]} ${v.label}`}>
                      {v.symbol}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DayplanView({ data }: { data: GuideDayplanData }) {
  if (data.rows.length === 0) return <p className="text-sm text-ink-sub">D-day 진행표가 비어 있습니다.</p>
  const groups: GuideDayplanRow['group'][] = ['pre', 'main', 'post']
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="ui-th w-[72px]">시각</th>
            <th className="ui-th w-[190px]">구간</th>
            <th className="ui-th">내용</th>
            <th className="ui-th w-[140px]">무대 · AV</th>
            <th className="ui-th w-[120px]">담당</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((g) => {
            const rows = data.rows.filter((r) => r.group === g)
            if (rows.length === 0) return []
            return [
              <tr key={`g-${g}`} className="ui-table-group">
                <td colSpan={5} className="bg-canvas px-3 py-1.5 text-xs font-semibold text-brown">
                  {DAYPLAN_GROUP_LABELS[g]}
                </td>
              </tr>,
              ...rows.map((r, i) => (
                <tr key={`${g}-${i}`} className="border-b border-track">
                  <td className="whitespace-nowrap px-3 py-2 align-top text-sm tabular-nums text-ink">{r.time || '—'}</td>
                  <td className="px-3 py-2 align-top text-sm font-semibold text-ink">
                    {r.segment}
                    {r.session_id && (
                      <span className="ml-1.5 whitespace-nowrap rounded bg-steel-tint px-1.5 py-0.5 text-[11px] font-medium text-steel">
                        프로그램표
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-sm text-ink-sub">{r.content || '—'}</td>
                  <td className="px-3 py-2 align-top text-sm text-ink-sub">{r.av || '—'}</td>
                  <td className="px-3 py-2 align-top text-sm text-ink-sub">{r.owner || '—'}</td>
                </tr>
              )),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

function ChecklistsView({ data }: { data: GuideChecklistsData }) {
  if (data.blocks.length === 0) return <p className="text-sm text-ink-sub">구간이 비어 있습니다.</p>
  return (
    <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
      {data.blocks.map((b, i) => (
        <section key={i} className="rounded-lg border border-border px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-ink">{b.title || '구간'}</h4>
            <span className="t-caption">{[b.span, b.style === 'check' ? `체크 ${b.items.length}` : ''].filter(Boolean).join(' · ')}</span>
          </div>
          {b.items.length === 0 ? (
            <p className="text-xs text-ink-cap">항목이 없습니다.</p>
          ) : b.style === 'check' ? (
            <ul className="space-y-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-ink">
                  <span aria-hidden className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-border-strong" />
                  {it.text}
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              {b.items.map((it, j) => (
                <li key={j} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 border-t border-track py-1 text-sm first:border-t-0">
                  <span className="whitespace-nowrap font-semibold text-ink">{it.at || '—'}</span>
                  <span className="text-ink-sub">{it.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

export function RegistrationTiles({ data }: { data: GuideRegistrationData }) {
  const est = estimateRegistration(data)
  const within = est.waitMinutes !== null && est.waitMinutes <= 10
  return (
    <div className="flex flex-wrap gap-2">
      <div className="min-w-[140px] rounded-lg border border-track bg-canvas px-3 py-2">
        <p className="t-caption">처리 속도</p>
        <p className="text-lg font-bold tabular-nums text-ink">{est.perMinute === null ? '—' : `${est.perMinute}명 / 분`}</p>
      </div>
      <div className="min-w-[140px] rounded-lg border border-track bg-canvas px-3 py-2">
        <p className="t-caption">쌓이는 줄</p>
        <p className="text-lg font-bold tabular-nums text-ink">{est.queue === null ? '—' : `${est.queue}명`}</p>
      </div>
      <div
        className={`min-w-[140px] rounded-lg border px-3 py-2 ${within ? 'border-positive-tint bg-positive-tint' : 'border-track bg-canvas'}`}
        data-testid="registration-wait"
      >
        <p className={`t-caption ${within ? 'text-positive' : ''}`}>최대 대기</p>
        <p className={`text-lg font-bold tabular-nums ${within ? 'text-positive' : 'text-ink'}`}>
          {est.waitMinutes === null ? '—' : `약 ${est.waitMinutes}분`}
        </p>
      </div>
    </div>
  )
}

function RegistrationView({ data, headcount }: { data: GuideRegistrationData; headcount: number | null }) {
  const est = estimateRegistration(data)
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        접수 라인 <b>{data.lines ?? '—'}</b> · 1인 처리 <b>{data.seconds_per_person ?? '—'}초</b> · 피크{' '}
        <b>{data.peak_minutes ?? '—'}분</b> 동안 도착 <b>{data.peak_arrivals ?? '—'}명</b>
      </p>
      <RegistrationTiles data={data} />
      <p className="t-caption">
        {est.perMinute === null
          ? '접수 라인과 1인 처리 시간을 넣으면 대기 시간을 계산합니다.'
          : '계산 = (피크 도착 − 처리 속도 × 피크 구간) ÷ 처리 속도 · 도착이 구간 안에 고르게 온다는 가정'}
        {headcount ? ` · 예상 인원 ${headcount.toLocaleString('ko-KR')}명(행사 설정)` : ''}
      </p>
      <GuideLinesView title="기프트 · 지급 메모" lines={data.notes} />
    </div>
  )
}

export function GuideDataView({ data, headcount }: { data: GuideSectionData; headcount: number | null }) {
  switch (data.type) {
    case 'setup':
      return <SetupView data={data} />
    case 'staffing':
      return <StaffingView data={data} />
    case 'radio':
      return <RadioView data={data} />
    case 'raci':
      return (
        <div className="space-y-2">
          <MarkLegend />
          <RaciView data={data} />
        </div>
      )
    case 'dayplan':
      return <DayplanView data={data} />
    case 'checklists':
      return <ChecklistsView data={data} />
    case 'registration':
      return <RegistrationView data={data} headcount={headcount} />
    case 'vip':
      return (
        <GuideRowsView
          columns={VIP_COLUMNS}
          rows={data.rows}
          empty="비어 있습니다 — 대상자 명단을 받으면 한 줄씩 추가하세요."
        />
      )
    case 'safety':
      return <GuideRowsView columns={SAFETY_COLUMNS} rows={data.rows} empty="안전관리 항목이 비어 있습니다." />
    case 'emergency':
      return <GuideRowsView columns={EMERGENCY_COLUMNS} rows={data.rows} empty="비상 대응이 비어 있습니다." />
  }
}
