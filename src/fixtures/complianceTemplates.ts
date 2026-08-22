// 컴플라이언스 카드 2종 템플릿 — 설계서 §4-17 (Configurator SocDashboard 정적 상수
// INTERNAL_COMPLIANCE·CLIENT_COMPLIANCE_RULES 승계). 온보딩 완료 시 행사에 시드된다.
// #RULE-NO-COMPANY: 원본의 실회사 표기(리멤버/엠앤씨)는 §15 역할 매핑 원칙의 origin_role
// 코드(RS·RO·MC-PM·MC-AT) 표기로 치환 — 규약 본문(책임·기한·규칙)은 원문 유지.
import type { ComplianceKind } from '../types/enums'

export interface ComplianceCardTemplate {
  kind: ComplianceKind
  title: string
  items: string[]
  sort_order: number
}

export const COMPLIANCE_CARD_TEMPLATES: readonly ComplianceCardTemplate[] = [
  {
    kind: 'internal',
    title: '내부 운영 규약 (역할별 책임)',
    sort_order: 1,
    items: [
      '[영업 RS] 계약·단가 조건 확정 책임 — 초기 계약 단계에서 단가·조건·KPI를 명시적으로 확정한다.',
      '[영업 RS] 정산 트랙 책임 — 견적서 수령부터 세금계산서·운영비 정산·회계 마감까지의 전 과정을 책임진다.',
      '[영업 RS] 클라이언트 공식 소통 창구 — 클라이언트 요구 변경은 영업을 통해 공식화한 뒤 내부에 전파한다.',
      '[운영 RO] 리드젠 시스템 무결성 — 서베이/랜딩/대시보드/관리 시트의 일관성을 유지한다.',
      '[운영 RO] 시트 수동 조작 금지 — 협력사 인계 후 관리 시트의 수동 수정·셀/열 조작 일체 금지.',
      '[운영 RO] 리드 데이터 규격 준수 — 1·2행 헤더, 응답ID/리드인입일시/이메일주소 컬럼 위치를 고정한다.',
      '[협력 총괄 MC-PM] 제작물·현장 품질 책임 — 랜딩·제작물·현장 운영 모든 산출물의 최종 품질을 책임진다.',
      '[협력 총괄 MC-PM] 결과 보고·견적서 정확성 — D+3~D+5 기한 내 결과 보고서와 운영 견적서를 작성·전달한다.',
      '[협력 총괄 MC-PM] 시트 구조 변경 절대 금지 — 시트 내 모든 영역(A~E)의 열 삭제·순서 변경·행 삽입 금지.',
      '[협력 RSVP MC-AT] 컨택 기한 D+2 준수 — 타깃일치 확정 리드는 제출일 D+2까지 RSVP 진행.',
      '[협력 RSVP MC-AT] 데일리 현황 공유 성실 이행 — D-5~D-1 기간 매일 운영에 쇼업 현황을 공유한다.',
      '[협력 RSVP MC-AT] 입력 규칙 엄수 — D·E 영역 외 모든 영역은 고객 노출 대시보드 지표와 직결되므로 정교한 관리 필수.',
    ],
  },
  {
    kind: 'client',
    title: '고객사 계약 규약',
    sort_order: 2,
    items: [
      'D+1 검수 기한 준수 — 리드 인입 후 1일(D+1) 이내에 고객사는 [타깃 일치/불일치] 확정을 제출해야 함. 미제출 시 자동으로 타깃일치 처리되어 컨택이 시작됨.',
      '리드 확정 후 수정 불가 (Lock-in) — 고객사가 [리드 확정 제출] 버튼을 클릭한 뒤에는 어떤 경우에도 해당 리드의 타깃 판정을 수정할 수 없음.',
      '타깃 불일치 예외 처리 — 계약서에 명시된 디타겟 조건 외에는 타깃 불일치 처리가 불가. 예외는 영업과 협의하여 최종 확정.',
    ],
  },
]
