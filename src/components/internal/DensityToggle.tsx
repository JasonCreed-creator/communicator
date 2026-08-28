/** 밀집 모드 토글 — 패턴 기준 시트 §05 규칙 02(행 36) + **조건 1**.
 *  내부 관리 화면(정산·WBS·등록 명단)에만 노출한다 —
 *  현장 체크인 · 발주처(/c) · 파트너 포털(/p)에는 붙이지 않는다(터치 타깃 44 미만 불가). */
export default function DensityToggle({
  dense,
  onChange,
}: {
  dense: boolean
  onChange: (dense: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!dense)}
      aria-pressed={dense}
      className="btn btn-ghost btn-sm print-hidden"
      title={dense ? '기본 밀도(행 44)로 전환' : '밀집 모드(행 36)로 전환'}
    >
      {dense ? '기본 밀도' : '밀집 모드'}
    </button>
  )
}
