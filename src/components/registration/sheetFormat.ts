// v2.6 §24 — S4 시트 연동 화면 전용 표시 헬퍼(순수 함수).
//
// 왜 화면 쪽에 두는가: 데이터 계층은 명단 필드를 **원문 그대로** 내려준다(마스킹은 화면 책임 —
// §24.1-5). providers/mock 내부 구현을 페이지에서 직접 import하면 "프론트는 DataProvider
// 인터페이스만 호출"(CLAUDE.md §6) 규약이 깨지므로 같은 규칙을 여기에 한 벌 둔다.
import type { StatusLevel } from '../../lib/labels'
import type { SheetConnectionState } from '../../types/enums'

/** 이메일 마스킹 — 앞 두 글자만 남긴다. `sheet1@example.com` → `sh****@example.com` */
export function maskEmail(value: string): string {
  const [local, domain] = value.split('@')
  if (!domain) return `${value.slice(0, 2)}****`
  return `${local.slice(0, 2)}****@${domain}`
}

/** 전화 마스킹 — 뒤 4자리만 남긴다. `010-2946-1847` → `010-****-1847` */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  const tail = digits.slice(-4)
  return `010-****-${tail || '0000'}`
}

/** 명단 표의 연락처 셀 — 이메일 우선, 없으면 전화, 둘 다 없으면 '-' (원문 노출 경로 없음) */
export function maskedContact(email: string | null | undefined, phone: string | null | undefined): string {
  if (email) return maskEmail(email)
  if (phone) return maskPhone(phone)
  return '-'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** ISO → 'HH:MM' (로컬) — 시안의 "원본 시트가 09:58에 수정되었습니다" 표기용 */
export function timeHm(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** ISO → 'YYYY-MM-DD HH:MM' (로컬) — 연결 카드의 마지막 동기화 표기 */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** ISO → '방금' | 'n분 전' | 'n시간 전' | 'n일 전' (미래면 '방금') — 절대 시각과 **병기**한다 */
export function relativeFromNow(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const diffMs = now.getTime() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  return `${Math.floor(hour / 24)}일 전`
}

/** 비율 → '86.9' (소수 1자리). 시안 KPI 보조 수치 표기 */
export function percent1(ratio: number): string {
  return (ratio * 100).toFixed(1)
}

/**
 * 시트 계열 상태 → 의미 4단계 (디자인지시서 §7-1.1).
 * 미연결=중립 · 연결됨=정상 · 갱신 있음=주의(＋좌측 도트) · 권한 끊김=차단.
 * '동기화 중'(progress)은 저장 상태가 아니라 요청 중 표시라 여기 없다.
 */
export const SHEET_STATE_LEVEL: Record<SheetConnectionState, StatusLevel> = {
  disconnected: 'neutral',
  connected: 'positive',
  stale: 'attention',
  revoked: 'blocked',
}
