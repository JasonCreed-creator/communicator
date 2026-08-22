import { ROLE_LABELS } from '../../lib/labels'
import type { RoleCharter } from '../../types/entities'

/** S5 하단 R&R 카드 그리드 — 역할 라벨·카드 타이틀·책임 불릿·origin_role 태그 */
export default function RoleCharterGrid({ charters }: { charters: RoleCharter[] }) {
  if (charters.length === 0) {
    return <p className="text-sm text-gray-400">등록된 R&amp;R이 없습니다.</p>
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {charters.map((c) => (
        <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
              {ROLE_LABELS[c.role]}
            </span>
            {c.origin_role && (
              <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {c.origin_role}
              </span>
            )}
          </div>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">{c.title}</h4>
          <ul className="list-disc space-y-1 pl-4 text-xs text-gray-600">
            {c.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
