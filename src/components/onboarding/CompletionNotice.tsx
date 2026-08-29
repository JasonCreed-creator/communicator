// S0 ③ '완료하면 이렇게 됩니다' — steel 배너 (시안 '온보딩 · 파트너 포털.dc.html').
//
// 왜 배너인가: 온보딩 완료는 WBS 수십 건 전개 + R&R 카드 시드라는 **되돌리기 비용이 큰 동작**이다.
// 본문 캡션으로 흘려두면 누른 뒤에야 결과를 알게 된다 — 누르기 전에 결과를 밝힌다(빈 상태 ④ steel 규격 재사용).
//
// 건수는 하드코딩하지 않고 픽스처 템플릿에서 파생한다(모객형 37 / 일반형 28이 바뀌면 문구도 따라간다).
// 주최형(kind='host')은 파트너 수에 따라 전개량이 달라져 건수를 단정할 수 없으므로 건수를 말하지 않는다.
import { ROLE_CHARTER_TEMPLATES, wbsTemplateFor } from '../../fixtures/wbsTemplates'
import { EVENT_TYPE_LABELS, formatDate } from '../../lib/labels'
import type { Project } from '../../types/entities'

export default function CompletionNotice({ project }: { project: Project }) {
  const isHost = project.kind === 'host'
  const typeLabel = EVENT_TYPE_LABELS[project.event_type]
  const taskCount = wbsTemplateFor(project.event_type).length
  const charterCount = ROLE_CHARTER_TEMPLATES[project.event_type].length
  const dateLabel = project.event_date ? `행사일(${formatDate(project.event_date)})` : '행사일'

  return (
    <div
      data-testid="onboarding-completion-notice"
      className="rounded-lg border border-steel/20 bg-steel-tint px-3.5 py-3 text-[13px] leading-relaxed text-steel"
    >
      <p>
        <strong className="font-semibold">완료하면 이렇게 됩니다</strong> —{' '}
        {isHost ? (
          <>
            주최형 파트너 제출 일정이 파트너별로 {dateLabel} 기준 자동 전개되고, 역할별 R&amp;R 카드가 함께
            생성됩니다.
          </>
        ) : (
          <>
            {typeLabel} WBS {taskCount}건이 {dateLabel} 기준으로 자동 전개되고, 역할별 R&amp;R 카드{' '}
            {charterCount}장이 함께 생성됩니다.
          </>
        )}{' '}
        되돌릴 때는 일정 화면의 '템플릿 재전개'를 씁니다.
      </p>
    </div>
  )
}
