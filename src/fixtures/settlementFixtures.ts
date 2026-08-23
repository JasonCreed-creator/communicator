// v2.2 정산 픽스처 — 샘플 행사(prj-stc26)의 확정 견적 quo-003을 기준으로 보드 1건을 시드한다.
//
// #RULE-NO-COMPANY: 협력사명은 전부 **가상 명칭**이다. 실거래처명은 픽스처에 넣지 않는다
// (설계서 §19.6 — vendors.name이 실명 예외인 것은 운영 데이터 한정).
//
// 데모에서 보여야 하는 것:
//   · 버킷 9종이 견적에서 스냅숏되고 rc/ld가 분리돼 있다
//   · 항목 상태가 planned·ordered·settled로 섞여 있다
//   · **한 버킷은 일부러 견적 초과**다 — 경고 UI가 데모에서 실제로 떠야 한다
//   · 같은 협력사를 여러 항목이 참조한다 — 마스터가 왜 필요한지 보인다
//   · RE:BUILD 27에는 보드를 만들지 않는다 → "확정 견적에서 시작" 빈 상태
import type {
  Quote,
  SettlementBoard,
  SettlementBucket,
  SettlementItem,

} from '../types/entities'
import type { MockState } from './sampleProject'
import { computeQuoteOutputs } from '../modules/quote/engine/quoteInput'
import { quoteBucketSpec } from '../lib/settlement'

export const SETTLEMENT_BOARD_ID = 'brd-001'

/** 가상 협력사 8곳 — 여러 항목이 같은 곳을 참조하도록 배치한다 */
const VENDORS: [string, string, string | null][] = [
  ['ven-001', '가온스테이지', '무대·구조물'],
  ['ven-002', '한빛시스템', '음향·영상·조명'],
  ['ven-003', '미르프린트', '출력·사이니지'],
  ['ven-004', '이든케이터링', 'F&B'],
  ['ven-005', '나루렌탈', '집기 임차'],
  ['ven-006', '솔빛미디어', '촬영·중계'],
  ['ven-007', '터전물류', '배송·설치 인력'],
  ['ven-008', '별해운영', '현장 운영요원'],
]

interface ItemSeed {
  bucket: string
  title: string
  vendor: string | null
  assignee: string | null
  ordered: number | null
  actual: number | null
  status: SettlementItem['status']
  evidence?: string
  spec?: string
}

/**
 * 항목 12건. s2(시스템 구축)를 **일부러 견적 초과**로 둔다 —
 * 현장에서 장비가 추가되는 건 실제로 가장 흔한 초과 사유다.
 */
const ITEMS: ItemSeed[] = [
  // s1 베뉴 — 계약 완료, 견적 안쪽
  { bucket: 's1', title: '메인홀 대관료', vendor: null, assignee: 'usr-pm', ordered: 21_000_000, actual: 21_000_000, status: 'settled', evidence: '세금계산서 발행' },
  { bucket: 's1', title: '부속실 추가 대관', vendor: null, assignee: 'usr-pm', ordered: 2_400_000, actual: 2_400_000, status: 'settled', evidence: '세금계산서 발행' },

  // s2 시스템 — 초과 버킷 (현장 장비 추가)
  { bucket: 's2', title: 'LED·미디어월 일체', vendor: 'ven-002', assignee: 'usr-ops', ordered: 18_500_000, actual: 18_500_000, status: 'settled', evidence: '세금계산서 발행', spec: 'LED 12×3m' },
  { bucket: 's2', title: '음향·조명 콘솔 운용', vendor: 'ven-002', assignee: 'usr-ops', ordered: 6_800_000, actual: 7_400_000, status: 'settled', evidence: '카드전표', spec: '현장 추가 1식' },
  { bucket: 's2', title: '중계 카메라 3대', vendor: 'ven-006', assignee: 'usr-ops', ordered: 3_500_000, actual: 3_500_000, status: 'settled', evidence: '세금계산서 발행' },
  { bucket: 's2', title: '무대 구조물 설치', vendor: 'ven-001', assignee: 'usr-ops', ordered: 5_200_000, actual: 5_600_000, status: 'settled', evidence: '세금계산서 발행', spec: '이동식 12×3.6m' },

  // s3 디자인 — 발주만 하고 정산 전
  { bucket: 's3', title: '사이니지 출력·시공', vendor: 'ven-003', assignee: 'usr-design', ordered: 4_100_000, actual: null, status: 'ordered', spec: '현수막·배너 일괄' },
  { bucket: 's3', title: '백월 제작', vendor: 'ven-001', assignee: 'usr-design', ordered: 2_800_000, actual: null, status: 'ordered' },

  // s4 운영 — 섞임
  { bucket: 's4', title: '현장 운영요원 12명', vendor: 'ven-008', assignee: 'usr-ops', ordered: 2_400_000, actual: 2_400_000, status: 'settled', evidence: '세금계산서 발행' },
  { bucket: 's4', title: '물류 배송·설치', vendor: 'ven-007', assignee: 'usr-ops', ordered: 2_200_000, actual: null, status: 'ordered' },
  { bucket: 's4', title: '행사보험', vendor: null, assignee: 'usr-pm', ordered: null, actual: null, status: 'planned' },

  // ot 추가옵션 — 케이터링
  { bucket: 'ot', title: '다과 케이터링', vendor: 'ven-004', assignee: 'usr-ops', ordered: 5_400_000, actual: 5_400_000, status: 'settled', evidence: '세금계산서 발행', spec: '700인분' },
  { bucket: 'ot', title: '집기 임차(테이블·의자)', vendor: 'ven-005', assignee: 'usr-ops', ordered: 1_600_000, actual: null, status: 'planned' },
]

export function seedSettlementFixtures(
  state: MockState,
  projectId: string,
  quote: Quote,
  today: string,
): void {
  const now = `${today}T09:00:00.000Z`

  state.vendors.push(
    ...VENDORS.map(([id, name, note]) => ({
      id,
      name,
      biz_no: null,
      note,
      archived_at: null,
      created_at: now,
    })),
  )

  const board: SettlementBoard = {
    id: SETTLEMENT_BOARD_ID,
    project_id: projectId,
    quote_id: quote.id,
    quote_version: quote.version,
    baselined_at: now,
    created_at: now,
    updated_at: now,
  }
  state.settlement_boards.push(board)

  // 버킷 스냅숏 — provider와 **같은 표**를 쓴다(§19.2, src/lib/settlement.ts).
  const engine = computeQuoteOutputs(quote.input).result
  const buckets: SettlementBucket[] = quoteBucketSpec(quote.breakdown, engine).map((row, i) => ({
    id: `bkt-${row.code}`,
    board_id: board.id,
    code: row.code,
    label: row.label,
    quote_amount: row.quote_amount,
    has_cost: row.has_cost,
    is_margin_base: row.is_margin_base,
    source: 'quote',
    sort_order: i + 1,
    created_at: now,
  }))
  state.settlement_buckets.push(...buckets)

  ITEMS.forEach((seed, i) => {
    state.settlement_items.push({
      id: `sti-${String(i + 1).padStart(3, '0')}`,
      board_id: board.id,
      bucket_id: `bkt-${seed.bucket}`,
      title: seed.title,
      spec: seed.spec ?? null,
      vendor_id: seed.vendor,
      assignee_id: seed.assignee,
      ordered_amount: seed.ordered,
      actual_amount: seed.actual,
      input_amount_raw: null,
      vat_included_input: false,
      status: seed.status,
      evidence: seed.evidence ?? null,
      import_id: null,
      note: null,
      created_at: now,
      updated_at: now,
    })
  })
}
