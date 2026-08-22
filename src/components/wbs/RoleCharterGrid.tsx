import { ROLE_BORDER_CLASSES, ROLE_LABELS } from '../../lib/labels'
import type { RoleCharter } from '../../types/entities'

/** S5 하단 R&R 카드 그리드 — 역할 라벨·카드 타이틀·책임 불릿·origin_role 태그.
 *  좌측 보더 4px = 역할 컬러(디자인지시서 v1 §6 S5). */
export default function RoleCharterGrid({ charters }: { charters: RoleCharter[] }) {
  if (charters.length === 0) {
    return <p className="text-sm text-ink-cap">등록된 R&amp;R이 없습니다.</p>
  }
  // v2.0: 컴플라이언스 카드와 좌우 배치(반폭)되면서 4열이 뭉개져 2열 고정 (§6 의미 유지)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {charters.map((c) => (
        <div
          key={c.id}
          className={`ui-card overflow-hidden border-l-4 p-4 ${ROLE_BORDER_CLASSES[c.role]}`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-dark px-2 py-0.5 text-xs font-medium text-white">
              {ROLE_LABELS[c.role]}
            </span>
            {c.origin_role && (
              <span className="inline-flex items-center rounded bg-track px-1.5 py-0.5 text-[10px] font-medium text-ink-cap">
                {c.origin_role}
              </span>
            )}
          </div>
          <h4 className="mb-2 t-card-title">{c.title}</h4>
          <ul className="list-disc space-y-1 pl-4 text-xs text-ink-sub">
            {c.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
