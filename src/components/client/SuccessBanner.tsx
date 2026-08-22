// 승인/수정요청 처리 후 상단 성공 피드백 배너.
export default function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-md border border-positive/30 bg-positive-tint px-4 py-3 text-sm font-medium text-positive"
    >
      {message}
    </div>
  )
}
