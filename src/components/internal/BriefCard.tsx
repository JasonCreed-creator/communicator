import Card from './Card'
import type { Deliverable } from '../../types/entities'
import { areaPreset } from '../../lib/boardPresets'

type BriefFields = Pick<
  Deliverable,
  'area' | 'brief' | 'brief_refs' | 'spec_size' | 'spec_qty' | 'spec_location' | 'spec_type'
>

/**
 * S3 가이드 카드 (v1.2) — brief·brief_refs·spec_* 중 하나라도 있으면 렌더.
 * 스펙 라벨은 항목의 area를 따른다(디자인=규격·수량 / 운영=규모·투입 인원).
 * PM 가이드 발행(§8 POST /deliverables)의 결과를 담당자 화면에 보여주는 용도.
 * 값이 없는 필드는 표시하지 않는다(스펙은 전부 선택적).
 * Phase 3.23 PR-4(§7-2.7) — 제목 '제작 가이드'(디자인)·'가이드'(그 외). 항목 상세 오른쪽 열에 놓이고,
 * 비어 있으면 showEmpty일 때 "가이드 없이 만든 항목" 안내 + (고칠 수 있으면) '채우기'로 고치기 폼을 연다.
 */
export default function BriefCard({
  deliverable,
  showEmpty = false,
  onFill,
}: {
  deliverable: BriefFields
  showEmpty?: boolean
  /** PM — 비어 있을 때 '채우기'(고치기 폼을 연다) */
  onFill?: () => void
}) {
  const cardTitle = deliverable.area === 'design' ? '제작 가이드' : '가이드'
  const hasBrief = !!deliverable.brief?.trim()
  const refs = deliverable.brief_refs ?? []
  // 스펙 라벨·단위는 영역마다 다르다 — 제작물의 '규격·수량'을 운영 항목에 그대로 쓰면 말이 안 맞는다
  // (src/lib/boardPresets.ts 정본). 컬럼은 그대로 두고 해석만 영역 안에서 한다.
  const { specLabels, qtyUnit } = areaPreset(deliverable.area)
  const specs: { label: string; value: string }[] = []
  if (deliverable.spec_size) specs.push({ label: specLabels.size, value: deliverable.spec_size })
  if (deliverable.spec_qty != null) {
    specs.push({ label: specLabels.qty, value: `${deliverable.spec_qty}${qtyUnit}` })
  }
  if (deliverable.spec_location) {
    specs.push({ label: specLabels.location, value: deliverable.spec_location })
  }
  if (deliverable.spec_type) specs.push({ label: specLabels.type, value: deliverable.spec_type })

  if (!hasBrief && refs.length === 0 && specs.length === 0) {
    if (!showEmpty) return null
    return (
      <Card
        title={cardTitle}
        action={
          onFill ? (
            <button type="button" onClick={onFill} className="text-sm font-medium text-accent-deep hover:underline">
              채우기
            </button>
          ) : undefined
        }
      >
        <p className="text-sm leading-relaxed text-ink-sub">
          {deliverable.area === 'design'
            ? '가이드 없이 만든 항목입니다. 규격·수량·설치 위치를 적어 두면 운영계획서 제작물 표에 들어갑니다.'
            : '가이드 없이 만든 항목입니다. 할 일과 규모를 적어 두면 담당자가 같은 기준으로 작업합니다.'}
        </p>
      </Card>
    )
  }

  return (
    // §6 S3: 가이드 카드는 accent-tint 배경 카드(Card의 className 확장 — 흰 배경 오버라이드는
    // utilities 레이어가 components 레이어(.ui-card)보다 우선하는 Tailwind v4 레이어 순서로 성립).
    <Card title={cardTitle} className="bg-accent-tint">
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
