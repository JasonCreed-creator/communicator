// S0 ③단계 — v2.6 §25 **format 4카드**(컨퍼런스 일반형·컨퍼런스 모객형·DMS·전시회) + PSA 체크박스
// + 세부 토글(시드된 kind·event_type 노출·수정 가능).
//
// **카드는 시드이지 잠금이 아니다**(§25.1). 카드를 고르면 kind·event_type·audience_model이 프리셋 값으로
// 한 번 세팅되고, 그 아래 세부 토글로 각각 독립 수정할 수 있다. format 자체는 온보딩 시드·견적 모델·
// 복합 게이트 구성요소 세 가지에만 쓰이고, 상시 모듈 표시 게이트는 기존 축(kind·event_type·psa_enabled)이 유지한다.
//
// 온보딩 완료 후(=이미 WBS가 전개된 뒤) format을 바꾸면 재전개가 필요하므로 확인을 받는다(§25.1).
import { useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import Field from '../internal/Field'
import { LevelBadge } from '../internal/StatusBadge'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import {
  FORMAT_PRESETS,
  PRESET_CARD_ORDER,
  presetCardOf,
  type PresetCardKey,
} from '../../fixtures/formatPresets'
import type { Project, UUID } from '../../types/entities'
import type { EventType, ProjectKind } from '../../types/enums'
import { EVENT_TYPE_LABELS, PROJECT_KIND_LABELS } from '../../lib/labels'

const provider = getDataProvider()

const EVENT_TYPE_OPTIONS: EventType[] = ['general', 'recruiting']
const KIND_OPTIONS: ProjectKind[] = ['agency', 'host']

export default function FormatStep({
  projectId,
  project,
  onChanged,
}: {
  projectId: UUID
  project: Project
  onChanged?: () => void
}) {
  const [card, setCard] = useState<PresetCardKey>(presetCardOf(project.format, project.event_type))
  const save = useMutation((patch: Parameters<typeof provider.updateProject>[1]) =>
    provider.updateProject(projectId, patch),
  )

  // 온보딩이 끝난 행사는 WBS가 이미 전개돼 있다 — format 전환은 재전개를 부르므로 확인을 받는다
  const expanded = project.onboarded_at !== null

  const apply = async (patch: Parameters<typeof provider.updateProject>[1]) => {
    const result = await save.run(patch)
    if (result) onChanged?.()
    return result
  }

  const handleCard = async (next: PresetCardKey) => {
    if (next === card) return
    const preset = FORMAT_PRESETS[next]
    if (expanded && preset.format !== project.format) {
      const ok = window.confirm(
        `행사 유형을 ‘${preset.cardLabel}’로 바꾸면 WBS를 다시 전개해야 합니다.\n` +
          '이미 진행한 태스크의 상태·완료일은 보존됩니다. 계속할까요?',
      )
      if (!ok) return
    }
    const prev = card
    setCard(next)
    const result = await apply({
      format: preset.format,
      kind: preset.seed.kind,
      event_type: preset.seed.event_type,
      audience_model: preset.seed.audience_model,
      psa_enabled: preset.seed.psa_enabled,
    })
    if (!result) setCard(prev)
  }

  const preset = FORMAT_PRESETS[card]

  return (
    <div className="space-y-4">
      <fieldset className="grid gap-2.5 sm:grid-cols-2">
        <legend className="sr-only">행사 유형 선택</legend>
        {PRESET_CARD_ORDER.map((key) => {
          const p = FORMAT_PRESETS[key]
          const selected = card === key
          return (
            <label
              key={key}
              className={`ui-check-row rounded-lg p-3.5 text-sm transition-colors ${
                selected
                  ? 'border border-accent bg-accent-tint'
                  : 'border border-border bg-card hover:border-border-strong'
              }`}
            >
              <input
                type="radio"
                name="format_card"
                value={key}
                checked={selected}
                onChange={() => handleCard(key)}
                disabled={save.pending}
                className="ui-check"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{p.cardLabel}</span>
                  {/* 선택 표시는 보더·틴트 두 겹까지다(§10-B) — 배지 자리는 정보 전용으로 남긴다.
                      실측 근거가 1건이거나 미검증인 프리셋은 화면에서도 '가정'으로 밝힌다(§25.3) */}
                  {p.assumed && <LevelBadge level="neutral" label="가정" className="shrink-0" />}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-sub">{p.cardBlurb}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {/* PSA 옵션 — 모듈 자체는 3.18c 미착수라 값만 기록한다는 사실을 숨기지 않는다 */}
      <label className="ui-check-row rounded-lg border border-border bg-card p-3.5 text-sm">
        <input
          type="checkbox"
          checked={project.psa_enabled}
          onChange={(e) => apply({ psa_enabled: e.target.checked })}
          disabled={save.pending}
          className="ui-check"
        />
        <span className="min-w-0">
          <span className="font-semibold text-ink">비즈매칭(PSA) 사용</span>
          <span className="mt-1 block text-xs leading-relaxed text-ink-sub">
            참관객이 파트너사에 사전 상담을 신청하고 현장에서 미팅합니다. 지금은 설정만 기록되며 매칭
            보드는 다음 단계에서 열립니다.
          </span>
        </span>
      </label>

      {/* 세부 토글 — 카드가 시드한 값을 그대로 보여주고 각각 독립 수정할 수 있게 한다(§25.1) */}
      <div className="rounded-lg border border-border bg-card p-3.5">
        <p className="text-sm font-semibold text-ink">세부 설정</p>
        {/* 안내는 각 필드의 힌트 줄이 대신한다 — 같은 말을 카드 상단에서 한 번 더 하지 않는다 */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="fmt-kind" label="행사 성격" hint="카드가 시드한 값">
            <select
              id="fmt-kind"
              value={project.kind}
              onChange={(e) => apply({ kind: e.target.value as ProjectKind })}
              disabled={save.pending}
              className="ui-input ui-select w-full"
              aria-label="행사 성격"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {PROJECT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="fmt-event-type" label="모객 유형" hint="바꿔도 카드 선택은 유지">
            <select
              id="fmt-event-type"
              value={project.event_type}
              onChange={(e) => apply({ event_type: e.target.value as EventType })}
              disabled={save.pending}
              className="ui-input ui-select w-full"
              aria-label="모객 유형"
            >
              {EVENT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* 프리셋 예고 — 완료 시 무엇이 전개되는지 미리 밝힌다(되돌리기 비용이 큰 동작) */}
      {preset.opsNotes.length > 0 && (
        <div className="rounded-lg border border-steel/20 bg-steel-tint px-3.5 py-3 text-xs leading-relaxed text-steel">
          <p className="font-semibold">{preset.cardLabel} 운영 프리셋이 함께 시드됩니다</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {preset.opsNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <ErrorAlert message={save.error} />
    </div>
  )
}
