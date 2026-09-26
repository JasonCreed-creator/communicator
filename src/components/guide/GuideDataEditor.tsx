// 운영가이드 표 섹션 — 고치기 화면 (설계서 v2.13 §23.5 · 디자인지시서 §7-2.13). 섹션 종류마다 한 모양.
// 저장은 부모(섹션 카드)가 한다 — 여기서는 바뀐 data를 돌려주기만 한다(content는 provider가 data에서 다시 만든다).
import type {
  GuideChecklistBlock,
  GuideDayplanRow,
  GuideMark,
  GuideRaciRow,
  GuideRadioChannel,
  GuideSectionData,
  ProgramSession,
} from '../../types/entities'
import { dayplanRowsFromSessions, staffingTotal } from '../../lib/guideStructured'
import {
  DAYPLAN_GROUP_LABELS,
  EMERGENCY_COLUMNS,
  MarkLegend,
  RegistrationTiles,
  SAFETY_COLUMNS,
  SETUP_COLUMNS,
  STAFFING_COLUMNS,
  VIP_COLUMNS,
} from './GuideDataView'
import { GuideLinesEditor, GuideRowsEditor, type GuideColumn } from './GuideRows'

const RADIO_COLUMNS: GuideColumn<GuideRadioChannel>[] = [
  { key: 'code', label: '채널', short: true, width: '90px', placeholder: 'CH1' },
  { key: 'name', label: '이름', width: '140px', placeholder: '총괄' },
  { key: 'members', label: '들어가는 사람', placeholder: '총괄 PM · 무대감독' },
]

function numberOrNull(text: string): number | null {
  const t = text.replace(/[,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function NumberField({
  id,
  label,
  value,
  onChange,
  unit,
}: {
  id: string
  label: string
  value: number | null
  onChange: (v: number | null) => void
  unit?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="t-caption">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => onChange(numberOrNull(e.target.value))}
          className="ui-input ui-input-num w-[110px] text-sm"
        />
        {unit && <span className="text-sm text-ink-sub">{unit}</span>}
      </div>
    </div>
  )
}

function RaciEditor({
  parties,
  rows,
  onChange,
}: {
  parties: [string, string, string]
  rows: GuideRaciRow[]
  onChange: (parties: [string, string, string], rows: GuideRaciRow[]) => void
}) {
  const setMark = (i: number, j: number, m: GuideMark) =>
    onChange(
      parties,
      rows.map((r, k) => (k === i ? { ...r, marks: r.marks.map((x, n) => (n === j ? m : x)) as [GuideMark, GuideMark, GuideMark] } : r)),
    )
  const setRow = (i: number, patch: Partial<GuideRaciRow>) => onChange(parties, rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap items-end gap-2">
        <legend className="t-caption mb-1">열 이름</legend>
        {parties.map((p, j) => (
          <input
            key={j}
            value={p}
            onChange={(e) => onChange(parties.map((x, n) => (n === j ? e.target.value : x)) as [string, string, string], rows)}
            aria-label={`${j + 1}번째 열 이름`}
            className="ui-input w-[150px] text-sm"
          />
        ))}
        <MarkLegend />
      </fieldset>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="ui-th">업무 영역</th>
              {parties.map((p, j) => (
                <th key={j} className="ui-th w-[120px]">
                  {p || `${j + 1}번째 열`}
                </th>
              ))}
              <th className="ui-th w-[160px]">메모</th>
              <th className="ui-th w-[64px]">
                <span className="sr-only">행 동작</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-track">
                <td className="px-2 py-1.5 align-top">
                  <input
                    value={r.area}
                    onChange={(e) => setRow(i, { area: e.target.value })}
                    aria-label={`${i + 1}행 업무 영역`}
                    className="ui-input w-full text-sm"
                  />
                </td>
                {r.marks.map((m, j) => (
                  <td key={j} className="px-2 py-1.5 align-top">
                    <select
                      value={m}
                      onChange={(e) => setMark(i, j, e.target.value as GuideMark)}
                      aria-label={`${r.area || `${i + 1}행`} ${parties[j] || `${j + 1}번째 열`}`}
                      className="ui-input ui-select w-full text-sm"
                    >
                      <option value="main">● 주관</option>
                      <option value="help">○ 협조</option>
                      <option value="none">— 없음</option>
                    </select>
                  </td>
                ))}
                <td className="px-2 py-1.5 align-top">
                  <input
                    value={r.note}
                    onChange={(e) => setRow(i, { note: e.target.value })}
                    aria-label={`${r.area || `${i + 1}행`} 메모`}
                    className="ui-input w-full text-sm"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <button
                    type="button"
                    onClick={() => onChange(parties, rows.filter((_, k) => k !== i))}
                    aria-label={`${r.area || `${i + 1}행`} 빼기`}
                    className="btn btn-ghost-negative btn-sm mt-1 px-2"
                  >
                    빼기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onChange(parties, [...rows, { area: '', marks: ['none', 'main', 'none'], note: '' }])}
        className="text-sm font-medium text-accent-deep underline underline-offset-2"
      >
        ＋ 업무 영역 추가
      </button>
    </div>
  )
}

const DAYPLAN_COLUMNS: GuideColumn<GuideDayplanRow>[] = [
  { key: 'time', label: '시각', short: true, width: '96px', placeholder: '09:00' },
  { key: 'segment', label: '구간', width: '170px' },
  { key: 'content', label: '내용' },
  { key: 'av', label: '무대 · AV', width: '130px' },
  { key: 'owner', label: '담당', width: '120px' },
]

function DayplanEditor({
  rows,
  sessions,
  onChange,
}: {
  rows: GuideDayplanRow[]
  sessions: readonly ProgramSession[]
  onChange: (rows: GuideDayplanRow[]) => void
}) {
  const groups: GuideDayplanRow['group'][] = ['pre', 'main', 'post']
  const setGroupRows = (g: GuideDayplanRow['group'], next: GuideDayplanRow[]) =>
    onChange(groups.flatMap((x) => (x === g ? next : rows.filter((r) => r.group === x))))
  const reloadFromProgram = () => {
    if (!window.confirm('본행사 줄을 프로그램표 세션으로 다시 채웁니다. 본행사에 직접 쓴 줄은 사라집니다 — 계속할까요?')) return
    setGroupRows('main', dayplanRowsFromSessions(sessions))
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-brown">{DAYPLAN_GROUP_LABELS[g]}</h4>
            {g === 'main' && (
              <button
                type="button"
                onClick={reloadFromProgram}
                disabled={sessions.length === 0}
                title={sessions.length === 0 ? '프로그램표에 세션이 없습니다' : undefined}
                className="btn btn-ghost btn-sm"
              >
                프로그램표에서 다시 불러오기
              </button>
            )}
          </div>
          <GuideRowsEditor
            columns={DAYPLAN_COLUMNS}
            rows={rows.filter((r) => r.group === g)}
            onChange={(next) => setGroupRows(g, next)}
            newRow={() => ({ group: g, time: '', segment: '', content: '', av: '', owner: '', session_id: null })}
            addLabel={`${DAYPLAN_GROUP_LABELS[g]} 줄 추가`}
            rowLabel={(r, i) => `${DAYPLAN_GROUP_LABELS[g]} ${r.segment || `${i + 1}행`}`}
          />
        </section>
      ))}
    </div>
  )
}

function ChecklistsEditor({
  blocks,
  onChange,
}: {
  blocks: GuideChecklistBlock[]
  onChange: (blocks: GuideChecklistBlock[]) => void
}) {
  const setBlock = (i: number, patch: Partial<GuideChecklistBlock>) =>
    onChange(blocks.map((b, k) => (k === i ? { ...b, ...patch } : b)))
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        const name = b.title || `${i + 1}번째 구간`
        return (
          <section key={i} className="space-y-2 rounded-lg border border-border px-4 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={b.title}
                onChange={(e) => setBlock(i, { title: e.target.value })}
                aria-label={`${i + 1}번째 구간 이름`}
                placeholder="구간 이름"
                className="ui-input w-[200px] text-sm font-semibold"
              />
              <input
                value={b.span}
                onChange={(e) => setBlock(i, { span: e.target.value })}
                aria-label={`${name} 시간`}
                placeholder="12:45까지 · 20분"
                className="ui-input w-[150px] text-sm"
              />
              <select
                value={b.style}
                onChange={(e) => setBlock(i, { style: e.target.value as GuideChecklistBlock['style'] })}
                aria-label={`${name} 모양`}
                className="ui-input ui-select w-[140px] text-sm"
              >
                <option value="check">체크 목록</option>
                <option value="timeline">시각 · 할 일</option>
              </select>
              <button
                type="button"
                onClick={() => onChange(blocks.filter((_, k) => k !== i))}
                aria-label={`${name} 구간 빼기`}
                className="btn btn-ghost-negative btn-sm ml-auto"
              >
                구간 빼기
              </button>
            </div>
            <GuideRowsEditor
              columns={
                b.style === 'check'
                  ? [{ key: 'text', label: '확인할 것' }]
                  : [
                      { key: 'at', label: '시각 · 소요', short: true, width: '110px', placeholder: '15분' },
                      { key: 'text', label: '할 일' },
                    ]
              }
              rows={b.items}
              onChange={(items) => setBlock(i, { items })}
              newRow={() => ({ at: '', text: '' })}
              addLabel="항목 추가"
              rowLabel={(it, k) => `${name} ${it.text || `${k + 1}행`}`}
            />
          </section>
        )
      })}
      <button
        type="button"
        onClick={() => onChange([...blocks, { title: '', span: '', style: 'check', items: [] }])}
        className="text-sm font-medium text-accent-deep underline underline-offset-2"
      >
        ＋ 구간 추가
      </button>
    </div>
  )
}

export function GuideDataEditor({
  data,
  sessions,
  onChange,
  idPrefix,
}: {
  data: GuideSectionData
  sessions: readonly ProgramSession[]
  onChange: (next: GuideSectionData) => void
  /** 입력 id 접두어 — 같은 화면에 여러 섹션 편집이 열려도 겹치지 않게 */
  idPrefix: string
}) {
  switch (data.type) {
    case 'setup':
      return (
        <div className="space-y-4">
          <GuideRowsEditor
            columns={SETUP_COLUMNS}
            rows={data.rows}
            onChange={(rows) => onChange({ ...data, rows })}
            newRow={() => ({ date: '', time: '', task: '', place: '', owner: '' })}
            addLabel="일정 줄 추가"
            rowLabel={(r, i) => r.task || `${i + 1}행`}
          />
          <GuideLinesEditor label="시설 규정 메모" lines={data.notes} onChange={(notes) => onChange({ ...data, notes })} addLabel="메모 추가" />
        </div>
      )
    case 'staffing':
      return (
        <div className="space-y-3">
          <GuideRowsEditor
            columns={STAFFING_COLUMNS}
            rows={data.rows}
            onChange={(rows) => onChange({ ...data, rows })}
            newRow={() => ({ role: '', count: null, call_time: '', duty: '', channel: '' })}
            addLabel="역할 추가"
            rowLabel={(r, i) => r.role || `${i + 1}행`}
          />
          <p className="text-sm font-semibold text-ink">합계 {staffingTotal(data)}명</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-extra`} className="t-caption">
              별도 인력
            </label>
            <input
              id={`${idPrefix}-extra`}
              value={data.extra}
              onChange={(e) => onChange({ ...data, extra: e.target.value })}
              className="ui-input w-full text-sm"
            />
          </div>
        </div>
      )
    case 'radio':
      return (
        <div className="space-y-4">
          <GuideRowsEditor
            columns={RADIO_COLUMNS}
            rows={data.channels}
            onChange={(channels) => onChange({ ...data, channels })}
            newRow={() => ({ code: `CH${data.channels.length + 1}`, name: '', members: '' })}
            addLabel="채널 추가"
            rowLabel={(c, i) => c.code || `${i + 1}행`}
          />
          <GuideLinesEditor label="지휘 흐름(위에서 아래로)" lines={data.chain} onChange={(chain) => onChange({ ...data, chain })} addLabel="단계 추가" />
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-rule`} className="t-caption">
              변경 결정 규칙
            </label>
            <input
              id={`${idPrefix}-rule`}
              value={data.rule}
              onChange={(e) => onChange({ ...data, rule: e.target.value })}
              className="ui-input w-full text-sm"
            />
          </div>
        </div>
      )
    case 'raci':
      return <RaciEditor parties={data.parties} rows={data.rows} onChange={(parties, rows) => onChange({ ...data, parties, rows })} />
    case 'dayplan':
      return <DayplanEditor rows={data.rows} sessions={sessions} onChange={(rows) => onChange({ ...data, rows })} />
    case 'checklists':
      return <ChecklistsEditor blocks={data.blocks} onChange={(blocks) => onChange({ ...data, blocks })} />
    case 'registration':
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <NumberField id={`${idPrefix}-lines`} label="접수 라인" value={data.lines} onChange={(lines) => onChange({ ...data, lines })} unit="라인" />
            <NumberField
              id={`${idPrefix}-sec`}
              label="1인 처리 시간"
              value={data.seconds_per_person}
              onChange={(seconds_per_person) => onChange({ ...data, seconds_per_person })}
              unit="초"
            />
            <NumberField
              id={`${idPrefix}-min`}
              label="피크 구간"
              value={data.peak_minutes}
              onChange={(peak_minutes) => onChange({ ...data, peak_minutes })}
              unit="분"
            />
            <NumberField
              id={`${idPrefix}-arr`}
              label="피크 도착 인원"
              value={data.peak_arrivals}
              onChange={(peak_arrivals) => onChange({ ...data, peak_arrivals })}
              unit="명"
            />
          </div>
          <RegistrationTiles data={data} />
          <GuideLinesEditor label="기프트 · 지급 메모" lines={data.notes} onChange={(notes) => onChange({ ...data, notes })} addLabel="메모 추가" />
        </div>
      )
    case 'vip':
      return (
        <GuideRowsEditor
          columns={VIP_COLUMNS}
          rows={data.rows}
          onChange={(rows) => onChange({ ...data, rows })}
          newRow={() => ({ target: '', arrival: '', route: '', seat: '', owner: '' })}
          addLabel="대상 추가"
          rowLabel={(r, i) => r.target || `${i + 1}행`}
        />
      )
    case 'safety':
      return (
        <GuideRowsEditor
          columns={SAFETY_COLUMNS}
          rows={data.rows}
          onChange={(rows) => onChange({ ...data, rows })}
          newRow={() => ({ item: '', action: '', owner: '' })}
          addLabel="항목 추가"
          rowLabel={(r, i) => r.item || `${i + 1}행`}
        />
      )
    case 'emergency':
      return (
        <GuideRowsEditor
          columns={EMERGENCY_COLUMNS}
          rows={data.rows}
          onChange={(rows) => onChange({ ...data, rows })}
          newRow={() => ({ situation: '', action: '', owner: '', channel: '' })}
          addLabel="상황 추가"
          rowLabel={(r, i) => r.situation || `${i + 1}행`}
        />
      )
  }
}
