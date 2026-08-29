// `/c` 담당자 블록 (Phase 3.18.1 §2) — 발주처가 "누구에게 연락하면 되는지"를 화면에서 바로 알아야 한다.
// 담당자는 **가리지 않는다**: 이름·역할·소속·이메일·전화를 그대로 적고 mailto:·tel:을 건다.
// 참가자 명단 PII 마스킹(§24)은 '명단'의 규칙이지 담당자 표기의 규칙이 아니다 — 두 규칙을 섞지 않는다.
// 외부 지면 규격: 1열 스택 · 연락 링크는 터치 44(min-h-11).
import type { ReactNode } from 'react'

export interface ClientContactPerson {
  id: string
  name: string
  /** 화면에 그대로 적히는 역할 라벨 — '담당 PM'·'발주처 담당자' */
  role: string
  org?: string | null
  email?: string | null
  phone?: string | null
}

function ContactRow({ person }: { person: ClientContactPerson }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-ink">{person.name}</span>
        <span className="t-caption">{person.role}</span>
        {person.org && <span className="t-caption">· {person.org}</span>}
      </div>
      {(person.email || person.phone) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-4">
          {person.email && (
            <a href={`mailto:${person.email}`} className="inline-flex min-h-11 items-center text-sm text-accent-deep underline">
              {person.email}
            </a>
          )}
          {person.phone && (
            <a href={`tel:${person.phone.replace(/[^0-9+]/g, '')}`} className="inline-flex min-h-11 items-center text-sm text-accent-deep underline">
              {person.phone}
            </a>
          )}
        </div>
      )}
    </li>
  )
}

export default function ClientContactCard({
  people,
  note,
}: {
  people: ClientContactPerson[]
  /** 연락 창구 안내 한 줄 — 카드 하단 */
  note?: ReactNode
}) {
  if (people.length === 0 && !note) return null

  return (
    <div className="ui-card px-4 py-3">
      {people.length > 0 && (
        <ul className="divide-y divide-border">
          {people.map((p) => (
            <ContactRow key={p.id} person={p} />
          ))}
        </ul>
      )}
      {note && (
        <p className={`text-xs leading-relaxed text-ink-cap ${people.length > 0 ? 'mt-3 border-t border-border pt-3' : ''}`}>
          {note}
        </p>
      )}
    </div>
  )
}
