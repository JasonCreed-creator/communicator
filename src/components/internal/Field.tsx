// 필드 껍데기 정본 — 패턴 기준 시트 §10-C(필드 상태 5종).
//
// 폼 필드를 쓰는 화면이 40곳이라 라벨·필수·힌트/오류를 화면마다 손으로 붙이면 §10이 유지되지 않는다.
// 규칙 두 개를 컴포넌트가 대신 지킨다:
//   ① **오류는 힌트 줄을 대체한다** — 두 줄로 쌓지 않는다(필드 높이가 폼마다 달라진다)
//   ② **필수는 라벨 뒤 `*` 하나** — 'required' 배지·빨간 라벨은 쓰지 않는다
//
// 컨트롤 자체는 슬롯이다. 숫자면 `.ui-input-num`, 셀렉트면 `.ui-select`, 오류면 `.ui-input-error`를
// 호출부가 컨트롤에 직접 붙인다 — 껍데기가 children의 클래스를 조작하지 않는다.
import type { ReactNode } from 'react'

export default function Field({
  id,
  label,
  required,
  hint,
  error,
  align,
  span,
  children,
}: {
  /** 라벨을 컨트롤에 묶는 id. 주면 `<label htmlFor>`, 없으면 라벨이 children을 감싼다. */
  id?: string
  label: string
  required?: boolean
  hint?: ReactNode
  /** 필드 단위 오류. 있으면 hint 대신 이 줄이 나온다. */
  error?: string | null
  /** 숫자·금액 필드는 'right' — 힌트/오류 줄을 값의 축에 맞춘다. */
  align?: 'left' | 'right'
  /** 그리드 span 유틸리티(예: 'sm:col-span-2'). */
  span?: string
  children: ReactNode
}) {
  const labelNode = (
    <span className="flex items-baseline gap-0.5">
      {id ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
      {required && (
        <span aria-hidden="true" className="text-accent-deep">
          *
        </span>
      )}
    </span>
  )

  // ① 오류가 있으면 힌트는 렌더하지 않는다 — 겹쳐 쌓지 않는다
  const support = error ? (
    <span className={`text-[11px] font-normal text-negative${align === 'right' ? ' text-right' : ''}`}>
      {error}
    </span>
  ) : hint != null && hint !== '' ? (
    <span className={`text-[11px] font-normal text-ink-cap${align === 'right' ? ' text-right' : ''}`}>
      {hint}
    </span>
  ) : null

  const body = (
    <>
      {labelNode}
      {children}
      {support}
    </>
  )

  const className = `flex flex-col gap-1 t-caption${span ? ` ${span}` : ''}`

  // id가 없으면 라벨 요소가 컨트롤을 감싸야 클릭이 컨트롤로 간다
  return id ? <div className={className}>{body}</div> : <label className={className}>{body}</label>
}
