// v2.6 §25 — 행사 유형 4분류의 **프리셋 단일 소스**.
//
// format의 권한은 3가지뿐이다(§25.1 계약):
//   ① 온보딩 시드 — kind·event_type 기본값, WBS 템플릿, R&R·컴플라이언스·tier 시드를 **1회** 전개
//   ② 견적 모델 결정 — conference=비용형(현행 엔진 무접촉) / dms·exhibition=판매형(calcRevenue)
//   ③ 전용 화면의 **복합 게이트 구성요소** — 예: 판매 플래너 = kind='host' && format in (dms,exhibition)
//
// **상시 모듈 표시 게이트는 여기서 정하지 않는다.** 파트너 보드=kind · 등록 깊이=event_type ·
// PSA=psa_enabled가 계속 주인이다 — format이 상시 토글의 두 번째 주인이 되면 §10 진입점 원칙과 충돌한다(감수 C1).
//
// 시드는 **기본값이지 잠금이 아니다**: S0에서 세부 토글로 수정할 수 있고, 이후에도 독립 변경된다.
import type { AudienceModel, EventFormat, EventType, ProjectKind } from '../types/enums'

/** 견적 모델 — conference만 기존 S-2 비용형 경로를 쓴다(엔진 파일 무접촉이 스펙) */
export type QuoteModel = 'cost' | 'revenue'

export interface FormatPreset {
  format: EventFormat
  /** 온보딩 ③에서 고르는 카드 라벨 — 4카드 중 하나 */
  cardLabel: string
  cardBlurb: string
  /** 시드 기본값(수정 가능) */
  seed: {
    kind: ProjectKind
    event_type: EventType
    audience_model: AudienceModel | null
    /** 온보딩에서 PSA 체크박스 기본 상태 */
    psa_enabled: boolean
  }
  /** 견적 도구 라우팅 */
  quoteModel: QuoteModel
  /** WBS 템플릿 키 — 'general'|'recruiting'은 event_type 템플릿, 'host'·'exhibition'은 파트너별 전개 */
  wbsTemplateKeys: readonly ('general' | 'recruiting' | 'host' | 'exhibition')[]
  /** 큐시트·운영가이드 시드 문구(운영 프리셋). 빈 배열이면 시드하지 않는다 */
  opsNotes: readonly string[]
  /** 이 프리셋이 실측 1건 기반이거나 미검증이면 true — 화면·문서에 '가정'으로 표기한다 */
  assumed: boolean
}

/** 4카드 = conference 2종(일반형·모객형) + dms + exhibition.
 *  conference는 event_type으로 갈라지므로 카드 키를 별도로 둔다. */
export type PresetCardKey = 'conference_general' | 'conference_recruiting' | 'dms' | 'exhibition'

export const FORMAT_PRESETS: Record<PresetCardKey, FormatPreset> = {
  conference_general: {
    format: 'conference',
    cardLabel: '컨퍼런스 · 일반형',
    cardBlurb: '발주처 대행. 모객 없이 초청·내부 참석자 중심으로 운영합니다.',
    seed: { kind: 'agency', event_type: 'general', audience_model: null, psa_enabled: false },
    quoteModel: 'cost',
    wbsTemplateKeys: ['general'],
    opsNotes: [],
    assumed: false,
  },
  conference_recruiting: {
    format: 'conference',
    cardLabel: '컨퍼런스 · 모객형',
    cardBlurb: '발주처 대행 + 모객. 보장 인원·쇼업 KPI·리드 타겟팅이 함께 열립니다.',
    seed: { kind: 'agency', event_type: 'recruiting', audience_model: null, psa_enabled: false },
    quoteModel: 'cost',
    wbsTemplateKeys: ['recruiting'],
    opsNotes: [],
    assumed: false,
  },
  dms: {
    format: 'dms',
    cardLabel: 'DMS',
    cardBlurb: '우리가 주최. 파트너사에 발표 세션·부스를 판매하고 초청 청중을 모읍니다.',
    // 청중은 초청제가 기본이지만 **초청제 게이트 자체는 미구현**이다(§25.6 열린 질문).
    // 지금은 값만 기록하고 등록 모듈은 기존 모객형 그대로 동작한다.
    seed: { kind: 'host', event_type: 'recruiting', audience_model: 'invite', psa_enabled: false },
    quoteModel: 'revenue',
    wbsTemplateKeys: ['host', 'recruiting'],
    opsNotes: [
      'Q&A는 운영하지 않습니다.',
      '발표 시간은 세션당 40분입니다.',
      '개인 노트북 연결은 불가합니다 — 자료는 사전 제출본으로 재생합니다.',
      '리허설은 파트너별 10분입니다.',
      '철거는 당일 진행합니다.',
    ],
    assumed: true, // 실측 1행사(조인트 참가가이드) 기반
  },
  exhibition: {
    format: 'exhibition',
    cardLabel: '전시회',
    cardBlurb: '우리가 주최. 참가업체에 부스를 판매하고 참관객을 모읍니다.',
    seed: { kind: 'host', event_type: 'recruiting', audience_model: 'open', psa_enabled: false },
    quoteModel: 'revenue',
    wbsTemplateKeys: ['exhibition', 'recruiting'],
    opsNotes: [],
    assumed: true, // §25.7 — 전부 가정, 첫 실전 전 확정 게이트
  },
}

export const PRESET_CARD_ORDER: readonly PresetCardKey[] = [
  'conference_general',
  'conference_recruiting',
  'dms',
  'exhibition',
]

/** 현재 프로젝트 값에서 카드 키를 되찾는다 — S0 재진입·S6 표시에 쓴다.
 *  format이 시드일 뿐이라 kind·event_type이 독립적으로 바뀌었을 수 있다 —
 *  그때도 format을 우선해 카드를 고른다(카드는 '어디서 출발했는가'를 가리킨다). */
export function presetCardOf(
  format: EventFormat,
  eventType: EventType,
): PresetCardKey {
  if (format === 'dms') return 'dms'
  if (format === 'exhibition') return 'exhibition'
  return eventType === 'recruiting' ? 'conference_recruiting' : 'conference_general'
}

/** 판매형 도구(판매 플래너)를 쓰는 format인지 — §25.1 권한 ② */
export function usesRevenueModel(format: EventFormat): boolean {
  return FORMAT_PRESETS[presetCardOf(format, 'recruiting')].quoteModel === 'revenue'
}
