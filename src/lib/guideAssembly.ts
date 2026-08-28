// 운영가이드 섹션 조립 정본 (설계서 v2.5 §23). 순수 함수만 둔다 — provider(seedGuideFromSources)와
// UI(빌더의 "갱신 있음" 차이 확인)가 같은 조립 로직을 재사용해야 결과가 어긋나지 않는다.
// R-O4: 이 함수들은 "조립만" 한다 — 저장 여부·source_stale 판정은 호출부의 몫이다.
import type { Deliverable, RoleCharter } from '../types/entities'
import { STRUCTURED_DOC_CATEGORIES } from '../types/enums'

const STRUCTURED = new Set<string>(STRUCTURED_DOC_CATEGORIES)

/**
 * 존별 운영 섹션 원본 — ops 영역의 **비정형** 항목(큐시트·시나리오·운영가이드 제외)만
 * content(마크다운)가 있는 것을 모아 조립한다.
 */
export function assembleZoneSectionContent(opsItems: readonly Deliverable[]): string {
  const items = opsItems.filter((d) => !STRUCTURED.has(d.category) && (d.content ?? '').trim())
  if (items.length === 0) return '_존별 운영 항목이 아직 없습니다._'
  return items.map((d) => `### ${d.title}\n${d.content}`).join('\n\n')
}

/** 역할별 체크리스트 섹션 원본 — R&R 카드(role_charters)의 items를 조립한다 */
export function assembleRoleSectionContent(charters: readonly RoleCharter[]): string {
  if (charters.length === 0) return '_R&R 카드가 아직 없습니다._'
  return charters
    .map((c) => `### ${c.title}\n${c.items.map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n')
}

/** 비상 대응 섹션 — 연동 출처가 없어 빈 뼈대로 시드된다(사람이 채운다) */
export const EMERGENCY_SECTION_PLACEHOLDER =
  '[대응 절차]\n' +
  '- 우천·정전·의료·화재 등 상황별 1차 대응자와 절차를 작성하세요.\n' +
  '[비상 연락]\n' +
  '- 안전관리자·시설 담당·인근 의료기관 연락 체계를 작성하세요.'

/** 연락망/비품 섹션 — 개인 휴대폰은 이 문서에 적지 않는다(R-O6) */
export const CONTACTS_SECTION_PLACEHOLDER =
  '- 무전 채널: (채널 배정을 입력하세요)\n' +
  '- 대표 연락처: (공용 대표번호를 입력하세요)\n' +
  '- 개인 휴대폰은 이 문서에 적지 않습니다 — 필요하면 별도 연락망 문서를 이용하세요.'

export interface GuideSeedSection {
  kind: 'zone' | 'role' | 'emergency' | 'contacts'
  title: string
  content: string
  source_ref: 'zone_items' | 'role_charters' | null
}

/** §8.2 guide-seed — 4섹션(존별 운영·역할별 체크리스트·비상 대응·연락망) 시드 데이터 */
export function buildGuideSeedSections(
  opsItems: readonly Deliverable[],
  charters: readonly RoleCharter[],
): GuideSeedSection[] {
  return [
    {
      kind: 'zone',
      title: '존별 운영',
      content: assembleZoneSectionContent(opsItems),
      source_ref: 'zone_items',
    },
    {
      kind: 'role',
      title: '역할별 체크리스트',
      content: assembleRoleSectionContent(charters),
      source_ref: 'role_charters',
    },
    { kind: 'emergency', title: '비상 대응', content: EMERGENCY_SECTION_PLACEHOLDER, source_ref: null },
    { kind: 'contacts', title: '연락망/비품', content: CONTACTS_SECTION_PLACEHOLDER, source_ref: null },
  ]
}
