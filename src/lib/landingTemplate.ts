// 랜딩 섹션 기본 템플릿 (v2.1 §4-20).
// 실측 B2B 행사 랜딩(연사 라인업 → 타임테이블 → 티켓 → 혜택 → 존 → 오시는 길 → FAQ → 폼)의
// 구성을 블록으로 정규화한 것. 문구는 전부 자리표시자이며 회사·행사 실명은 넣지 않는다
// (#RULE-NO-COMPANY) — 실제 값은 행사 데이터 autofill 또는 사용자 입력으로 채워진다.
import type {
  LandingConsent,
  LandingFormField,
  LandingSection,
} from '../types/entities'
import type { LandingSectionType } from '../types/enums'

/** 타입별 표시 이름 — 빌더 팔레트·섹션 헤더 공용 */
export const LANDING_SECTION_LABELS: Record<LandingSectionType, string> = {
  hero: '히어로',
  lead: '포지셔닝 카피',
  speakers: '연사 라인업',
  agenda: '세션 타임테이블',
  tickets: '티켓·가격',
  pitch: '가치 제안',
  benefits: '참가 혜택',
  zones: '존 운영 안내',
  sponsors: '스폰서·참여 기업',
  venue: '오시는 길',
  faq: '자주 묻는 질문',
  form: '신청 폼',
  footer: '푸터·사업자 정보',
}

/** 항목(items)을 쓰는 섹션인지 — 카피 전용 섹션은 items 편집 UI를 숨긴다 */
export const SECTION_USES_ITEMS: Record<LandingSectionType, boolean> = {
  hero: false,
  lead: false,
  speakers: true,
  agenda: true,
  tickets: true,
  pitch: false,
  benefits: true,
  zones: true,
  sponsors: true,
  venue: true,
  faq: true,
  form: false,
  footer: true,
}

/** 행사 데이터에서 자동 조립할 수 있는 섹션 (§4-20 autofill) */
export const SECTION_SUPPORTS_AUTOFILL: Record<LandingSectionType, boolean> = {
  hero: true, // Project 개요 — 행사명·일시·장소
  lead: false,
  speakers: true, // ProgramSession.speaker_*
  agenda: true, // ProgramSession
  tickets: false,
  pitch: false,
  benefits: false,
  zones: true, // ops 영역 존 운영 항목
  sponsors: false,
  venue: true, // Project 장소
  faq: false,
  form: false,
  footer: false,
}

/** 항목 열의 의미는 섹션마다 다르다 — 편집 UI 라벨 */
export const ITEM_FIELD_LABELS: Record<
  LandingSectionType,
  { label: string; detail: string; meta: string }
> = {
  hero: { label: '항목', detail: '설명', meta: '보조' },
  lead: { label: '항목', detail: '설명', meta: '보조' },
  speakers: { label: '연사명', detail: '세션 제목', meta: '직함·소속' },
  agenda: { label: '세션명', detail: '설명', meta: '시간' },
  tickets: { label: '티켓 종류', detail: '안내', meta: '가격' },
  pitch: { label: '항목', detail: '설명', meta: '보조' },
  benefits: { label: '혜택명', detail: '설명', meta: '아이콘' },
  zones: { label: '존 이름', detail: '설명', meta: '기호' },
  sponsors: { label: '기업명', detail: '비고', meta: '분류' },
  venue: { label: '항목', detail: '내용', meta: '링크' },
  faq: { label: '질문', detail: '답변', meta: '분류 탭' },
  form: { label: '항목', detail: '설명', meta: '보조' },
  footer: { label: '항목', detail: '내용', meta: '보조' },
}

const seq = (prefix: string) => {
  let n = 0
  return () => `${prefix}-${++n}`
}

/** 기본 13섹션 — 신규 랜딩 시드 */
export function defaultSections(idFor: (kind: string) => string): LandingSection[] {
  const spec: Array<{
    type: LandingSectionType
    headline: string | null
    body: string | null
    autofill: boolean
    items: Array<[string, string | null, string | null]>
  }> = [
    { type: 'hero', headline: null, body: null, autofill: true, items: [] },
    {
      type: 'lead',
      headline: '왜 지금 이 자리인가',
      body: '행사가 답하려는 질문을 한 문단으로 적어 주세요.',
      autofill: false,
      items: [],
    },
    { type: 'speakers', headline: '연사 라인업', body: null, autofill: true, items: [] },
    { type: 'agenda', headline: 'SESSION TIME TABLE', body: null, autofill: true, items: [] },
    {
      type: 'tickets',
      headline: '참가 신청',
      body: '*수량 소진 시 조기 마감',
      autofill: false,
      items: [
        ['일반 참가', null, '0원'],
        ['참가 + 네트워킹', '인원 한정', '0원'],
      ],
    },
    {
      type: 'pitch',
      headline: '지금이 그 시간입니다',
      body: '얼리버드·한정 혜택 등 결정을 앞당길 이유를 적어 주세요.',
      autofill: false,
      items: [],
    },
    {
      type: 'benefits',
      headline: '참가자에게만 드리는 혜택',
      body: null,
      autofill: false,
      items: [
        ['네트워킹', '참가자 간 교류 세션', '🤝'],
        ['식음 제공', '점심 및 다과', '🍱'],
        ['기념품', '현장 수령', '🎁'],
        ['경품 추첨', '행사 말미 진행', '🎉'],
      ],
    },
    { type: 'zones', headline: '행사장 존 안내', body: null, autofill: true, items: [] },
    {
      type: 'sponsors',
      headline: '함께하는 기업',
      body: null,
      autofill: false,
      items: [],
    },
    { type: 'venue', headline: '오시는 길', body: null, autofill: true, items: [] },
    {
      type: 'faq',
      headline: '자주 묻는 질문',
      body: null,
      autofill: false,
      items: [
        ['신청하면 모두 참석할 수 있나요?', '선착순 마감이며 확정 여부는 별도 안내드립니다.', '참가신청'],
        ['몇 시부터 입장할 수 있나요?', '행사 시작 1시간 전부터 입장 가능합니다.', '참석관련'],
        ['주차 지원이 되나요?', '주차 지원은 어렵습니다. 대중교통 이용을 권장드립니다.', '참석관련'],
      ],
    },
    { type: 'form', headline: '참가 신청', body: null, autofill: false, items: [] },
    {
      type: 'footer',
      headline: null,
      body: null,
      autofill: false,
      items: [
        ['사업자 정보', '상호 · 대표 · 주소 · 사업자등록번호를 입력하세요.', null],
        ['문의', 'event@example.com', null],
      ],
    },
  ]

  const nextSection = seq(idFor('sec'))
  const nextItem = seq(idFor('item'))
  return spec.map((sp, i) => ({
    id: nextSection(),
    type: sp.type,
    headline: sp.headline,
    body: sp.body,
    visible: true,
    autofill: sp.autofill,
    sort_order: i + 1,
    items: sp.items.map(([label, detail, meta], j) => ({
      id: nextItem(),
      label,
      detail,
      meta,
      image_url: null,
      sort_order: j + 1,
    })),
  }))
}

/** 기본 신청 폼 — 실측 랜딩의 입력 7종을 승계 */
export function defaultFormFields(idFor: (kind: string) => string): LandingFormField[] {
  const next = seq(idFor('fld'))
  const spec: Array<[string, LandingFormField['kind'], string | null, boolean, string[]]> = [
    ['성함', 'text', null, true, []],
    ['회사명', 'text', null, true, []],
    ['직무', 'text', null, true, []],
    ['직급', 'text', null, false, []],
    ['휴대전화 번호', 'tel', 'ex. 010-0000-0000', true, []],
    ['회사 이메일', 'email', 'ex. name@company.com', true, []],
  ]
  return spec.map(([label, kind, placeholder, required, choices], i) => ({
    id: next(),
    label,
    kind,
    placeholder,
    required,
    choices,
    sort_order: i + 1,
  }))
}

/** 기본 동의 2종 — 필수(개인정보) + 선택(마케팅 수신) */
export function defaultConsents(idFor: (kind: string) => string): LandingConsent[] {
  const next = seq(idFor('cns'))
  return [
    {
      id: next(),
      title: '개인정보 수집·이용 동의 (필수)',
      body: [
        '· 목적: 행사 참가 신청 접수 및 본인 확인, 참가 안내 전달',
        '· 항목: 성함, 회사명, 직무, 직급, 휴대전화 번호, 회사 이메일',
        '· 보유 기간: 수집일로부터 12개월까지 보관 후 지체 없이 파기',
        '· 거부 권리: 동의를 거부하실 수 있으나, 미동의 시 참가 신청이 제한됩니다.',
      ].join('\n'),
      required: true,
      sort_order: 1,
    },
    {
      id: next(),
      title: '소식 및 혜택 정보 수신 동의 (선택)',
      body: [
        '· 목적: 향후 행사·웨비나 정보 및 솔루션 안내 제공',
        '· 항목: 성함, 회사명, 휴대전화 번호, 회사 이메일',
        '· 보유 기간: 수집일로부터 12개월까지 보관 후 지체 없이 파기',
        '· 거부 권리: 미동의하셔도 참가 신청은 정상 진행됩니다.',
      ].join('\n'),
      required: false,
      sort_order: 2,
    },
  ]
}
