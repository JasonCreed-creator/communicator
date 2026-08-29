// v2.6 §24 — 등록 명단 구글 시트 연동 데모 픽스처.
// #RULE-NO-COMPANY: 인물·기관은 전부 가상 명칭이고, 연락처는 합성 도메인(example.com)만 쓴다.
//
// 어디에 붙는가: **데모 기본 선택 행사(RE:BUILD 27 = 첫 active 행사)** 1건에만 연결을 만든다.
// 나머지 행사는 연결 행이 없어 getSheetConnection이 null(미연결 빈 상태)을 돌려준다 —
// 기존 등록 테스트(dod4·registration-*)가 쓰는 샘플 테크(prj-stc26)는 손대지 않는다.
//
// 상태: 시안과 같은 **'갱신 있음'(stale)** — 대기 중 차이는 추가 2 · 변경 1 · 제거 1.
// 차이는 저장된 숫자가 아니라 **원본 행(sheet_source_rows) ↔ 참관객(attendees) 비교**로 계산된다.
import type { Attendee, SheetConnection, SheetSourceRow } from '../types/entities'
import type { SheetInvalidReason } from '../types/enums'
import type { MockState } from './sampleProject'
import { PROJECT_ID_REBUILD27 } from './rebuildFixtures'

/** 시트 연결이 붙는 데모 행사 */
export const SHEET_PROJECT_ID = PROJECT_ID_REBUILD27
export const SHEET_CONNECTION_ID = 'sht-rb27'

/** 화면이 서 있는 스냅숏 시각(시안 09:12) */
const SNAPSHOT_AT = '2026-08-29T09:12:00.000Z'
/** 원본 시트가 그 뒤에 수정된 시각(시안 09:58) — stale 판정 근거 */
const SOURCE_MODIFIED_AT = '2026-08-29T09:58:00.000Z'
const CONNECTED_AT = '2026-08-14T09:00:00.000Z'

/** 시안의 8컬럼 시트. '비고'는 앱 소유 필드라 매핑하지 않는다(field=null = 무시) */
const MAPPING: SheetConnection['mapping'] = [
  { column: '성명', field: 'name' },
  { column: '회사/기관', field: 'org' },
  { column: '직함', field: 'title' },
  { column: '이메일', field: 'email' },
  { column: '휴대폰', field: 'phone' },
  { column: '구분', field: 'group_tag' },
  { column: '신청일시', field: 'registered_at' },
  { column: '비고', field: null },
]

export const SHEET_TAB_NAME = '참가자_확정'
/** 실주소가 아닌 합성 호스트 — 픽스처에는 실제 구글 문서 주소를 넣지 않는다(DoD-26 금지 문자열 가드) */
export const SHEET_URL = 'https://sheets.example.com/spreadsheets/d/1aBcDemoSheetKey/edit#gid=0'

const pad = (n: number, w = 4) => String(n).padStart(w, '0')

interface Seed {
  name: string
  org: string
  title: string | null
  group_tag: string
  status: 'applied' | 'confirmed' | 'cancelled'
  checked_in_at?: string
  /** 취소 이전에 확정이었는지 (KPI '확정 후 취소') */
  previously_confirmed?: boolean
  /** 앱 소유 비고 — 반영이 이 값을 덮어쓰지 않는다는 것을 보여주는 데이터 */
  note?: string
}

/** 시안 명단의 이름줄 — 표·차이 표에서 사람이 알아보는 행들 */
const NAMED: Seed[] = [
  { name: '김도현', org: '가상기계산업협회', title: '사무국장', group_tag: 'VIP', status: 'confirmed', checked_in_at: '2026-08-29T09:24:00.000Z' },
  // 아래 박서연이 '변경' 대상 — 원본에서 구분이 연사 → VIP로 바뀌었다
  { name: '박서연', org: '가상전자통신연구원', title: '책임연구원', group_tag: '연사', status: 'confirmed', checked_in_at: '2026-08-29T09:41:00.000Z', note: '연사 대기실 안내 필요' },
  { name: '이준호', org: '가상테크놀로지', title: '팀장', group_tag: '바이어', status: 'confirmed' },
  { name: '최은비', org: '가상모빌리티', title: '대리', group_tag: '일반', status: 'applied' },
  { name: '정민재', org: '가상바이오', title: '이사', group_tag: '바이어', status: 'confirmed', checked_in_at: '2026-08-29T10:07:00.000Z' },
  { name: '한지우', org: '가상엔지니어링', title: '선임', group_tag: '일반', status: 'cancelled', previously_confirmed: true },
  // 아래 윤가람이 '제거' 대상 — 원본 시트에서 행이 사라졌다(아직 반영 전이라 화면에는 확정으로 남아 있다)
  { name: '윤가람', org: '가상기계산업협회', title: '주임', group_tag: '스태프', status: 'confirmed', checked_in_at: '2026-08-29T09:02:00.000Z', note: '리셉션 데스크 지원' },
]

/** 이미 반영이 끝난 '시트에서 제거됨' 이력 1건 — 하드 삭제 금지(§24.1-4)의 증거 데이터 */
const REMOVED_HISTORY: Seed & { checked_in_at: string } = {
  name: '노하린',
  org: '가상소재랩',
  title: '연구원',
  group_tag: '일반',
  status: 'confirmed',
  checked_in_at: '2026-08-28T09:30:00.000Z',
  note: '전일 사전등록 데스크 방문',
}

// KPI 목표치(시안): 신청 412 · 확정 358 · 취소 27 · 체크인 214 · 확정 후 취소 11
const TOTAL = 412
const CONFIRMED = 358
const CANCELLED = 27
const CHECKED_IN = 214
const CANCELLED_AFTER_CONFIRM = 11
/** 원본 시트의 무효 행(중복·형식 오류) — 앱에 적재하지 않고 KPI의 '제외'로만 보인다 */
const INVALID_ROWS = 6
/** 중복 사유 행이 들고 있는 이메일 — 이미 적재된 첫 행과 같은 값이라 중복으로 걸린다 */
const DUPLICATE_EMAIL = 'sheet-dup@example.com'

const GROUPS = ['VIP', '연사', '바이어', '일반', '스태프']

function isoAt(dayOffset: number, minute: number): string {
  const base = Date.UTC(2026, 7, 20, 9, 0, 0) // 2026-08-20 09:00Z
  return new Date(base + dayOffset * 86_400_000 + minute * 60_000).toISOString()
}

/** 이름줄 뒤를 채우는 대량 행 — 상태 분포를 시안 KPI에 맞춘다 */
function bulkSeeds(): Seed[] {
  const namedConfirmed = NAMED.filter((s) => s.status === 'confirmed').length
  const namedCancelled = NAMED.filter((s) => s.status === 'cancelled').length
  const namedChecked = NAMED.filter((s) => s.checked_in_at).length
  const namedAfterConfirm = NAMED.filter((s) => s.previously_confirmed).length

  const confirmed = CONFIRMED - namedConfirmed
  const cancelled = CANCELLED - namedCancelled
  const applied = TOTAL - NAMED.length - confirmed - cancelled
  const checked = CHECKED_IN - namedChecked
  const afterConfirm = CANCELLED_AFTER_CONFIRM - namedAfterConfirm

  const out: Seed[] = []
  for (let i = 0; i < confirmed; i++) {
    const n = out.length + NAMED.length + 1
    out.push({
      name: `참가자 ${pad(n)}`,
      org: `가상기업 ${pad(n, 3)}`,
      title: null,
      group_tag: GROUPS[n % GROUPS.length],
      status: 'confirmed',
      checked_in_at: i < checked ? isoAt(9, 24 + (i % 180)) : undefined,
    })
  }
  for (let i = 0; i < cancelled; i++) {
    const n = out.length + NAMED.length + 1
    out.push({
      name: `참가자 ${pad(n)}`,
      org: `가상기업 ${pad(n, 3)}`,
      title: null,
      group_tag: GROUPS[n % GROUPS.length],
      status: 'cancelled',
      previously_confirmed: i < afterConfirm,
    })
  }
  for (let i = 0; i < applied; i++) {
    const n = out.length + NAMED.length + 1
    out.push({
      name: `참가자 ${pad(n)}`,
      org: `가상기업 ${pad(n, 3)}`,
      title: null,
      group_tag: GROUPS[n % GROUPS.length],
      status: 'applied',
    })
  }
  return out
}

/** 아직 화면에 없는 원본 행 2건 — 차이 표의 '추가' */
const PENDING_ADDED: { sheet_row_id: string; name: string; org: string; title: string; group_tag: string; registered_at: string }[] = [
  { sheet_row_id: 'row-0900', name: '서지안', org: '가상바이오소재', title: '매니저', group_tag: '바이어', registered_at: '2026-08-29T09:31:00.000Z' },
  { sheet_row_id: 'row-0901', name: '오세훈', org: '가상엔지니어링', title: '책임', group_tag: '일반', registered_at: '2026-08-29T09:44:00.000Z' },
]

export function seedSheetFixtures(state: MockState): void {
  const project = state.projects.find((p) => p.id === SHEET_PROJECT_ID)
  if (!project) return
  const connectedBy = state.users.find((u) => u.id === 'usr-reg')?.name ?? null

  const seeds = [...NAMED, ...bulkSeeds()]
  const attendees: Attendee[] = []
  const sourceRows: SheetSourceRow[] = []

  seeds.forEach((seed, i) => {
    const rowId = `row-${pad(i + 2)}` // 1행은 헤더
    const email = `sheet${i + 1}@example.com`
    const registeredAt = isoAt(i % 9, i)
    attendees.push({
      id: `att-sht-${pad(i + 1)}`,
      project_id: SHEET_PROJECT_ID,
      rsvp_contact_id: null,
      name: seed.name,
      org: seed.org,
      email,
      phone: null, // 시트에는 휴대폰 열이 있지만 데모 데이터에는 실제 번호를 넣지 않는다
      channel: 'import',
      registered_at: registeredAt,
      checked_in_at: seed.checked_in_at ?? null,
      badge_no: null,
      sheet_row_id: rowId,
      title: seed.title,
      group_tag: seed.group_tag,
      sheet_status: seed.status,
      note: seed.note ?? null,
    })
    // 원본 행: 윤가람(제거 대상)은 시트에서 사라졌으므로 만들지 않는다
    if (seed.name === '윤가람') return
    sourceRows.push({
      project_id: SHEET_PROJECT_ID,
      sheet_row_id: rowId,
      name: seed.name,
      org: seed.org,
      title: seed.title,
      email,
      phone: null,
      // 박서연은 원본에서 구분이 VIP로 바뀌었다 — 차이 표의 '변경' 1건
      group_tag: seed.name === '박서연' ? 'VIP' : seed.group_tag,
      registered_at: registeredAt,
      status: seed.status,
      previously_confirmed: seed.previously_confirmed,
    })
  })

  // 이미 반영된 '시트에서 제거됨' 이력 1건 (체크인 기록 보존 — 원본 행은 없다)
  attendees.push({
    id: 'att-sht-removed',
    project_id: SHEET_PROJECT_ID,
    rsvp_contact_id: null,
    name: REMOVED_HISTORY.name,
    org: REMOVED_HISTORY.org,
    email: 'sheet-removed@example.com',
    phone: null,
    channel: 'import',
    registered_at: isoAt(0, 5),
    checked_in_at: REMOVED_HISTORY.checked_in_at,
    badge_no: null,
    sheet_row_id: 'row-0880',
    title: REMOVED_HISTORY.title,
    group_tag: REMOVED_HISTORY.group_tag,
    sheet_status: 'removed',
    note: REMOVED_HISTORY.note ?? null,
  })

  // 아직 화면에 없는 원본 행 2건
  for (const row of PENDING_ADDED) {
    sourceRows.push({
      project_id: SHEET_PROJECT_ID,
      sheet_row_id: row.sheet_row_id,
      name: row.name,
      org: row.org,
      title: row.title,
      email: `sheet-${row.sheet_row_id}@example.com`,
      phone: null,
      group_tag: row.group_tag,
      registered_at: row.registered_at,
      status: 'applied',
    })
  }

  // 중복·형식 오류 행 — 적재되지 않고 KPI의 '제외'로만 집계된다.
  // 3.17.1 T3: 사유 3종을 모두 깔아 제외 목록이 사유별로 뜨는지 화면에서 확인할 수 있게 한다.
  const INVALID_REASONS: SheetInvalidReason[] = [
    'no_email',
    'duplicate_email',
    'missing_required',
  ]
  for (let i = 0; i < INVALID_ROWS; i++) {
    const reason = INVALID_REASONS[i % INVALID_REASONS.length]
    sourceRows.push({
      project_id: SHEET_PROJECT_ID,
      sheet_row_id: `row-0950-${i + 1}`,
      // 필수 항목 누락 행은 이름 자체가 비어 있다 — 목록에서 '(이름 없음)'으로 뜬다
      name: reason === 'missing_required' ? '' : `참가자 ${pad(i + 1)}`,
      org: reason === 'missing_required' ? null : `가상기업 ${pad(i + 1)}`,
      title: null,
      // 중복 행은 이미 적재된 행과 같은 이메일을 들고 있다
      email:
        reason === 'no_email'
          ? null
          : reason === 'duplicate_email'
            ? DUPLICATE_EMAIL
            : `sheet${i + 1}@example.com`,
      phone: `010-0000-${pad(i + 1)}${pad(i + 1)}`,
      group_tag: null,
      registered_at: isoAt(8, i),
      status: 'applied',
      invalid_reason: reason,
    })
  }

  state.attendees.push(...attendees)
  state.sheet_source_rows.push(...sourceRows)
  state.sheet_connections.push({
    id: SHEET_CONNECTION_ID,
    project_id: SHEET_PROJECT_ID,
    state: 'stale',
    title: `${project.name} — 참가자 명단`,
    url: SHEET_URL,
    tab_name: SHEET_TAB_NAME,
    mapping: MAPPING.map((m) => ({ ...m })),
    connected_at: CONNECTED_AT,
    connected_by: connectedBy,
    snapshot_at: SNAPSHOT_AT,
    // 이미 두 번 반영한 뒤의 상태 — 화면이 넘기는 버전이 항상 1이 아님을 드러낸다(§24.3)
    snapshot_version: 3,
    checked_at: SOURCE_MODIFIED_AT,
    auto_check_minutes: 15,
    source_modified_at: SOURCE_MODIFIED_AT,
    pending_added: 2,
    pending_changed: 1,
    pending_removed: 1,
    failure_times: [],
    last_success_at: SNAPSHOT_AT,
  })
}
