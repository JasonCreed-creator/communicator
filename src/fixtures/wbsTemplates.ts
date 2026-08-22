// WBS·R&R 기본 템플릿 — 설계서 v1.4.1 부록 §15의 1:1 이식 (정본은 설계서).
// 모객형 37태스크는 표를 그대로 옮긴 것(코드·기간·역할·origin_role 보존 — Configurator v0.2 호환).
// 일반형 28태스크: §15가 코드 단위로 명시한 제외 집합(3.1~3.5 + 4.1~4.5·4.7, 4.6 존치)을
//   제외하고 3G 2건을 추가 — GENERAL_EXCLUDED_CODES·GENERAL_EXTRA_TASKS가 §15의 정본 구현.
import type { EventType, MemberRole } from '../types/enums'

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

// R&R 카드 템플릿 — §15 역할 매핑 원칙(계약·정산·컨펌 게이트=pm / 랜딩·제작물=design /
// 현장 운영·리허설·결과보고=ops / 리드젠·모객·RSVP·등록=reg) 기반 서술(가상 명칭, 가정)
const COMMON_CHARTERS: readonly RoleCharterTemplate[] = [
  {
    role: 'pm',
    origin_role: 'RS',
    title: '총괄 PM',
    items: [
      '계약·정산·발주처 컨펌 게이트 총괄',
      '지시 발행과 일정·리스크 관리',
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
      '지시 스펙(규격·수량·위치·종류) 기준 제작 진행',
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
