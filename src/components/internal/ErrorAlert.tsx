/** 뮤테이션 실패 시 ProviderError.message를 그대로 보여주는 인라인 경고 — 절대 침묵하지 않는다 */
export default function ErrorAlert({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  )
}
