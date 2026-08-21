// 승인/수정요청 처리 후 상단 성공 피드백 배너.
export default function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
    >
      {message}
    </div>
  )
}
