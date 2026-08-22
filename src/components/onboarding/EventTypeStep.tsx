// S0 ②단계 — 행사 유형(일반형/모객형) 카드 선택. updateProject({event_type}, pm 전용).
// 유형 라벨은 아직 어디에도 정의되어 있지 않아 이 스텝(및 EventBasicsCard·RegistrationPage)에서
// 자체 정의한다: 일반형 = 참관객 명단·체크인 중심 / 모객형 = 리드젠·RSVP 파이프라인 전체.
import { useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { Project } from '../../types/entities'
import type { EventType } from '../../types/enums'

const provider = getDataProvider()

const OPTIONS: { value: EventType; title: string; desc: string }[] = [
  { value: 'general', title: '일반형', desc: '참관객 명단·체크인 중심 — 등록 모듈이 경량 모드로 표시됩니다.' },
  { value: 'recruiting', title: '모객형', desc: '리드젠·RSVP 파이프라인 전체 — 등록 모듈이 전체 기능으로 표시됩니다.' },
]

export default function EventTypeStep({
  project,
  onPrev,
  onSaved,
}: {
  project: Project
  onPrev: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState<EventType>(project.event_type)
  const save = useMutation(async () => {
    await provider.updateProject(PROJECT_ID, { event_type: value })
    return true
  })

  const handleNext = async () => {
    const ok = await save.run()
    if (ok) onSaved()
  }

  return (
    <section>
      <h2 className="t-section-title mb-4">② 행사 유형</h2>
      <fieldset className="space-y-3">
        <legend className="sr-only">행사 유형 선택</legend>
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg p-4 text-sm transition-colors ${
              value === opt.value
                ? 'border-2 border-accent bg-accent-tint'
                : 'border border-border bg-card hover:border-border-strong'
            }`}
          >
            <input
              type="radio"
              name="event_type"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => setValue(opt.value)}
              className="mt-0.5"
            />
            <span>
              <span className="block font-semibold text-ink">{opt.title}</span>
              <span className="mt-0.5 block text-xs text-ink-sub">{opt.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <ErrorAlert message={save.error} />

      <div className="mt-4 flex justify-between">
        <button type="button" onClick={onPrev} className="btn btn-ghost">
          이전
        </button>
        <button type="button" onClick={handleNext} disabled={save.pending} className="btn btn-primary">
          다음
        </button>
      </div>
    </section>
  )
}
