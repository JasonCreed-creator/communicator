// 발주처 화면 전용 상태 안내 카드 — 토큰 만료(410)·무효(404)·기타 오류를 레이아웃을 유지한 채 표시한다.
interface ClientMessageProps {
  tone: 'gone' | 'error'
  title: string
  body?: string
}

const TONE_CLASSES: Record<ClientMessageProps['tone'], string> = {
  gone: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
}

export default function ClientMessage({ tone, title, body }: ClientMessageProps) {
  return (
    <div className="px-4 py-12">
      <div className={`mx-auto max-w-md rounded-lg border p-6 text-center ${TONE_CLASSES[tone]}`}>
        <p className="text-base font-semibold">{title}</p>
        {body && <p className="mt-2 text-sm">{body}</p>}
      </div>
    </div>
  )
}
