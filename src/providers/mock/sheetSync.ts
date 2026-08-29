// v2.6 §24 — 등록 명단 시트 연동의 순수 로직(mock).
// 여기에는 **읽기 방향만** 있다. 시트로 쓰는 함수는 없고, 앞으로도 만들지 않는다(§24.6).
//
// 차이는 저장된 숫자가 아니라 **원본 행(SheetSourceRow) ↔ 참관객(Attendee)** 비교로 매번 계산한다.
// Phase 4에서 원본 행의 출처가 Sheets API로 바뀌어도 이 비교 규칙은 그대로 쓴다.
import type { Attendee, SheetColumnMapping, SheetSourceRow } from '../../types/entities'
import type {
  SheetColumnPreview,
  SheetDiffRow,
  SheetProbe,
  SheetTabInfo,
} from '../../types/views'
import type { SheetMappedField } from '../../types/enums'
import { SHEET_FIELD_LABELS, SHEET_STATUS_LABELS } from '../../types/enums'

/** 데모용 서비스 계정(합성 주소) — 위저드 1단계의 '뷰어로 초대할 계정' */
export const SHEET_SERVICE_ACCOUNT = 'sheets-reader@communicator-demo.iam.gserviceaccount.com'

/** 연결이 없는 행사에서 위저드를 열었을 때 쓰는 기본 원본 수정 시각(결정적 mock) */
export const DEFAULT_SOURCE_MODIFIED_AT = '2026-08-29T09:58:00.000Z'

const SHEET_HEADERS = ['성명', '회사/기관', '직함', '이메일', '휴대폰', '구분', '신청일시', '비고']

/** 위저드 2단계의 탭 목록 — 4개 중 1개는 표 형태가 아니라 선택 불가 */
export function demoTabs(): SheetTabInfo[] {
  return [
    { name: '참가자_확정', rows: 418, columns: 8, headers: [...SHEET_HEADERS], selectable: true, note: null },
    { name: '참가자_신청', rows: 523, columns: 8, headers: [...SHEET_HEADERS], selectable: true, note: null },
    {
      name: '사전등록_원본',
      rows: 1204,
      columns: 14,
      headers: [...SHEET_HEADERS, '유입경로', '동의1', '동의2', '메모', '처리자', '처리일시'],
      selectable: true,
      note: '폼 응답 원본 — 열이 많아 매핑에 시간이 걸립니다',
    },
    {
      name: '안내문_초안',
      rows: 12,
      columns: 2,
      headers: ['구분', '내용'],
      selectable: false,
      note: '표 형태가 아님 — 명단으로 쓸 수 없습니다',
    },
  ]
}

export function buildProbe(title: string, sourceModifiedAt: string): SheetProbe {
  return {
    title,
    source_modified_at: sourceModifiedAt,
    service_account: SHEET_SERVICE_ACCOUNT,
    tabs: demoTabs(),
  }
}

/** 헤더 이름으로 기본 매핑을 추측한다 — 사람이 3단계에서 언제든 바꿀 수 있다 */
export function suggestField(header: string): SheetMappedField | null {
  const h = header.replace(/\s/g, '').toLowerCase()
  if (/(성명|이름|name)/.test(h)) return 'name'
  if (/(회사|기관|소속|org|company)/.test(h)) return 'org'
  if (/(직함|직책|title|position)/.test(h)) return 'title'
  if (/(이메일|메일|email)/.test(h)) return 'email'
  if (/(휴대폰|연락처|전화|phone|mobile)/.test(h)) return 'phone'
  if (/(구분|그룹|등급|group|type)/.test(h)) return 'group_tag'
  if (/(신청일|등록일|일시|date)/.test(h)) return 'registered_at'
  return null
}

/** 연락처 마스킹(§24.1-5) — 원문은 미리보기·화면에 내려보내지 않는다 */
export function maskEmail(value: string): string {
  const [local, domain] = value.split('@')
  if (!domain) return `${value.slice(0, 2)}****`
  return `${local.slice(0, 2)}****@${domain}`
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  const tail = digits.slice(-4)
  return `010-****-${tail || '0000'}`
}

const SAMPLE_BY_HEADER: Record<string, string> = {
  성명: '김도현',
  '회사/기관': '가상기계산업협회',
  직함: '사무국장',
  이메일: 'kimdohyun@example.com',
  휴대폰: '010-0000-0117',
  구분: 'VIP',
  신청일시: '2026-08-21 14:03',
  비고: '숙박 지원 요청',
}

/** 위저드 3단계 — 컬럼별 첫 행 미리보기. 이메일·전화는 마스킹된 값만 준다 */
export function buildColumnPreviews(tab: SheetTabInfo): SheetColumnPreview[] {
  return tab.headers.map((header, i) => {
    const suggested = suggestField(header)
    const raw = SAMPLE_BY_HEADER[header] ?? `값 ${i + 1}`
    if (suggested === 'email') {
      return { column: header, sample: maskEmail(raw), masked: true, suggested }
    }
    if (suggested === 'phone') {
      return { column: header, sample: maskPhone(raw), masked: true, suggested }
    }
    return { column: header, sample: raw, masked: false, suggested }
  })
}

/** 최초 연결 시 만들어 두는 원본 행(결정적) — 실제 시트 대신 쓰는 mock 데이터 */
export function generateSourceRows(projectId: string, count: number): SheetSourceRow[] {
  const groups = ['VIP', '연사', '바이어', '일반', '스태프']
  return Array.from({ length: count }, (_, i) => ({
    project_id: projectId,
    sheet_row_id: `row-new-${String(i + 1).padStart(3, '0')}`,
    name: `참가자 ${String(i + 1).padStart(3, '0')}`,
    org: `가상기업 ${String(i + 1).padStart(3, '0')}`,
    title: null,
    email: `newsheet${i + 1}@example.com`,
    phone: null,
    group_tag: groups[i % groups.length],
    registered_at: new Date(Date.UTC(2026, 7, 20, 9, 0, 0) + i * 600_000).toISOString(),
    status: i % 5 === 0 ? ('applied' as const) : ('confirmed' as const),
  }))
}

/** 'MM-DD HH:mm' — 표에 넣는 짧은 시각(타임존 영향 없이 결정적) */
export function shortStamp(iso: string): string {
  return iso.slice(5, 16).replace('T', ' ')
}

function statusLabel(status: Attendee['sheet_status'] | SheetSourceRow['status']): string {
  return status ? SHEET_STATUS_LABELS[status] : '—'
}

function subjectOf(name: string, org: string | null | undefined): string {
  return org ? `${name} · ${org}` : name
}

function valueOf(field: SheetMappedField, source: { [k: string]: unknown }): string {
  const raw = source[field]
  if (raw === null || raw === undefined || raw === '') return '—'
  const text = String(raw)
  return field === 'registered_at' ? shortStamp(text) : text
}

/**
 * 시트 소유 필드 비교 — 매핑된 필드(§24.1-3)만 본다. 체크인·비고는 앱 소유라 비교 대상이 아니다.
 * 신청 상태(sheet_status)는 매핑 7종에 없지만 시트가 정본인 값이라 항상 함께 따라간다.
 */
export function mappedFields(mapping: SheetColumnMapping[]): SheetMappedField[] {
  const fields = mapping.map((m) => m.field).filter((f): f is SheetMappedField => f !== null)
  return [...new Set(fields)]
}

export interface SheetDiffInput {
  mapping: SheetColumnMapping[]
  /** 원본 행 전체(무효 행 포함 — 무효 행은 비교에서 제외된다) */
  sourceRows: SheetSourceRow[]
  /** 이 행사의 참관객 전체 */
  attendees: Attendee[]
}

export function computeSheetDiffRows({ mapping, sourceRows, attendees }: SheetDiffInput): SheetDiffRow[] {
  const fields = mappedFields(mapping)
  const valid = sourceRows.filter((r) => !r.invalid_reason)
  const bySourceRow = new Map(valid.map((r) => [r.sheet_row_id, r]))
  // 이미 'removed'로 이력이 남은 행은 다시 제거 대상으로 세지 않는다
  const linked = attendees.filter((a) => a.sheet_row_id && a.sheet_status !== 'removed')
  const byAttendee = new Map(linked.map((a) => [a.sheet_row_id as string, a]))

  const added: SheetDiffRow[] = []
  const changed: SheetDiffRow[] = []
  const removed: SheetDiffRow[] = []

  for (const row of valid) {
    const attendee = byAttendee.get(row.sheet_row_id)
    if (!attendee) {
      added.push({
        kind: 'added',
        subject: subjectOf(row.name, row.org),
        current: null,
        source: `${row.group_tag ?? '일반'} · ${statusLabel(row.status)} · ${shortStamp(row.registered_at)}`,
        attendee_id: null,
        sheet_row_id: row.sheet_row_id,
      })
      continue
    }
    const currentParts: string[] = []
    const sourceParts: string[] = []
    for (const field of fields) {
      const before = valueOf(field, attendee as unknown as Record<string, unknown>)
      const after = valueOf(field, row as unknown as Record<string, unknown>)
      if (before !== after) {
        currentParts.push(`${SHEET_FIELD_LABELS[field]} ${before}`)
        sourceParts.push(`${SHEET_FIELD_LABELS[field]} ${after}`)
      }
    }
    if (attendee.sheet_status !== row.status) {
      currentParts.push(`신청 상태 ${statusLabel(attendee.sheet_status)}`)
      sourceParts.push(`신청 상태 ${statusLabel(row.status)}`)
    }
    if (currentParts.length > 0) {
      changed.push({
        kind: 'changed',
        subject: subjectOf(attendee.name, attendee.org),
        current: currentParts.join(' · '),
        source: sourceParts.join(' · '),
        attendee_id: attendee.id,
        sheet_row_id: row.sheet_row_id,
      })
    }
  }

  for (const attendee of linked) {
    const rowId = attendee.sheet_row_id as string
    if (bySourceRow.has(rowId)) continue
    removed.push({
      kind: 'removed',
      subject: subjectOf(attendee.name, attendee.org),
      current: `${attendee.group_tag ?? '—'} · ${statusLabel(attendee.sheet_status)}`,
      source: null,
      attendee_id: attendee.id,
      sheet_row_id: rowId,
    })
  }

  // 시안의 표 순서 — 추가 → 변경 → 제거
  return [...added, ...changed, ...removed]
}
