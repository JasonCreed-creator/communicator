import Card from './Card'
import type { Deliverable } from '../../types/entities'

type BriefFields = Pick<
  Deliverable,
  'brief' | 'brief_refs' | 'spec_size' | 'spec_qty' | 'spec_location' | 'spec_type'
>

/**
 * S3 가이드 카드 (v1.2) — brief·brief_refs·spec_* 중 하나라도 있으면 렌더.
 * PM 가이드 발행(§8 POST /deliverables)의 결과를 담당자 화면에 보여주는 용도.
 * 값이 없는 필드는 표시하지 않는다(스펙은 전부 선택적).
 */
export default function BriefCard({ deliverable }: { deliverable: BriefFields }) {
  const hasBrief = !!deliverable.brief?.trim()
  const refs = deliverable.brief_refs ?? []
  const specs: { label: string; value: string }[] = []
  if (deliverable.spec_size) specs.push({ label: '규격', value: deliverable.spec_size })
  if (deliverable.spec_qty != null) specs.push({ label: '수량', value: `${deliverable.spec_qty}개` })
  if (deliverable.spec_location) specs.push({ label: '위치', value: deliverable.spec_location })
  if (deliverable.spec_type) specs.push({ label: '종류', value: deliverable.spec_type })

  if (!hasBrief && refs.length === 0 && specs.length === 0) return null

  return (
    // §6 S3: 가이드 카드는 accent-tint 배경 카드(Card의 className 확장 — 흰 배경 오버라이드는
    // utilities 레이어가 components 레이어(.ui-card)보다 우선하는 Tailwind v4 레이어 순서로 성립).
    <Card title="가이드 카드" className="bg-accent-tint">
      <div className="space-y-4">
        {hasBrief && <p className="whitespace-pre-wrap text-sm text-ink-sub">{deliverable.brief}</p>}

        {refs.length > 0 && (
          <div>
            <p className="t-caption">참고 링크</p>
            <ul className="mt-1.5 space-y-1">
              {refs.map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm text-steel hover:underline"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {specs.length > 0 && (
          <div>
            <p className="t-caption">스펙</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {specs.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-medium text-accent-deep"
                >
                  <span className="text-ink-sub">{s.label}</span>
                  {s.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
