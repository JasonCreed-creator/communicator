// 보관 분류 — Drive 저장소의 분류 폴더(설계서 v2.21.6 §7.1 · Phase 6.10, 2026-09-27 사용자 지시 "아카이빙 폴더를 MICE Biz로 —
// 이미 일반·자체·모객·비모객으로 나누어 놨음 · 각각 해당하는 프로젝트를 하위로").
// 저장소 루트 바로 아래 분류 폴더 4개 → 그 안에 행사 ID 폴더(YYMMDD_고객사_행사명) → 파트 6종. 연도 층(v2.17)은 퇴역.
// 순수 함수 — 서버 Drive 트리(api/_lib/drive/tree.ts)와 앱(행사 설정 ③ 보관 분류 칸)이 같은 표를 본다(런타임 import는 enums뿐 · `.js`).
//
// 자동 판정(사용자 선택 "자동 + 설정에서 고침"): 주최형 → 자체행사 · 대행형+모객형 → MICE Solution(모객) · 대행형+일반형 → MICE Solution(비모객).
// '일반행사(Customized)'는 자동으로 가지 않는다 — 설정 ③에서 고를 때만(앱이 알 수 없는 구분 · 추측 금지).
// 폴더 이름 4개는 사용자가 Drive에 이미 만들어 둔 이름 그대로다(#RULE-NO-COMPANY 예외 — 사용자 제공 실물 폴더 이름, 결정 로그 2026-09-27).
// 찾을 때는 정확한 이름 → 낱말(비모객·모객·자체·일반) 순으로 맞추고, 없을 때만 이 이름으로 만든다.
import { DRIVE_CATEGORIES, type DriveCategory } from '../types/enums.js'

export type { DriveCategory }
export { DRIVE_CATEGORIES }

/** 저장소 루트 바로 아래 분류 폴더 이름(사용자 실물 그대로) */
export const DRIVE_CATEGORY_FOLDERS: Record<DriveCategory, string> = {
  solution_recruiting: 'MICE Solution(모객)',
  solution_general: 'MICE Solution(비모객)',
  own: '자체행사(Remember titled)',
  custom: '일반행사(Customized)',
}

/** 화면 라벨(설정 ③ 선택 칸) */
export const DRIVE_CATEGORY_LABELS: Record<DriveCategory, string> = {
  solution_recruiting: 'MICE Solution · 모객',
  solution_general: 'MICE Solution · 비모객',
  own: '자체행사(Remember titled)',
  custom: '일반행사(Customized)',
}

export const DRIVE_CATEGORY_INVALID_MESSAGE = '보관 분류 값이 올바르지 않습니다 — 자동 또는 분류 4종 가운데 하나여야 합니다.'

export interface DriveCategorySource {
  kind: 'agency' | 'host'
  event_type: 'general' | 'recruiting'
  /** 설정 ③에서 고른 값 — null·없음 = 자동 */
  drive_category?: DriveCategory | null
}

export function isDriveCategory(v: unknown): v is DriveCategory {
  return typeof v === 'string' && (DRIVE_CATEGORIES as readonly string[]).includes(v)
}

/** 자동 판정 — 주최형 → 자체행사 · 대행형 모객형 → 모객 · 대행형 일반형 → 비모객 */
export function autoDriveCategory(p: Pick<DriveCategorySource, 'kind' | 'event_type'>): DriveCategory {
  if (p.kind === 'host') return 'own'
  return p.event_type === 'recruiting' ? 'solution_recruiting' : 'solution_general'
}

/** 실제 분류 = 고른 값이 있으면 그것, 없으면 자동 */
export function resolveDriveCategory(p: DriveCategorySource): DriveCategory {
  return isDriveCategory(p.drive_category) ? p.drive_category : autoDriveCategory(p)
}

/** 행사가 들어갈 분류 폴더 이름 */
export function driveCategoryFolderName(p: DriveCategorySource): string {
  return DRIVE_CATEGORY_FOLDERS[resolveDriveCategory(p)]
}

/**
 * 폴더 이름으로 분류를 알아본다 — 정확한 이름이 먼저, 그다음 분류 이름 낱말(사람이 띄어쓰기·꼬리를 조금 다르게 적은 폴더 채택 —
 * '비모객'이 '모객'보다 먼저 · 모객은 'MICE Solution'·'(모객)' 같은 분류 표기가 함께 있을 때만 · 자체·일반은 '자체행사'·'일반행사' 낱말째).
 * 행사 폴더 이름('자체 서밋'·'일반 세미나'…)을 분류 폴더로 오인하지 않게 느슨한 한 글자 낱말은 쓰지 않는다.
 * 분류 폴더가 아니면 null. 저장소 루트 바로 아래에서만 의미가 있다(호출자가 부모를 확인한다).
 */
export function driveCategoryOfFolderName(name: string): DriveCategory | null {
  const trimmed = name.trim()
  for (const code of DRIVE_CATEGORIES) if (DRIVE_CATEGORY_FOLDERS[code] === trimmed) return code
  const compact = trimmed.replace(/\s+/g, '').toLowerCase()
  if (compact.includes('비모객')) return 'solution_general'
  if (compact.includes('모객') && (compact.includes('micesolution') || compact.includes('(모객)'))) return 'solution_recruiting'
  if (compact.includes('자체행사')) return 'own'
  if (compact.includes('일반행사')) return 'custom'
  return null
}

export function isDriveCategoryFolderName(name: string): boolean {
  return driveCategoryOfFolderName(name) !== null
}
