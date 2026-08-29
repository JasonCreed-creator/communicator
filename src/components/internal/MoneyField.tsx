// 금액 전용 필드 — 패턴 기준 시트 §10-A(금액 행) · 폼 정본 폴리싱 결함 2.
//
// 금액은 오타 한 자리가 매출 계획을 열 배로 틀린다. 그래서 일반 숫자 필드와 갈라 세운다:
//   ① 표시는 천단위 구분 + 우측정렬(`.ui-input-num`), **편집 중에는 raw** — 쉼표가 커서를 튀게 하지 않는다
//   ② 힌트 자리에 한글 축약 에코(`12000000` → `1,200만원`) — 자릿수를 사람 눈으로 검산하는 줄이다
//   ③ 저장 값은 `number | null`. 빈 문자열은 `null`(=미정)이고 **반올림·추측 채움을 하지 않는다**
//
// ★ 위치가 `components/internal/`인 이유: `components/partner/**`는 dod23·dod32 금액 비노출 grep 가드가
//   "금액 식별자 0건"으로 보는 경로다. 내부 화면 전용 프리미티브를 그 밑에 두면 가드 의미가 흐려진다.
import { useState, type ReactNode } from 'react'
import Field from './Field'
import { formatKrw, krwEcho, parseKrw } from '../../lib/numberFormat'

export default function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  required,
  disabled,
  span,
  ariaLabel,
  placeholder,
  inputClassName,
  echo,
}: {
  id?: string
  label: string
  /** 저장 값. `null`은 미정 — 0과 구분한다. */
  value: number | null
  onChange: (next: number | null) => void
  /** 값이 비었을 때 보여줄 안내. 값이 있으면 한글 에코가 이 자리를 쓴다. */
  hint?: string
  /**
   * 에코 줄 재정의. 생략하면 `krwEcho`(한글 축약), **`null`이면 에코를 끄고 `hint`를 그대로 둔다.**
   *
   * 끄는 자리는 지금 견적 모듈의 영문 모드 하나다 — §10은 한글 축약만 규정하고 영문 축약형을
   * 정하지 않았다. 정하지 않은 표기를 지어내지 않고(추측 구현 금지) 그 줄을 비운다.
   */
  echo?: ReactNode | null
  error?: string | null
  required?: boolean
  disabled?: boolean
  span?: string
  ariaLabel?: string
  placeholder?: string
  inputClassName?: string
}) {
  // 편집 중에만 draft가 산다 — blur하면 null로 돌아가 저장 값에서 다시 포맷한다
  const [draft, setDraft] = useState<string | null>(null)

  const display = draft ?? formatKrw(value)
  // 값이 있으면 에코가 힌트 줄을 쓴다(오류가 있으면 Field가 둘 다 밀어낸다)
  const support =
    echo === null || value == null
      ? hint
      : (echo ?? <span className="text-accent-deep">{krwEcho(value)}</span>)

  return (
    <Field id={id} label={label} required={required} hint={support} error={error} align="right" span={span}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-invalid={error ? true : undefined}
        onFocus={() => setDraft(value == null ? '' : String(value))}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(parseKrw(e.target.value))
        }}
        onBlur={() => setDraft(null)}
        className={`ui-input ui-input-num${error ? ' ui-input-error' : ''}${
          inputClassName ? ` ${inputClassName}` : ''
        }`}
      />
    </Field>
  )
}
