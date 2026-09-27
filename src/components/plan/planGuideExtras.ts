// 운영계획서 — 마스터 시트 대체 섹션 3종의 조립 도우미 (설계서 v2.21 §27.2 · Phase 6.11 PR-A). 순수 함수만 둔다 —
// S9(A4) 04 존별 운영·06 등록 통계와 16:9 장표 03 공간·설치·05 참가자가 같은 값을 읽는다.
// - 설치 도면: 운영가이드 floorplan 섹션이 연결한 항목의 최신 버전(PlanData.zones·production_items의 latest_version)을 찾는다.
//   이미지(PNG·JPG)면 그림, 아니면 파일 이름만(링크). PlanData 밖을 읽지 않는다 — 새 조회 0.
// - 답사 요약: 확인내용(finding)이 있는 줄만 싣는다(빈 뼈대는 싣지 않는다).
// - 참가자 안내: 단계·발송일·채널·대상·상태만 — 원고(subject·body)는 운영계획서에 싣지 않는다(내부 가이드에서만).
import { MESSAGING_CHANNEL_LABELS, MESSAGING_STATUS_LABELS } from '../../lib/guideStructured'
import { formatDate } from '../../lib/labels'
import { fileExtension, isPreviewFileName } from '../../lib/statusMachine'
import type { GuideMessagingRow, GuideSurveyRow } from '../../types/entities'
import type { PlanData, PlanVersionRef } from '../../types/views'

export interface PlanFloorplanFigure {
  title: string
  note: string
  /** 연결한 항목 제목 — 항목이 조립 데이터에 없으면 null */
  item_title: string | null
  /** 최신 버전 — 없으면 null */
  version: PlanVersionRef | null
  /** 이미지(PNG·JPG)로 실을 수 있는가 — PDF·그 밖은 파일 이름만 */
  image_url: string | null
}

/** 설치 도면 — 운영가이드 floorplan 섹션 항목 → 연결한 항목의 최신 버전(이미지면 그림). 섹션이 없거나 비면 [] */
export function planFloorplanFigures(plan: PlanData): PlanFloorplanFigure[] {
  const section = plan.guide?.sections.find((s) => s.kind === 'floorplan')
  const data = section?.data
  if (!data || data.type !== 'floorplan') return []
  const refs = new Map<string, { title: string; version: PlanVersionRef | null }>()
  for (const z of plan.zones) refs.set(z.deliverable_id, { title: z.title, version: z.latest_version })
  for (const p of plan.production_items) refs.set(p.deliverable_id, { title: p.title, version: p.latest_version })
  return data.items.map((it, i) => {
    const ref = it.deliverable_id ? refs.get(it.deliverable_id) ?? null : null
    const version = ref?.version ?? null
    const image =
      !!version && !!version.preview_url && isPreviewFileName(version.file_name) && fileExtension(version.file_name) !== 'pdf'
    return {
      title: it.title.trim() || ref?.title || `도면 ${i + 1}`,
      note: it.note.trim(),
      item_title: ref?.title ?? null,
      version,
      image_url: image ? version.preview_url : null,
    }
  })
}

export interface PlanSurveyFinding extends GuideSurveyRow {
  scope_label: string
}

/** 답사 요약 — 확인내용이 있는 줄만(외부 → 내부 순). 섹션이 없거나 확인한 줄이 없으면 [] */
export function planSurveyFindings(plan: PlanData): { visited_on: string | null; rows: PlanSurveyFinding[] } {
  const section = plan.guide?.sections.find((s) => s.kind === 'survey')
  const data = section?.data
  if (!data || data.type !== 'survey') return { visited_on: null, rows: [] }
  const rows = (['external', 'internal'] as const).flatMap((scope) =>
    data.rows
      .filter((r) => r.scope === scope && r.finding.trim())
      .map((r) => ({ ...r, scope_label: scope === 'external' ? '외부' : '내부' })),
  )
  return { visited_on: data.visited_on, rows }
}

export interface PlanMessagingLine {
  stage: string
  /** '12/1 10:00' 같은 표시 — 발송일 없으면 '—' */
  when: string
  channel: string
  audience: string
  status: string
  sent: boolean
}

/** 참가자 안내 — 단계·발송일·채널·대상·상태만(원고 제외). 섹션이 없거나 비면 [] */
export function planMessagingLines(plan: PlanData): PlanMessagingLine[] {
  const section = plan.guide?.sections.find((s) => s.kind === 'messaging')
  const data = section?.data
  if (!data || data.type !== 'messaging') return []
  return data.rows.map((r) => ({
    stage: r.stage.trim() || '(단계 이름 없음)',
    when: messagingWhen(r),
    channel: MESSAGING_CHANNEL_LABELS[r.channel] ?? r.channel,
    audience: r.audience.trim() || '—',
    status: MESSAGING_STATUS_LABELS[r.status] ?? r.status,
    sent: r.status === 'sent',
  }))
}

export function messagingWhen(r: Pick<GuideMessagingRow, 'send_on' | 'send_at'>): string {
  if (!r.send_on) return '—'
  return r.send_at ? `${formatDate(r.send_on)} ${r.send_at}` : formatDate(r.send_on)
}
