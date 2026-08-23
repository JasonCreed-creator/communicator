// ── 보드 항목 프리셋 정본 (S2 디자인 보드 · 운영 보드) ──────────────────
//
// 두 보드는 성격이 다른데 폼이 같았다. 카테고리 입력이 자유 텍스트에 디자인용
// 예시("예: 배너"·"예: 현수막")만 달려 있었고, 스펙 4필드도 제작물 전용 라벨
// (규격·수량·위치·종류)이라 운영 보드에서는 맞지 않는 말이 떠 있었다.
//
// 스키마는 건드리지 않는다 — `Deliverable.spec_size|qty|location|type` 4열은 그대로 쓰고,
// **영역별로 라벨과 프리셋만 갈아 끼운다**. 컬럼의 의미는 영역 안에서만 해석한다:
//   design  size=규격      qty=수량       location=위치      type=종류
//   ops     size=규모      qty=투입 인원   location=장소·구역  type=운영 구분
//
// 카테고리 목록의 근거:
//   · 픽스처 실측 — design 7종(키비주얼·배너·현수막·초청장·백월·리플렛·명찰),
//     ops 5종(큐시트·시나리오·존운영·운영안·안내문)
//   · 설계서 §15 WBS의 ops 태스크 — 현장답사(1.4)·물류/셋팅(5.1)·리허설(5.3)·결과보고(6.3)
// 목록에 없는 항목은 '직접 입력'으로 언제든 만들 수 있다(자유 입력을 막지 않는다).
import type { DeliverableArea } from '../types/enums'

export interface CategoryPreset {
  /** 카테고리 값 그대로 — Deliverable.category에 저장된다 */
  name: string
  /** 가이드 발행 시 '가이드 내용'에 채워지는 초안. 담당자가 바로 손볼 수 있는 수준으로 쓴다 */
  briefTemplate: string
  /** 스펙 4필드 placeholder — 라벨은 영역 단위, 예시는 카테고리 단위 */
  specHints: Partial<Record<SpecKey, string>>
}

export type SpecKey = 'size' | 'qty' | 'location' | 'type'

export interface AreaPreset {
  /** 스펙 4필드의 영역별 라벨 */
  specLabels: Record<SpecKey, string>
  /** 수량 필드 단위 접미사 (표시 전용) */
  qtyUnit: string
  categories: CategoryPreset[]
}

const DESIGN: AreaPreset = {
  specLabels: { size: '규격', qty: '수량', location: '위치', type: '종류' },
  qtyUnit: '개',
  categories: [
    {
      name: '키비주얼',
      briefTemplate:
        '행사 주제와 톤을 담은 키비주얼 시안을 요청합니다.\n' +
        '- 적용처: 배너·현수막·초청장·랜딩 등 전 매체 공통\n' +
        '- 필수 요소: 행사명·일시·장소·주최\n' +
        '- 시안 2안 이상 제시 부탁드립니다.',
      specHints: { size: '1920×1080px (원본 벡터)', type: 'AI/PDF' },
    },
    {
      name: '배너',
      briefTemplate:
        '행사장 배너 시안을 요청합니다.\n' +
        '- 키비주얼 확정안을 그대로 적용\n' +
        '- 설치 위치 기준으로 여백·시야 높이 확인 부탁드립니다.',
      specHints: { size: '600×1800mm', qty: '2', location: '로비 입구 양측', type: '거치대형' },
    },
    {
      name: '현수막',
      briefTemplate:
        '메인 현수막 시안을 요청합니다.\n' +
        '- 원거리 가독성 우선 — 행사명 위주 구성\n' +
        '- 게시 위치의 실측 규격을 반영해 주세요.',
      specHints: { size: '23000×5000mm', qty: '1', location: '건물 외벽', type: '메쉬' },
    },
    {
      name: '백월',
      briefTemplate:
        '무대 백월 시안을 요청합니다.\n' +
        '- 중계 화면에 잡히는 영역(중앙 상단) 로고 배치 확인\n' +
        '- 무대 구조물 실측 후 최종 규격 확정 부탁드립니다.',
      specHints: { size: '8000×3000mm', qty: '1', location: '메인 스테이지', type: '출력+구조물' },
    },
    {
      name: '리플렛',
      briefTemplate:
        '참가자 배포용 리플렛을 요청합니다.\n' +
        '- 수록: 프로그램·연사·존 안내·오시는 길\n' +
        '- 확정 프로그램 기준으로 작성 부탁드립니다.',
      specHints: { size: '210×297mm', qty: '500', location: '등록데스크 비치', type: '합지' },
    },
    {
      name: '초청장',
      briefTemplate:
        '초청 대상 발송용 초청장을 요청합니다.\n' +
        '- 온·오프라인 2종(이미지·인쇄) 모두 필요\n' +
        '- 신청 링크 QR 포함 부탁드립니다.',
      specHints: { size: '1080×1080px', qty: '300', type: '온라인+인쇄' },
    },
    {
      name: '명찰',
      briefTemplate:
        '참가자 명찰을 요청합니다.\n' +
        '- 구분(참가자·연사·스태프·VIP)별 색상 분리\n' +
        '- 등록 시스템 출력 규격과 맞는지 확인 부탁드립니다.',
      specHints: { size: '100×70mm', qty: '700', type: '4종 구분' },
    },
  ],
}

const OPS: AreaPreset = {
  specLabels: { size: '규모', qty: '투입 인원', location: '장소·구역', type: '운영 구분' },
  qtyUnit: '명',
  categories: [
    {
      name: '큐시트',
      briefTemplate:
        '행사 진행 큐시트 작성을 요청합니다.\n' +
        '- 확정 프로그램 순서대로 큐 번호·시간·구분을 채워 주세요.\n' +
        '- 콘솔 3채널(음향·조명·스크린) 지시를 각 큐에 함께 기입\n' +
        '- 리허설 전까지 초안, 리허설 후 확정본으로 갱신합니다.',
      specHints: { size: '본 세션 전체', location: '메인 스테이지', type: '진행·콘솔 통합' },
    },
    {
      name: '시나리오',
      briefTemplate:
        '진행 시나리오(대본)를 요청합니다.\n' +
        '- 오프닝·세션 전환·클로징 멘트 전문 포함\n' +
        '- 사회자 확정 후 톤 조정이 필요하니 초안 먼저 공유 부탁드립니다.',
      specHints: { size: '오프닝~클로징', location: '메인 스테이지', type: '사회자 대본' },
    },
    {
      name: '존운영',
      briefTemplate:
        '존 운영 사양서를 요청합니다.\n' +
        '- 존별 목적·동선·집기 리스트·운영 인력 배치\n' +
        '- 운영 시간과 피크 예상 시간대를 함께 적어 주세요.\n' +
        '- 전기·네트워크 필요 여부 명시 부탁드립니다.',
      specHints: { size: '40㎡', qty: '3', location: '3F 리빌드존', type: '상시 운영' },
    },
    {
      name: '운영안',
      briefTemplate:
        '전체 현장 운영안을 요청합니다.\n' +
        '- 타임라인(셋업~철수)·인력 배치표·비상 대응\n' +
        '- 협력사 반입·반출 시간 포함 부탁드립니다.',
      specHints: { size: '셋업 D-1 ~ 철수 당일', qty: '12', location: '행사장 전체', type: '통합 운영' },
    },
    {
      name: '안내문',
      briefTemplate:
        '참가자 안내문을 요청합니다.\n' +
        '- 입장·등록 절차, 주차·대중교통, 문의처\n' +
        '- 발송 채널(메일·문자)에 맞춰 길이 조정 부탁드립니다.',
      specHints: { location: '등록데스크·사전 발송', type: '참가자 대상' },
    },
    {
      name: '현장답사',
      briefTemplate:
        '현장 답사 결과 정리를 요청합니다.\n' +
        '- 주차·하역 동선, 반입 경로, 엘리베이터 규격\n' +
        '- 전기 용량·네트워크·음향 조건 확인\n' +
        '- 사진과 실측 치수를 함께 남겨 주세요.',
      specHints: { qty: '2', location: '행사장 전역', type: '사전 답사' },
    },
    {
      name: '물류·셋팅',
      briefTemplate:
        '물류 배송·현장 셋팅 계획을 요청합니다.\n' +
        '- 품목별 반입 시간·담당·검수 기준\n' +
        '- 셋업 순서(구조물 → 시스템 → 사이니지) 기준으로 작성 부탁드립니다.',
      specHints: { size: '5톤 1대', qty: '6', location: '하역장 → 각 존', type: 'D-1 반입' },
    },
    {
      name: '리허설',
      briefTemplate:
        '전체 리허설·테크니컬 체크 계획을 요청합니다.\n' +
        '- 큐시트 기준 순차 체크(음향·조명·스크린·중계)\n' +
        '- 연사 입퇴장 동선과 마이크 전환 확인\n' +
        '- 발견 이슈는 큐시트에 즉시 반영합니다.',
      specHints: { size: '3시간', qty: '8', location: '메인 스테이지', type: 'D-1 통합 리허설' },
    },
    {
      name: '결과보고',
      briefTemplate:
        '행사 결과보고서 작성을 요청합니다.\n' +
        '- 참석·체크인 실적, 존별 운영 결과, 이슈와 대응\n' +
        '- 차기 개선 제안을 마지막 절에 정리 부탁드립니다.',
      specHints: { type: '사후 보고' },
    },
  ],
}

// 'common'(공통 문서)은 S2 보드 라우트가 없지만(BOARD_AREAS = design·ops) 타입상 존재한다.
// 공통 문서는 규격·인원 개념이 없어 라벨을 중립적으로 두고 최소 항목만 둔다.
const COMMON: AreaPreset = {
  specLabels: { size: '분량', qty: '부수', location: '보관·공유 위치', type: '문서 종류' },
  qtyUnit: '부',
  categories: [
    {
      name: '회의록',
      briefTemplate:
        '회의록 작성을 요청합니다.\n' +
        '- 안건·결정사항·후속 조치(담당·기한)를 분리해 정리\n' +
        '- 미결 사항은 다음 회의 안건으로 넘겨 주세요.',
      specHints: { type: '내부 공유' },
    },
    {
      name: '계약·정산',
      briefTemplate:
        '계약·정산 문서를 요청합니다.\n' +
        '- 대상 협력사와 범위, 지급 조건 명시\n' +
        '- 금액이 포함되므로 발주처 공유 대상이 아닙니다.',
      specHints: { type: '내부 한정' },
    },
  ],
}

const PRESETS: Record<DeliverableArea, AreaPreset> = { design: DESIGN, ops: OPS, common: COMMON }

export function areaPreset(area: DeliverableArea): AreaPreset {
  return PRESETS[area]
}

export function categoryPreset(
  area: DeliverableArea,
  category: string,
): CategoryPreset | undefined {
  return PRESETS[area].categories.find((c) => c.name === category)
}

/** 영역별 스펙 라벨 — BriefCard·폼이 같은 값을 쓰도록 한 곳에서 판다 */
export function specLabels(area: DeliverableArea): Record<SpecKey, string> {
  return PRESETS[area].specLabels
}
