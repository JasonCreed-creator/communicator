// WBS·R&R 기본 템플릿 — 설계서 v1.4.1 부록 §15의 1:1 이식 (정본은 설계서).
// 모객형 37태스크는 표를 그대로 옮긴 것(코드·기간·역할·origin_role 보존 — Configurator v0.2 호환).
// 일반형 28태스크: §15가 코드 단위로 명시한 제외 집합(3.1~3.5 + 4.1~4.5·4.7, 4.6 존치)을
//   제외하고 3G 2건을 추가 — GENERAL_EXCLUDED_CODES·GENERAL_EXTRA_TASKS가 §15의 정본 구현.
import type { EventType, MemberRole, WbsDirection } from '../types/enums'

export interface WbsTemplateTask {
  phase_no: number
  phase_name: string
  code: string
  title: string
  /** D 기준 오프셋 (음수=D-, 0=D-Day, 양수=D+) */
  offset_start: number
  offset_end: number
  role: MemberRole
  origin_role: string | null
  /** v2.0 §4-15b — 소통 대상(고객사·협력사·내부, 복수는 '·' 결합). 원본 event_tasks.target을
   *  §15 역할 매핑 원칙의 3버킷(고객→고객사 / 엠앤씨 계열→협력사 / 리멤버 계열→내부)으로 치환 */
  target: string | null
  /** v2.4 §21 — 주최형 템플릿(HOST_TEMPLATE) 전용. 대행형 템플릿은 비워 두면 'internal'로
   *  간주한다(전개 시 provider·픽스처가 `tpl.direction ?? 'internal'`로 읽는다) */
  direction?: WbsDirection
}

export interface RoleCharterTemplate {
  role: MemberRole
  origin_role: string | null
  title: string
  items: string[]
}

// 단계명 — §4-15는 '1 사전착수 ~ 6 사후관리'만 확정. 2~5는 표 내용 기반 명명(가정 — 확정 시 갱신)
const PHASE_NAMES: Record<number, string> = {
  1: '사전착수',
  2: '디자인·제작',
  3: '등록 준비',
  4: '참석·모객 관리',
  5: '현장 운영',
  6: '사후관리',
}

function t(
  code: string,
  title: string,
  offset_start: number,
  offset_end: number,
  role: MemberRole,
  origin_role: string | null,
  target: string | null,
): WbsTemplateTask {
  const phase_no = Number(code.split('.')[0].replace('G', ''))
  return { phase_no, phase_name: PHASE_NAMES[phase_no], code, title, offset_start, offset_end, role, origin_role, target }
}

/** 모객형 37태스크 — 부록 §15 표 그대로 */
export const RECRUITING_WBS_TEMPLATE: readonly WbsTemplateTask[] = [
  t('1.1', '계약 검토 및 최종 날인', -42, -40, 'pm', 'RS', '고객사'),
  t('1.2', '킥오프 (영업+운영+협력)', -38, -35, 'pm', '공동', '협력사'),
  t('1.3', '클라이언트 실행 계획 미팅', -35, -33, 'pm', 'RS', '고객사·내부·협력사'),
  t('1.4', '현장답사 (주차·이동경로·교통)', -33, -28, 'ops', 'MC-PM', '고객사'),
  t('2.1', '행사 기초 자료 요청 (Key Visual 등)', -33, -30, 'pm', 'RS', '고객사'),
  t('2.2', '기초 자료 수령 리마인더', -28, -26, 'pm', 'RS', '고객사'),
  t('2.3', '기초 자료 수령', -26, -23, 'pm', 'RS', '고객사'),
  t('2.4', '자료 수령 후 협력사 전달', -23, -22, 'pm', 'RS', '협력사'),
  t('2.5', '랜딩페이지 디자인·개발 1차', -22, -18, 'design', 'MC-PM', '고객사'),
  t('2.6', '랜딩페이지 1차 수정·내부 검토', -18, -17, 'design', 'MC-PM', '고객사'),
  t('2.7', '랜딩페이지 최종 컨펌·URL 오픈', -17, -16, 'pm', 'MC-PM', '고객사·내부'),
  t('2.8', '제작물 (배너·렌탈장비·기념품·현수막)', -13, -5, 'design', 'MC-PM', '고객사'),
  t('3.1', '리드젠 서베이 문항 설계·시스템 구축', -25, -22, 'reg', 'RO', '고객사'),
  t('3.2', '서베이 링크 전달·검수', -22, -20, 'reg', 'RO', '협력사'),
  t('3.3', '서베이+랜딩 통합 테스트', -20, -18, 'reg', 'RO', '고객사·협력사'),
  t('3.4', '대시보드 최초 세팅·전달', -18, -17, 'reg', 'RO', '고객사·협력사'),
  t('3.5', '실시간 리드 관리 시트 세팅', -17, -16, 'reg', 'RO', '협력사'),
  t('4.1', '리드 수집 시작', -16, -5, 'reg', 'RO', '고객사'),
  t('4.2', '타겟 일치/불일치 실시간 협의', -16, -3, 'pm', 'RS', '고객사'),
  t('4.3', '불일치 리드 적격 확정 후 전달', -16, -3, 'reg', 'RO', '협력사'),
  t('4.4', '1차 참석 확인 (전화·알림톡·메일)', -8, -5, 'reg', 'MC-AT', '협력사'),
  t('4.5', '2차 참석 확정·노쇼 방지', -3, -1, 'reg', 'MC-AT', '협력사'),
  t('4.6', '데일리 현황 공유 (내부)', -5, -1, 'reg', 'MC-AT', '내부'),
  t('4.7', '데일리 현황 공유 (고객)', -5, -1, 'reg', 'RO', '고객사'),
  t('5.1', '행사 물류 배송·현장 셋팅', -3, -2, 'ops', 'MC-PM', '고객사'),
  t('5.2', '현장 운영 자료 수집·테스트', -2, -1, 'ops', 'MC-PM', '고객사'),
  t('5.3', '전체 리허설·테크니컬 체크', -1, -1, 'ops', 'MC-PM', '고객사'),
  t('5.4', '현장 등록 데스크·출입 관리', 0, 0, 'reg', 'MC-AT', '고객사'),
  t('5.5', 'VIP 케어·연사 관리·프로그램 운영', 0, 0, 'ops', 'MC-PM', '고객사'),
  t('6.1', '최종 쇼업 리드 리스트 정리·전달', 1, 2, 'reg', 'MC-AT', '내부'),
  t('6.2', '쇼업 리드 raw data 납품', 2, 3, 'reg', 'RO', '고객사'),
  t('6.3', '전체 행사 결과 보고서 작성·전달', 3, 10, 'ops', 'MC-PM', '고객사'),
  t('6.4', '운영 견적서 확정·전달', 3, 5, 'pm', 'MC-PM', '내부'),
  t('6.5', '세금계산서 발행·고객 입금 확인', 5, 15, 'pm', 'RS', '고객사'),
  t('6.6', '운영비 협력사 정산 (이윤 포함)', 15, 20, 'pm', 'RS', '협력사'),
  t('6.7', '고객사 회계 처리 마감', 20, 30, 'pm', 'RS', '고객사'),
  t('6.8', '프로젝트 회고·개선 사항 정리', 10, 20, 'pm', '공동', '협력사'),
]

/** 일반형에서 제외되는 리드 마케팅·모객 11건 (4.6은 존치 — 파일 상단 주석) */
const GENERAL_EXCLUDED_CODES = new Set([
  '3.1', '3.2', '3.3', '3.4', '3.5',
  '4.1', '4.2', '4.3', '4.4', '4.5', '4.7',
])

/** 일반형 대체 2건 (§15 하단 — 가정, origin_role 없음) */
const GENERAL_EXTRA_TASKS: readonly WbsTemplateTask[] = [
  t('3G.1', '참석 대상 명단 확정', -20, -15, 'reg', null, '고객사'),
  t('3G.2', '초청장 발송·회신 관리', -14, -5, 'reg', null, '고객사'),
]

/** 일반형 28태스크 — 37 − 11 + 2 */
export const GENERAL_WBS_TEMPLATE: readonly WbsTemplateTask[] = [
  ...RECRUITING_WBS_TEMPLATE.filter((task) => !GENERAL_EXCLUDED_CODES.has(task.code)),
  ...GENERAL_EXTRA_TASKS,
].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))

export function wbsTemplateFor(eventType: EventType): readonly WbsTemplateTask[] {
  return eventType === 'recruiting' ? RECRUITING_WBS_TEMPLATE : GENERAL_WBS_TEMPLATE
}

// ── v2.4 §21 — 주최형(파트너) WBS 템플릿 HT-1~12 (설계서 §15.3 표 그대로) ─────
// 출처: DM Summit 2026 파트너사 통합가이드북 v1.5 확정 마감 체계 — 1개 행사 기반 일반화라
// §15.3 원문이 "구성은 가정"이라 명시한다. D오프셋·명칭은 행사별 편집 가능.
// phase_no·phase_name은 HT 코드에 없는 개념이라(코드가 'HT-n'이라 기존 t() 헬퍼의
// code.split('.')[0] 파싱이 통하지 않는다) 기존 1~6단계 이름에 맞춰 여기서만 새로 매핑한다
// (§15.3이 확정하는 것은 D·direction·역할뿐이라 이 매핑도 가정 — 2번째 주최형 행사에서 검증).
function ht(
  code: string,
  title: string,
  offset_start: number,
  offset_end: number,
  role: MemberRole,
  direction: WbsDirection,
  phase_no: number,
): WbsTemplateTask {
  return {
    phase_no,
    phase_name: PHASE_NAMES[phase_no],
    code,
    title,
    offset_start,
    offset_end,
    role,
    origin_role: null, // §15.3: origin_role은 null
    target: null, // 주최형은 소통 대상 축 대신 direction으로 그룹화한다
    direction,
  }
}

/**
 * v2.6 §25.4 — 파트너 제출물의 카테고리 기본값은 '파트너 제출'이고, 성격이 다른 코드만 덮어쓴다.
 * HT-3(참관객 이용권·경품)은 제작물이 아니라 **혜택 제안**이라 운영보드에서 따로 모여야 한다 —
 * 설계서 §25.5의 `'benefit'` 카테고리를 화면에 그대로 나가는 한국어 라벨로 옮긴 값이다.
 */
export const HOST_SUBMIT_CATEGORY: Readonly<Record<string, string>> = {
  'HT-3': '경품·이용권',
}

/** 주최형 12태스크 — partner_submit은 전개 시 파트너 수만큼 인스턴스가 된다(§15.3) */
export const HOST_TEMPLATE: readonly WbsTemplateTask[] = [
  ht('HT-1', '파트너 기본 자료 제출 — 로고·회사소개·발표자 프로필·발표 개요', -45, -45, 'pm', 'partner_submit', 1),
  ht('HT-2', '트랙 배정·부스 배치 확정 통지', -37, -37, 'pm', 'host_notice', 1),
  ht('HT-3', '참관객 이용권·경품 제안 제출', -30, -30, 'pm', 'partner_submit', 3),
  ht('HT-4', '부스 그래픽 제출', -27, -27, 'design', 'partner_submit', 2),
  ht('HT-5', '발표자료 1차 초안 제출', -23, -23, 'pm', 'partner_submit', 2),
  ht('HT-6', '주최 검토 회신(전 파트너 발표자료)', -16, -16, 'pm', 'internal', 2),
  ht('HT-7', '부스 인력 명단·추가 신청(전력·인터넷·임대) 제출', -14, -14, 'ops', 'partner_submit', 5),
  ht('HT-8', '최종 발표자료·물품 반입 신고 제출', -7, -7, 'pm', 'partner_submit', 5),
  ht('HT-9', '수정 반영 확인·설치/리허설 배정표·반입 동선 통지', -3, -3, 'ops', 'host_notice', 5),
  ht('HT-10', '설치·리허설·행사 당일 운영', -1, 0, 'ops', 'internal', 5),
  ht('HT-11', '참관 등록 리드 데이터 제공(암호화)', 7, 7, 'reg', 'host_notice', 6),
  ht('HT-12', '결과 리포트 발송', 14, 14, 'pm', 'host_notice', 6),
]

// R&R 카드 템플릿 — §15 역할 매핑 원칙(계약·정산·컨펌 게이트=pm / 랜딩·제작물=design /
// 현장 운영·리허설·결과보고=ops / 리드젠·모객·RSVP·등록=reg) 기반 서술(가상 명칭, 가정)
const COMMON_CHARTERS: readonly RoleCharterTemplate[] = [
  {
    role: 'pm',
    origin_role: 'RS',
    title: '총괄 PM',
    items: [
      '계약·정산·발주처 컨펌 게이트 총괄',
      '가이드 발행과 일정·리스크 관리',
      '킥오프·실행 계획 미팅 주재와 내부 현황 취합',
    ],
  },
  {
    role: 'design',
    origin_role: 'MC-PM',
    title: '디자인 리드',
    items: [
      '랜딩페이지·키비주얼·제작물 산출',
      '시안 버전 관리와 내부 검토 대응',
      '가이드 스펙(규격·수량·위치·종류) 기준 제작 진행',
    ],
  },
  {
    role: 'ops',
    origin_role: 'MC-PM',
    title: '운영 리드',
    items: [
      '현장답사·물류·셋팅과 전체 리허설 주관',
      '큐시트·프로그램 운영과 VIP·연사 케어',
      '행사 결과 보고서 작성',
    ],
  },
]

// 주최형 R&R 4카드 — 설계서 §15.3b(v2.4.1, DMS 1건 기반 일반화·가정). event_type과 무관하게
// kind='host' 전 프로젝트에 고정 적용(모객형·일반형이어도 동일 — 파트너 관리 축은 별개).
// origin_role은 §15.3의 WBS 태스크와 동일하게 null(원본 매핑 없음).
export const HOST_ROLE_CHARTER_TEMPLATE: readonly RoleCharterTemplate[] = [
  {
    role: 'pm',
    origin_role: null,
    title: '파트너 총괄 PM',
    items: [
      '파트너 제출 독려 및 진행 현황 관리',
      '주최 검토 회신(HT-6) 총괄, 트랙·부스 배정 확정 통지(HT-2)',
      '발표자료 검토 조율, 마감 D-1 리마인드 확인',
    ],
  },
  {
    role: 'design',
    origin_role: null,
    title: '부스·비주얼 리드',
    items: [
      '부스 그래픽 검토(HT-4) — 규격·재단·해상도 가이드 준수 확인',
      '키비주얼·현장 사인물 제작',
    ],
  },
  {
    role: 'ops',
    origin_role: null,
    title: '현장 운영 리드',
    items: [
      '부스 인력·추가 신청(전력·인터넷·임대) 취합(HT-7)',
      '설치/리허설 배정·반입 동선 통지(HT-9)',
      '행사 당일 현장 운영(HT-10)',
    ],
  },
  {
    role: 'reg',
    origin_role: null,
    title: '참관 등록·리드 관리',
    items: [
      '참관객 모객·등록·체크인 운영',
      '리드 데이터 암호화 제공(HT-11, D+7) 및 제공 이력 관리',
    ],
  },
]

export const ROLE_CHARTER_TEMPLATES: Record<EventType, readonly RoleCharterTemplate[]> = {
  recruiting: [
    ...COMMON_CHARTERS,
    {
      role: 'reg',
      origin_role: 'RO',
      title: '등록·모객 리드',
      items: [
        '리드젠 서베이·대시보드 구축과 리드 수집 운영',
        '참석 확인·노쇼 방지와 데일리 현황 공유',
        '현장 등록 데스크·출입 관리, 쇼업 리스트 납품',
      ],
    },
  ],
  general: [
    ...COMMON_CHARTERS,
    {
      role: 'reg',
      origin_role: null,
      title: '등록 리드',
      items: [
        '참석 대상 명단 확정과 초청장 발송·회신 관리',
        '참관객 등록 데이터 관리와 체크인 운영',
        '현장 등록 데스크·출입 관리',
      ],
    },
  ],
}
