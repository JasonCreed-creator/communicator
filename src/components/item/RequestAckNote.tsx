// Slack 의뢰 확인 한 줄(Phase 6.1 §9) — 디자인 보드 '다음 행동' 아래 · 항목 상세 '다음 단계' 설명 아래.
// 하루 넘게 확인이 없을 때만 accent-deep(주의) — 빨강은 지연 전용이라 쓰지 않는다.
import type { RequestAckLine } from '../../lib/requestAck'

export default function RequestAckNote({ line }: { line: RequestAckLine | null }) {
  if (!line) return null
  const tone = line.tone === 'wait' && (line.days ?? 0) >= 1 ? 'text-accent-deep' : line.tone === 'ok' ? 'text-positive' : 'text-ink-cap'
  return (
    <p data-testid="request-ack" data-tone={line.tone} className={`whitespace-nowrap text-xs ${tone}`}>
      {line.tone === 'ok' && <span aria-hidden>✓ </span>}
      {line.text}
    </p>
  )
}
