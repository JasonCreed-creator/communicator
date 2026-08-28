// S0 ③단계의 유형 선택 카드 — 일반형/모객형. updateProject({event_type}, pm 전용).
// v1.5: 헤더·이전/다음 내비게이션은 OnboardingPage(③ 유형·확인)가 담당하고, 이 컴포넌트는
// 라디오 카드만 렌더한다 — 선택 즉시 저장(auto-save)해 부모 스텝의 요약·완료 버튼과 한 화면에 공존한다.
// 유형 라벨은 아직 어디에도 정의되어 있지 않아 이 컴포넌트(및 RegistrationPage)에서 자체 정의한다:
// 일반형 = 참관객 명단·체크인 중심 / 모객형 = 리드젠·RSVP 파이프라인 전체.
import { useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { Project, UUID } from '../../types/entities'
import type { EventType } from '../../types/enums'

const provider = getDataProvider()

const OPTIONS: { value: EventType; title: string; desc: string }[] = [
  { value: 'general', title: '일반형', desc: '참관객 명단·체크인 중심 — 등록 모듈이 경량 모드로 표시됩니다.' },
  { value: 'recruiting', title: '모객형', desc: '리드젠·RSVP 파이프라인 전체 — 등록 모듈이 전체 기능으로 표시됩니다.' },
]

export default function EventTypeStep({
  projectId,
  project,
  onChanged,
}: {
  projectId: UUID
  project: Project
  onChanged?: () => void
}) {
  const [value, setValue] = useState<EventType>(project.event_type)
  const save = useMutation((next: EventType) => provider.updateProject(projectId, { event_type: next }))

  const handleSelect = async (next: EventType) => {
    const prev = value
    setValue(next)
    const result = await save.run(next)
    if (result) {
      onChanged?.()
    } else {
      setValue(prev)
    }
  }

  return (
    <div>
      {/* 시안 — 2열 유형 카드. 라디오는 유지하고(접근성·기존 계약) 선택 카드에 '선택' 배지를 얹는다 */}
      <fieldset className="grid gap-2.5 sm:grid-cols-2">
        <legend className="sr-only">행사 유형 선택</legend>
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg p-3.5 text-sm transition-colors ${
              value === opt.value
                ? 'border border-accent bg-accent-tint'
                : 'border border-border bg-card hover:border-border-strong'
            }`}
          >
            <input
              type="radio"
              name="event_type"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => handleSelect(opt.value)}
              disabled={save.pending}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{opt.title}</span>
                {value === opt.value && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    선택
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-sub">{opt.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <ErrorAlert message={save.error} />
    </div>
  )
}
