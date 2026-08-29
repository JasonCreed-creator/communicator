// '제출 자료' 카드 — 고객사가 보내주셔야 할 항목 한 장.
// 외부 지면 규격: 액션 44px(h-11) 고정, btn-sm 금지, 1열 스택. 접수 완료 건은 흐리게 + 액션 없음.
import { LevelBadge } from '../internal/StatusBadge'
import { ddayLabel, formatDate } from '../../lib/labels'
import type { ClientMaterialRequest } from './clientDerive'

export default function ClientMaterialCard({
  material,
  onUpload,
}: {
  material: ClientMaterialRequest
  /** 파일 올리기 — 접수 경로가 아직 열리지 않은 동안 페이지가 안내를 띄운다 */
  onUpload: (material: ClientMaterialRequest) => void
}) {
  if (material.received) {
    return (
      <article className="rounded-xl border border-border bg-canvas p-4 opacity-75">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-ink-sub">{material.title}</p>
            {material.received_note && (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-cap">{material.received_note}</p>
            )}
          </div>
          <LevelBadge level="positive" label="접수 완료" />
        </div>
      </article>
    )
  }

  const dday = material.due_date ? ddayLabel(material.due_date) : null
  // 기한이 지났거나(D-day·D+n) 일주일 안이면 '내 행동을 기다림'(주의)으로 본다
  const urgent =
    dday !== null && (!dday.startsWith('D-') || Number(dday.slice(2)) <= 7)

  return (
    <article className={`ui-card p-4 ${urgent ? 'border-accent' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{material.title}</p>
          {material.note && (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-sub">{material.note}</p>
          )}
        </div>
        {material.due_date && dday ? (
          <LevelBadge
            level={urgent ? 'attention' : 'neutral'}
            label={`${formatDate(material.due_date)} · ${dday}`}
          />
        ) : (
          <LevelBadge level="neutral" label="기한 미정" />
        )}
      </div>
      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={() => onUpload(material)}
          className={`btn ${urgent ? 'btn-accent' : 'btn-ghost'} h-11 flex-1`}
        >
          파일 올리기
        </button>
        {material.mailto ? (
          <a href={material.mailto} className="btn btn-ghost h-11 shrink-0">
            메일로 보내기
          </a>
        ) : (
          <button type="button" disabled className="btn btn-ghost h-11 shrink-0">
            메일로 보내기
          </button>
        )}
      </div>
    </article>
  )
}
