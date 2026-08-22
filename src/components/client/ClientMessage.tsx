// 발주처 화면 전용 상태 안내 카드 — 토큰 만료(410)·무효(404)·기타 오류를 레이아웃을 유지한 채 표시한다.
// 디자인지시서 v1 §6: 중앙 정렬, 아이콘/제목은 text-ink, 설명은 text-ink-sub — 톤별 경고색 대신 차분한 중립 톤.
interface ClientMessageProps {
  tone: 'gone' | 'error'
  title: string
  body?: string
}

export default function ClientMessage({ title, body }: ClientMessageProps) {
  return (
    <div className="px-4 py-12">
      <div className="ui-card mx-auto max-w-md p-8 text-center">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="mx-auto size-8 text-ink"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
        <p className="mt-3 text-base font-semibold text-ink">{title}</p>
        {body && <p className="mt-2 text-sm text-ink-sub">{body}</p>}
      </div>
    </div>
  )
}
