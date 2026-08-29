import type { ReactNode } from 'react'
import { LevelBadge } from '../internal/StatusBadge'
import type { PlanSectionKey } from '../../types/views'
import {
  PLAN_SECTION_META,
  PLAN_SECTION_STATE_LABELS,
  PLAN_SECTION_STATE_LEVEL,
  planSectionAnchor,
  planSectionState,
  type SectionProgressData,
} from './planSections'

interface PlanSectionProps {
  sectionKey: PlanSectionKey
  progress?: SectionProgressData
  /** pm·ops 전용 편집 버튼 등 — 인쇄 시 숨김(print-hidden)은 호출부가 부여 */
  action?: ReactNode
  /** 'emergency' = 07 비상 대응 전용 장(2px negative 경고 면 + 옆면 색인 탭) */
  variant?: 'default' | 'emergency'
  children: ReactNode
}

/**
 * S9 섹션 공통 컨테이너 — 넘버링(01~08, 32px 큰 숫자 + 제목 아래 26×2.5 accent 틱) 헤더 +
 * 섹션 상태 배지(완료·작성 중·미입력, 숫자는 배지 안) + 인쇄 시 섹션 중간 끊김 방지.
 * `plan-section` 클래스가 src/index.css의 `break-inside: avoid` 인쇄 규칙 대상이다(DoD-9).
 * 종이 메타포 — 시트(.plan-doc) 내부는 하단 헤어라인으로만 구분하고 별도 카드 박스를 두지
 * 않는다(§5 카드 안 카드 금지). 07 비상 대응만 예외로 경고 면을 두른다(흑백 인쇄에서도 찾히게).
 */
export default function PlanSection({
  sectionKey,
  progress,
  action,
  variant = 'default',
  children,
}: PlanSectionProps) {
  const meta = PLAN_SECTION_META[sectionKey]
  const emergency = variant === 'emergency'
  const state = progress ? planSectionState(progress) : null

  return (
    <section
      id={planSectionAnchor(sectionKey)}
      className={`plan-section scroll-mt-6 ${
        emergency
          ? 'relative -mx-2 rounded-[10px] border-2 border-negative bg-card p-6'
          : 'border-b border-border py-6 last:border-b-0'
      }`}
    >
      {emergency && (
        // 종이 오른쪽 옆면 색인 탭 — 인쇄물 옆면에서 이 장만 색으로 찾힌다
        <span aria-hidden className="absolute -right-2 top-7 h-24 w-2 rounded-r-[4px] bg-negative" />
      )}
      <header
        className={`mb-4 flex flex-wrap items-center justify-between gap-3 pb-3 ${
          emergency ? 'border-b border-negative/30' : 'border-b border-border'
        }`}
      >
        <h2 className="m-0 flex items-start gap-3.5">
          {emergency ? (
            <span className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-negative text-sm font-bold tracking-[.02em] text-white">
              {meta.number}
            </span>
          ) : (
            <span className="shrink-0 text-[32px] font-light leading-none tracking-[.01em] text-brown opacity-50">
              {meta.number}
            </span>
          )}{' '}
          <span className="flex flex-col gap-[7px]">
            <span className="flex items-center gap-2">
              <span className={emergency ? 't-section-title text-negative' : 't-section-title'}>
                {meta.title}
              </span>
              {emergency && (
                // 색 없이도 읽히도록 텍스트 라벨을 함께 둔다(제목이 이미 '비상 대응'이라 접근성 이름에서는 제외)
                <span
                  aria-hidden
                  className="inline-flex rounded px-[7px] py-0.5 text-[11px] font-bold tracking-[.06em] text-white bg-negative"
                >
                  비상
                </span>
              )}
            </span>
            <span
              aria-hidden
              className={`h-[2.5px] w-[26px] rounded-sm ${emergency ? 'bg-negative' : 'bg-accent'}`}
            />
          </span>
        </h2>
        <div className="flex shrink-0 items-center gap-2.5">
          {progress && state && (
            <LevelBadge
              level={PLAN_SECTION_STATE_LEVEL[state]}
              label={`${PLAN_SECTION_STATE_LABELS[state]} ${progress.done}/${progress.total}`}
            />
          )}
          {action}
        </div>
      </header>
      {children}
    </section>
  )
}
