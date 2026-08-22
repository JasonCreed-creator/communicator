import type { ReactNode } from 'react'

/**
 * 초경량 마크다운 렌더 — deliverables.content(§4)의 `### 헤더`·`- 불릿`만 처리하고
 * 그 외 줄은 문단으로 렌더한다. 외부 라이브러리·dangerouslySetInnerHTML 미사용 —
 * 원문은 전부 React 텍스트 노드로만 삽입되어 XSS 위험이 없다 (S9 스펙 §3).
 */
export function renderLiteMarkdown(source: string): ReactNode {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []
  let bulletBuffer: string[] = []
  let key = 0

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return
    const items = bulletBuffer
    blocks.push(
      <ul key={`ul-${key++}`} className="list-disc space-y-0.5 pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>,
    )
    bulletBuffer = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushBullets()
      continue
    }
    if (line.startsWith('### ')) {
      flushBullets()
      blocks.push(
        <h4 key={`h-${key++}`} className="mt-2 text-sm font-semibold text-ink first:mt-0">
          {line.slice(4)}
        </h4>,
      )
      continue
    }
    if (line.startsWith('- ')) {
      bulletBuffer.push(line.slice(2))
      continue
    }
    flushBullets()
    blocks.push(
      <p key={`p-${key++}`} className="text-sm text-ink-sub">
        {line}
      </p>,
    )
  }
  flushBullets()

  return <div className="space-y-1">{blocks}</div>
}
