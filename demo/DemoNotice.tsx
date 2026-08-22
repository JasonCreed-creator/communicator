// 데모 안내 칩 — 아티팩트 빌드에만 들어간다(앱 번들에는 없음).
//
// 아티팩트 뷰어 샌드박스는 페이지가 시작한 파일 내려받기(a[download] + blob:/data:)를 차단하고,
// 인쇄 대화상자도 프레임 안에서는 신뢰할 수 없다. 해당 버튼들이 "눌러도 아무 일 없는" 상태로
// 보이지 않도록 이유를 한 줄로 알린다. Tailwind는 src/만 스캔하므로 토큰 변수를 인라인으로 쓴다.
import { useState, type CSSProperties } from 'react'

const WRAP: CSSProperties = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  zIndex: 2147483000,
  maxWidth: 'min(92vw, 380px)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  boxShadow: 'var(--shadow-1)',
  color: 'var(--ink-sub)',
  font: '500 12px/1.5 var(--font-sans, sans-serif)',
}

const CLOSE: CSSProperties = {
  flex: 'none',
  border: 0,
  background: 'transparent',
  color: 'var(--ink-cap)',
  cursor: 'pointer',
  font: 'inherit',
  lineHeight: 1,
  padding: 2,
}

export default function DemoNotice() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <aside style={WRAP} aria-label="데모 안내">
      <span>
        <strong style={{ color: 'var(--ink)' }}>데모</strong> · Mock 데이터로 동작하며 변경 사항은
        새로고침 시 사라집니다. 파일 내려받기·인쇄는 미리보기 프레임에서 동작하지 않습니다.
      </span>
      <button type="button" style={CLOSE} onClick={() => setOpen(false)} aria-label="안내 닫기">
        ✕
      </button>
    </aside>
  )
}
