// 마스터 시트 조립 — 순수 함수 (설계서 v2.21 §27.5 · Phase 6.11 PR-G).
// 서버(api/_lib/masterSheet/handler — 사용자 JWT로 읽은 MasterSheetSource)와 앱 테스트(mock 픽스처)가 같은 함수를 쓴다.
// 런타임 import는 전부 `.js`(Vercel Functions ESM 규약 — CLAUDE.md §6) · 이 파일은 DataProvider·화면·Drive를 모른다.
//
// 탭 7 고정(R-M4 — 담당자별 변형 없음):
//   개요(행사 ID · 필수 4 · 일시 · 인원 · 담당자 이름·역할 · 참고 문서 · 랜딩 · 등록 시트) · WBS(Lv1·Lv2·Task·담당자·소통 대상·D-n·
//   시작·종료·상태 + 일별 간트 열 D-60~D+7 · 마일스톤 ◆) · R&R(역할·사람·표시 역할·책임) · 제작물(디자인 항목 규격·담당·마감·상태·
//   최신 버전·납품) · 운영(운영가이드 섹션 전부 — 답사 · 설치 도면 링크 · 참가자 안내 원고 포함(내부용) · 현장 운영 표 9종 ·
//   존별·비상 — 연락망 0) · 등록(**통계만** — 명단·개인정보 0 · 연동 시트 링크) · 견적·정산(pm·admin만 — 버킷 3단 · 마진 · 발주 항목).
// 금지: 이메일·전화·참가자 명단(어떤 탭에도 0) · 금액 키를 견적·정산 탭 밖에 · 데이터에 없는 값을 지어내기(빈 칸은 빈 칸).
import { GUIDE_KIND_META, MESSAGING_CHANNEL_LABELS, MESSAGING_STATUS_LABELS, SURVEY_SCOPE_LABELS, estimateRegistration, staffingTotal } from '../guideStructured.js'
import { AREA_LABELS, EVENT_TYPE_LABELS, PROJECT_KIND_LABELS, ROLE_LABELS, STATUS_LABELS } from '../labels.js'
import { projectLabel } from '../projectLabel.js'
import { REFERENCE_LINK_KIND_LABELS } from '../referenceLinks.js'
import { addDays, isDelayed } from '../wbs.js'
import { EVENT_FORMAT_LABELS, SHEET_STATE_LABELS } from '../../types/enums.js'
import type { GuideMark, GuideSection, GuideSectionData, IsoDate, SettlementItemStatus } from '../../types/entities'
import type { LandingStatus, MemberRole } from '../../types/enums'
import type { MasterSheet, MasterSheetCell, MasterSheetOptions, MasterSheetSource, MasterSheetTab } from './types'

/** 탭 이름 정본(순서 고정) — 견적·정산은 pm·admin에게만 */
export const MASTER_SHEET_TAB_TITLES = {
  overview: '개요',
  wbs: 'WBS',
  rnr: 'R&R',
  production: '제작물',
  ops: '운영',
  registration: '등록',
  money: '견적·정산',
} as const

/** 간트 열 범위 — 시트의 일별 간트(D-60 ~ D+7) */
export const GANTT_FROM = -60
export const GANTT_TO = 7
export const GANTT_MARK = '■'
export const MILESTONE_MARK = '◆'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** WBS 상태 글 — components/wbs/wbsFormat.ts의 WBS_STATUS_LABELS와 같다(화면 모듈을 lib이 끌지 않는다) */
const WBS_STATUS_TEXT = { todo: '미착수', doing: '진행', done: '완료' } as const
const WBS_DELAYED_TEXT = '지연'
/** 발주 항목 상태 글 — components/settlement/SettlementItems.tsx와 같다 */
const SETTLEMENT_STATUS_TEXT: Record<SettlementItemStatus, string> = { planned: '계획', ordered: '발주', settled: '정산 완료', cancelled: '취소' }
const LANDING_STATUS_TEXT: Record<LandingStatus, string> = { draft: '초안', published: '발행됨', closed: '마감' }
const MARK_TEXT: Record<GuideMark, string> = { main: '●', help: '○', none: '—' }
const DAYPLAN_GROUP_TEXT = { pre: '사전', main: '본행사', post: '사후' } as const

const ROLE_ORDER: readonly MemberRole[] = ['pm', 'design', 'ops', 'reg']

function yymmdd(iso: IsoDate): string {
  const m = /^\d{2}(\d{2})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}${m[2]}${m[3]}` : iso.replace(/-/g, '').slice(2, 8)
}

function shortDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return ''
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`)
  return `${Number(m[2])}/${Number(m[3])}(${WEEKDAYS[d.getUTCDay()]})`
}

function pct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

function text(v: string | number | null | undefined): MasterSheetCell {
  if (v === null || v === undefined) return ''
  return typeof v === 'number' ? v : v
}

function lines(content: string | null | undefined): string[] {
  return (content ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0)
}

function offsetLabel(n: number): string {
  return n === 0 ? 'D-day' : n < 0 ? `D${n}` : `D+${n}`
}

/** 파일 이름 = {행사 ID}_마스터시트_{YYMMDD} — 행사 ID는 projectLabel(저장 안 함 · Drive 폴더 이름과 같은 함수) */
export function masterSheetFileName(project: MasterSheetSource['project'], today: IsoDate): string {
  return `${projectLabel(project)}_마스터시트_${yymmdd(today)}`
}

// ── 개요 ─────────────────────────────────────────────────────────────
function overviewTab(src: MasterSheetSource): MasterSheetTab {
  const p = src.project
  const rows: MasterSheetCell[][] = []
  const kv = (label: string, value: MasterSheetCell, note: MasterSheetCell = '') => rows.push([label, text(value), text(note)])
  kv('행사 ID', projectLabel(p), '행사일 · 고객사 · 행사명에서 파생(YYMMDD_고객사_행사명)')
  kv('행사명', p.name)
  kv('고객사(주최·주관)', p.organizer)
  kv('성격 · 유형', `${PROJECT_KIND_LABELS[p.kind]} · ${EVENT_TYPE_LABELS[p.event_type]} · ${EVENT_FORMAT_LABELS[p.format]}`)
  kv('행사일', p.event_date ? `${p.event_date}${p.event_end_date && p.event_end_date !== p.event_date ? ` ~ ${p.event_end_date}` : ''}` : '')
  kv('시간', p.start_time || p.end_time ? `${p.start_time ?? ''} ~ ${p.end_time ?? ''}`.trim() : '')
  kv('장소', p.venue)
  kv('예상 인원', p.expected_headcount)
  kv('좌석', p.seating)
  kv('참가 대상', p.target_audience)
  kv('주제', p.theme)
  kv('MC', p.mc_name)
  kv('상태', p.status === 'closed' ? '종료' : '진행 중', p.onboarded_at ? '세팅 완료' : '세팅 미완료')
  if (p.event_type === 'recruiting') {
    kv('보장 인원', p.guarantee_pax)
    kv('쇼업 KPI', p.kpi_show_rate === null ? '' : pct(p.kpi_show_rate))
    if (p.targeting) {
      const t = p.targeting
      kv('타겟팅', [t.company_size, t.title, t.industry, t.job, t.region].map((a) => a.join('/')).filter(Boolean).join(' · '))
    }
  }
  rows.push(['', '', ''])
  rows.push(['담당자', '', ''])
  const members = [...src.members].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name))
  for (const m of members) kv(`  ${ROLE_LABELS[m.role]}`, m.name, m.title ?? '')
  if (members.length === 0) kv('  (없음)', '')
  for (const item of p.overview_items ?? []) {
    if (item.label.trim() || item.value.trim()) kv(item.label, item.value)
  }
  rows.push(['', '', ''])
  rows.push(['참고 문서', '', ''])
  const links = p.reference_links ?? []
  for (const l of links) kv(`  ${REFERENCE_LINK_KIND_LABELS[l.kind]}`, l.title || l.url, l.url)
  if (links.length === 0) kv('  (없음)', '')
  rows.push(['', '', ''])
  rows.push(['랜딩페이지', '', ''])
  for (const l of src.landing_pages) kv(`  ${l.title}`, LANDING_STATUS_TEXT[l.status], l.public_url ?? '')
  if (src.landing_pages.length === 0) kv('  (없음)', '')
  const sl = src.registration.sheet_link
  if (sl) {
    rows.push(['', '', ''])
    rows.push(['등록 연동 시트', '', ''])
    kv('  상태', SHEET_STATE_LABELS[sl.state], sl.snapshot_at ? `기준 ${sl.snapshot_at}` : '')
    kv('  시트', sl.title ?? '', sl.url ?? '')
    kv('  탭', sl.tab_name ?? '')
  }
  const bold = rows.flatMap((r, i) => (r[1] === '' && r[2] === '' && typeof r[0] === 'string' && r[0] && !r[0].startsWith('  ') ? [i] : []))
  return { title: MASTER_SHEET_TAB_TITLES.overview, columns: [], rows, frozen_rows: 0, frozen_cols: 1, widths: [180, 360, 360], bold_rows: bold }
}

// ── WBS ─────────────────────────────────────────────────────────────
export interface GanttColumn {
  offset: number
  date: IsoDate
  header: string
}

/** 간트 열 — 행사일이 없으면 [] */
export function ganttColumns(eventDate: IsoDate | null): GanttColumn[] {
  if (!eventDate) return []
  const out: GanttColumn[] = []
  for (let n = GANTT_FROM; n <= GANTT_TO; n++) {
    const date = addDays(eventDate, n)
    out.push({ offset: n, date, header: n === 0 ? `D-day ${shortDate(date)}` : shortDate(date) })
  }
  return out
}

function wbsTab(src: MasterSheetSource, today: IsoDate): MasterSheetTab {
  const gantt = ganttColumns(src.project.event_date)
  const columns = ['단계(Lv1)', '묶음(Lv2)', '코드', '태스크', '담당 역할', '담당자', '소통 대상', 'D-n 시작', 'D-n 종료', '시작일', '종료일', '상태', '메모', ...gantt.map((g) => g.header)]
  const nameOf = new Map(src.members.map((m) => [m.user_id, m.name]))
  const rows: MasterSheetCell[][] = []
  const span = (from: string | null, to: string | null): MasterSheetCell[] =>
    gantt.map((g) => (from && to && g.date >= from && g.date <= to ? GANTT_MARK : ''))
  const milestones = [...src.milestones].sort((a, b) => a.due_date.localeCompare(b.due_date))
  for (const m of milestones) {
    rows.push([
      '마일스톤', '', '', `${MILESTONE_MARK} ${m.title}`, m.area ? AREA_LABELS[m.area] : '', '', '', '', '', '', m.due_date,
      m.done ? '완료' : m.due_date < today ? '지남' : '',
      '',
      ...gantt.map((g) => (g.date === m.due_date ? MILESTONE_MARK : '')),
    ])
  }
  const tasks = [...src.wbs_tasks].sort((a, b) => a.phase_no - b.phase_no || a.sort_order - b.sort_order)
  for (const t of tasks) {
    const status = isDelayed(t, today) ? WBS_DELAYED_TEXT : WBS_STATUS_TEXT[t.status]
    rows.push([
      `${t.phase_no}. ${t.phase_name}`, t.group_name ?? '', t.code, t.title, ROLE_LABELS[t.role],
      t.assignee_id ? nameOf.get(t.assignee_id) ?? '' : '', t.target ?? '',
      offsetLabel(t.offset_start), offsetLabel(t.offset_end), t.start_date ?? '', t.end_date ?? '', status, t.note ?? '',
      ...span(t.start_date, t.end_date),
    ])
  }
  const widths = [140, 120, 60, 260, 70, 90, 110, 70, 70, 90, 90, 60, 160, ...gantt.map(() => 30)]
  return { title: MASTER_SHEET_TAB_TITLES.wbs, columns, rows, frozen_rows: 1, frozen_cols: 4, widths, bold_rows: [] }
}

// ── R&R ─────────────────────────────────────────────────────────────
function rnrTab(src: MasterSheetSource): MasterSheetTab {
  const charters = [...src.role_charters].sort(
    (a, b) => ROLE_ORDER.indexOf(a.charter.role) - ROLE_ORDER.indexOf(b.charter.role) || a.charter.title.localeCompare(b.charter.title),
  )
  const rows: MasterSheetCell[][] = []
  for (const c of charters) {
    const people = c.people.length ? c.people : [{ name: '', display_role: '' }]
    people.forEach((p, i) => {
      rows.push([ROLE_LABELS[c.charter.role], c.charter.title, p.name, p.display_role, i === 0 ? c.charter.items.map((it) => `• ${it}`).join('\n') : ''])
    })
  }
  return {
    title: MASTER_SHEET_TAB_TITLES.rnr,
    columns: ['권한 역할', '카드', '담당자', '표시 역할', '책임'],
    rows,
    frozen_rows: 1,
    frozen_cols: 2,
    widths: [80, 180, 100, 140, 420],
    bold_rows: [],
  }
}

// ── 제작물 ───────────────────────────────────────────────────────────
function productionTab(src: MasterSheetSource): MasterSheetTab {
  const rows: MasterSheetCell[][] = []
  for (const { deliverable: d, latest_version: v, assignee_name } of src.deliverables) {
    if (d.area !== 'design') continue
    rows.push([
      d.category, d.title, d.spec_size ?? '', d.spec_qty ?? '', d.spec_location ?? '', d.spec_type ?? '',
      assignee_name ?? '', d.due_date ?? '', STATUS_LABELS[d.status],
      v ? `v${v.version_no}` : '', v ? v.file_name : '', d.status === 'final' ? '완료' : '',
      d.brief ?? '',
    ])
  }
  return {
    title: MASTER_SHEET_TAB_TITLES.production,
    columns: ['카테고리', '항목', '사이즈', '수량', '위치', '종류', '담당', '마감', '상태', '최신 버전', '파일', '납품', '제작 가이드'],
    rows,
    frozen_rows: 1,
    frozen_cols: 2,
    widths: [100, 220, 110, 50, 120, 90, 80, 90, 70, 70, 220, 60, 300],
    bold_rows: [],
  }
}

// ── 운영(운영가이드 섹션) ─────────────────────────────────────────────
type Block = { title: string; note?: string; header: string[]; rows: MasterSheetCell[][] }

function sectionBlock(s: GuideSection, src: MasterSheetSource): Block {
  const title = s.title || GUIDE_KIND_META[s.kind].title
  const note = s.source_stale ? '원본 변경 있음 — 확인 필요' : undefined
  const d: GuideSectionData | null | undefined = s.data
  const md = (): Block => ({ title, note, header: [], rows: lines(s.content).map((l) => [l]) })
  if (!d) return md()
  switch (d.type) {
    case 'survey':
      return {
        title,
        note: [d.visited_on ? `답사일 ${d.visited_on}` : '', note ?? ''].filter(Boolean).join(' · ') || undefined,
        header: ['구분', '항목', '세부', '체크 사항', '확인 내용', '담당'],
        rows: [
          ...d.rows.map((r): MasterSheetCell[] => [SURVEY_SCOPE_LABELS[r.scope], r.item, r.detail, r.check, r.finding, r.owner]),
          ...d.notes.map((n): MasterSheetCell[] => ['비고', n]),
        ],
      }
    case 'setup':
      return {
        title, note,
        header: ['날짜', '시간', '작업', '장소', '담당'],
        rows: [...d.rows.map((r): MasterSheetCell[] => [r.date, r.time, r.task, r.place, r.owner]), ...d.notes.map((n): MasterSheetCell[] => ['비고', n])],
      }
    case 'floorplan': {
      const byId = new Map(src.deliverables.map((x) => [x.deliverable.id, x]))
      return {
        title, note,
        header: ['도면', '연결 항목', '최신 버전', '파일', '비고'],
        rows: d.items.map((it, i): MasterSheetCell[] => {
          const ref = it.deliverable_id ? byId.get(it.deliverable_id) ?? null : null
          return [it.title || ref?.deliverable.title || `도면 ${i + 1}`, ref?.deliverable.title ?? '', ref?.latest_version ? `v${ref.latest_version.version_no}` : '', ref?.latest_version?.file_name ?? '', it.note]
        }),
      }
    }
    case 'staffing':
      return {
        title, note,
        header: ['역할', '인원', '콜타임', '업무', '채널'],
        rows: [
          ...d.rows.map((r): MasterSheetCell[] => [r.role, r.count, r.call_time, r.duty, r.channel]),
          ['합계', staffingTotal(d)],
          ...(d.extra.trim() ? [['비고', d.extra] as MasterSheetCell[]] : []),
        ],
      }
    case 'radio':
      return {
        title, note,
        header: ['채널', '이름', '구성원'],
        rows: [
          ...d.channels.map((c): MasterSheetCell[] => [c.code, c.name, c.members]),
          ...(d.chain.length ? [['지휘 흐름', d.chain.join(' → ')] as MasterSheetCell[]] : []),
          ...(d.rule.trim() ? [['규칙', d.rule] as MasterSheetCell[]] : []),
        ],
      }
    case 'raci':
      return {
        title, note,
        header: ['영역', d.parties[0], d.parties[1], d.parties[2], '비고'],
        rows: d.rows.map((r): MasterSheetCell[] => [r.area, MARK_TEXT[r.marks[0]], MARK_TEXT[r.marks[1]], MARK_TEXT[r.marks[2]], r.note]),
      }
    case 'dayplan':
      return {
        title, note,
        header: ['구분', '시각', '구간', '내용', 'AV', '담당'],
        rows: d.rows.map((r): MasterSheetCell[] => [DAYPLAN_GROUP_TEXT[r.group], r.time, r.segment, r.content, r.av, r.owner]),
      }
    case 'checklists':
      return {
        title, note,
        header: ['묶음', '구간', '시각 · 체크', '내용'],
        rows: d.blocks.flatMap((b) => b.items.map((it): MasterSheetCell[] => [b.title, b.span, it.at, it.text])),
      }
    case 'messaging':
      return {
        title, note,
        header: ['단계', '발송일', '시각', '채널', '대상', '제목', '원고(내부용)', '상태'],
        rows: d.rows.map((r): MasterSheetCell[] => [r.stage, r.send_on ?? '', r.send_at ?? '', MESSAGING_CHANNEL_LABELS[r.channel], r.audience, r.subject, r.body, MESSAGING_STATUS_LABELS[r.status]]),
      }
    case 'registration': {
      const est = estimateRegistration(d)
      return {
        title, note,
        header: ['항목', '값'],
        rows: [
          ['동시 처리 줄', d.lines], ['1인 처리(초)', d.seconds_per_person], ['피크 구간(분)', d.peak_minutes], ['피크 도착(명)', d.peak_arrivals],
          ['분당 처리(명)', est.perMinute], ['피크 끝 남는 줄(명)', est.queue], ['최대 대기(분)', est.waitMinutes],
          ...d.notes.map((n): MasterSheetCell[] => ['비고', n]),
        ],
      }
    }
    case 'vip':
      return { title, note, header: ['대상', '도착', '동선', '좌석', '담당'], rows: d.rows.map((r): MasterSheetCell[] => [r.target, r.arrival, r.route, r.seat, r.owner]) }
    case 'safety':
      return { title, note, header: ['항목', '조치', '담당'], rows: d.rows.map((r): MasterSheetCell[] => [r.item, r.action, r.owner]) }
    case 'emergency':
      return { title, note, header: ['상황', '조치', '담당', '채널'], rows: d.rows.map((r): MasterSheetCell[] => [r.situation, r.action, r.owner, r.channel]) }
    default:
      return md()
  }
}

function opsTab(src: MasterSheetSource): MasterSheetTab {
  const rows: MasterSheetCell[][] = []
  const bold: number[] = []
  const sections = src.guide_sections.filter((s) => s.kind !== 'contacts')
  if (sections.length === 0) {
    rows.push(['운영가이드가 아직 없습니다 — 운영 보드에서 운영가이드를 만들면 답사·설치·인력·참가자 안내가 여기에 실립니다.'])
  }
  sections.forEach((s, i) => {
    if (i > 0) rows.push([''])
    const b = sectionBlock(s, src)
    bold.push(rows.length)
    rows.push([`■ ${b.title}`, b.note ?? ''])
    if (b.header.length) rows.push([...b.header])
    if (b.rows.length === 0) rows.push(['(비어 있음)'])
    for (const r of b.rows) rows.push(r.map(text))
  })
  return {
    title: MASTER_SHEET_TAB_TITLES.ops,
    columns: [],
    rows,
    frozen_rows: 0,
    frozen_cols: 0,
    widths: [180, 160, 160, 200, 220, 140, 260, 100],
    bold_rows: bold,
  }
}

// ── 등록(통계만) ──────────────────────────────────────────────────────
function registrationTab(src: MasterSheetSource): MasterSheetTab {
  const rows: MasterSheetCell[][] = []
  const bold: number[] = []
  const kv = (label: string, value: MasterSheetCell, note: MasterSheetCell = '') => rows.push([label, text(value), text(note)])
  const p = src.project
  bold.push(rows.length)
  rows.push(['목표', '', ''])
  kv('예상 인원', p.expected_headcount)
  if (p.event_type === 'recruiting') {
    kv('보장 인원', p.guarantee_pax)
    kv('쇼업 KPI', p.kpi_show_rate === null ? '' : pct(p.kpi_show_rate))
  }
  rows.push(['', '', ''])
  const sheet = src.registration.sheet
  const link = src.registration.sheet_link
  if (sheet && link) {
    bold.push(rows.length)
    rows.push(['등록 현황 — 연동 시트 기준', '', ''])
    kv('시트', link.title ?? '', link.url ?? '')
    kv('탭', link.tab_name ?? '')
    kv('연동 상태', SHEET_STATE_LABELS[link.state])
    kv('기준 시각', sheet.snapshot_at ?? '')
    kv('신청', sheet.applied)
    kv('확정', sheet.confirmed, `확정률 ${pct(sheet.confirm_rate)}`)
    kv('취소', sheet.cancelled, `확정 후 취소 ${sheet.cancelled_after_confirm}`)
    kv('체크인', sheet.checked_in, `체크인율 ${pct(sheet.checkin_rate)}`)
    kv('시트 행', sheet.source_rows, `제외 ${sheet.excluded}`)
    kv('반영 대기', `추가 ${sheet.pending_added} · 제거 ${sheet.pending_removed}`)
  } else {
    const r = src.registration.rsvp
    bold.push(rows.length)
    rows.push(['등록 현황 — RSVP 기준', '', ''])
    kv('초대 대상', r.rsvp_total)
    kv('초대 발송', r.rsvp_sent)
    kv('참석 응답', r.rsvp_accepted)
    kv('불참 응답', r.rsvp_declined)
    kv('응답률', pct(r.response_rate))
    kv('참관객(등록)', r.attendee_total)
    kv('체크인', r.checked_in, `체크인율 ${pct(r.checkin_rate)}`)
  }
  rows.push(['', '', ''])
  rows.push(['참가자 명단·연락처는 이 시트에 싣지 않습니다 — 등록 보드(앱)에서 확인하세요.', '', ''])
  return { title: MASTER_SHEET_TAB_TITLES.registration, columns: [], rows, frozen_rows: 0, frozen_cols: 1, widths: [200, 200, 300], bold_rows: bold }
}

// ── 견적·정산(pm·admin만) ────────────────────────────────────────────
function moneyTab(src: MasterSheetSource): MasterSheetTab {
  const rows: MasterSheetCell[][] = []
  const bold: number[] = []
  const view = src.settlement
  if (!view) {
    rows.push(['정산보드가 아직 없습니다 — 정산보드에서 확정 견적으로 정산을 시작하면 버킷·발주·실집행이 여기에 실립니다.'])
    return { title: MASTER_SHEET_TAB_TITLES.money, columns: [], rows, frozen_rows: 0, frozen_cols: 0, widths: [600], bold_rows: [] }
  }
  const t = view.totals
  bold.push(rows.length)
  rows.push(['요약', '', ''])
  rows.push(['기준 견적', view.quote_label ?? '(견적 정보 없음)', view.board.quote_version ? `v${view.board.quote_version}` : ''])
  rows.push(['기준 시각', view.board.baselined_at, ''])
  rows.push(['마진 기준 계약액', t.marginBase, '마진 기준 버킷의 견적 합'])
  rows.push(['발주 합', t.totalOrdered, '표시용'])
  rows.push(['실집행 합', t.totalActual, ''])
  rows.push(['최종 마진', t.finalMargin, t.marginRate === null ? '' : `마진율 ${pct(t.marginRate)}`])
  rows.push(['검산', t.identityOk ? '일치' : '어긋남', '마진 기준 계약액 − 실집행 합 = 최종 마진'])
  rows.push(['견적 초과 버킷', t.overBudgetCount, ''])
  for (const e of t.excluded) rows.push([`마진 기준 밖 · ${e.label}`, e.amount, e.code])
  rows.push(['', '', ''])
  bold.push(rows.length)
  rows.push(['버킷', '코드', '견적', '발주', '실집행', '마크업', '마크업률', '초과', '원가', '마진 기준', '출처'])
  for (const b of view.buckets) {
    rows.push([
      b.bucket.label, b.bucket.code, b.bucket.quote_amount, b.ordered, b.actual, b.markup,
      b.markup_rate === null ? '' : pct(b.markup_rate), b.over_budget ? '초과' : '',
      b.bucket.has_cost ? '있음' : '없음', b.bucket.is_margin_base ? '포함' : '제외', b.bucket.source === 'quote' ? '견적' : '행사별',
    ])
  }
  rows.push(['', '', ''])
  bold.push(rows.length)
  rows.push(['발주 항목', '버킷', '규격', '상태', '발주 금액', '실집행 금액', '메모', '근거'])
  let items = 0
  for (const b of view.buckets) {
    for (const it of b.items) {
      items++
      rows.push([it.title, b.bucket.label, it.spec ?? '', SETTLEMENT_STATUS_TEXT[it.status], it.ordered_amount ?? '', it.actual_amount ?? '', it.note ?? '', it.evidence ?? ''])
    }
  }
  if (items === 0) rows.push(['(발주 항목 없음)'])
  return {
    title: MASTER_SHEET_TAB_TITLES.money,
    columns: [],
    rows,
    frozen_rows: 0,
    frozen_cols: 1,
    widths: [200, 120, 110, 110, 110, 110, 90, 60, 60, 70, 70],
    bold_rows: bold,
  }
}

/** 조립 정본 — 탭 순서 고정. include_money가 아니면 견적·정산 탭 자체가 없다(R-M3) */
export function buildMasterSheet(src: MasterSheetSource, opts: MasterSheetOptions): MasterSheet {
  const tabs: MasterSheetTab[] = [overviewTab(src), wbsTab(src, opts.today), rnrTab(src), productionTab(src), opsTab(src), registrationTab(src)]
  if (opts.include_money) tabs.push(moneyTab(src))
  return { title: masterSheetFileName(src.project, opts.today), tabs, includes_money: opts.include_money }
}

/** 시트의 모든 글 칸(테스트·가드용 — 이메일·전화·금액 키 검사) */
export function masterSheetTexts(sheet: MasterSheet): string[] {
  const out: string[] = []
  for (const t of sheet.tabs) {
    out.push(t.title, ...t.columns)
    for (const r of t.rows) for (const c of r) if (typeof c === 'string' && c) out.push(c)
  }
  return out
}

/** 시트 한 탭의 실제 열 수(머리·본문 가운데 가장 긴 줄) */
export function tabColumnCount(tab: MasterSheetTab): number {
  return Math.max(tab.columns.length, ...tab.rows.map((r) => r.length), 1)
}


