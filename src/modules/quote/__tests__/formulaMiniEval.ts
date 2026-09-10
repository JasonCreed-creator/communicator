// 테스트 전용 — 한글금액 수식이 쓰는 스프레드시트 함수 부분집합(IF·MID·TEXT·VALUE·ROUND·ABS·&·=·>·+)만 해석하는
// 초소형 평가기. Excel·Sheets가 같은 규칙으로 계산한다는 전제(연산 우선순위: 산술 > & > 비교, IF는 지연 평가)를
// 코드로 고정해 CI에서 수식 논리를 검증한다. 실제 엔진 대조는 koreanAmountFormula.libreoffice.test.ts가 담당.

type Val = string | number | boolean

class Parser {
  private i = 0
  constructor(
    private readonly src: string,
    private readonly cells: Record<string, Val>,
  ) {}

  parse(): Val {
    const v = this.comparison()
    this.skipWs()
    if (this.i !== this.src.length) throw new Error(`수식 잔여 토큰: ${this.src.slice(this.i, this.i + 20)}`)
    return v
  }

  private skipWs(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++
  }

  private peek(): string {
    this.skipWs()
    return this.src[this.i] ?? ''
  }

  private comparison(): Val {
    let left = this.concat()
    for (;;) {
      const c = this.peek()
      if (c === '=') {
        this.i++
        const right = this.concat()
        left = left === right // Excel 규칙: 타입이 다르면 같지 않다("1"≠1)
      } else if (c === '>') {
        this.i++
        const right = this.concat()
        left = Number(left) > Number(right)
      } else return left
    }
  }

  private concat(): Val {
    let left = this.additive()
    while (this.peek() === '&') {
      this.i++
      const right = this.additive()
      left = `${toText(left)}${toText(right)}`
    }
    return left
  }

  private additive(): Val {
    let left = this.primary()
    for (;;) {
      const c = this.peek()
      if (c === '+' || c === '-') {
        this.i++
        const right = this.primary()
        left = c === '+' ? Number(left) + Number(right) : Number(left) - Number(right)
      } else return left
    }
  }

  private primary(): Val {
    const c = this.peek()
    if (c === '"') {
      this.i++
      let s = ''
      while (this.src[this.i] !== '"') {
        if (this.i >= this.src.length) throw new Error('닫히지 않은 문자열')
        s += this.src[this.i++]
      }
      this.i++
      return s
    }
    if (c === '(') {
      this.i++
      const v = this.comparison()
      if (this.peek() !== ')') throw new Error('닫는 괄호 없음')
      this.i++
      return v
    }
    const m = /^-?\d+(\.\d+)?/.exec(this.src.slice(this.i))
    if (m) {
      this.i += m[0].length
      return Number(m[0])
    }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(this.src.slice(this.i))
    if (!id) throw new Error(`해석 불가: ${this.src.slice(this.i, this.i + 20)}`)
    this.i += id[0].length
    const name = id[0].toUpperCase()
    if (this.peek() === '(') {
      this.i++
      const args: (() => Val)[] = []
      if (this.peek() !== ')') {
        for (;;) {
          const start = this.i
          // IF의 지연 평가를 위해 인자를 썽크로 보관 — 위치만 기록하고 평가는 함수가 결정한다
          this.skipArgument()
          const text = this.src.slice(start, this.i)
          args.push(() => new Parser(text, this.cells).parse())
          if (this.peek() === ',') {
            this.i++
            continue
          }
          break
        }
      }
      if (this.peek() !== ')') throw new Error(`함수 ${name} 닫는 괄호 없음`)
      this.i++
      return callFn(name, args)
    }
    if (!(name in this.cells)) throw new Error(`알 수 없는 참조: ${id[0]}`)
    return this.cells[name]
  }

  /** 현재 위치에서 인자 하나의 끝(같은 깊이의 ',' 또는 ')')까지 전진 — 문자열 안의 괄호·쉼표는 무시 */
  private skipArgument(): void {
    let depth = 0
    let inStr = false
    while (this.i < this.src.length) {
      const ch = this.src[this.i]
      if (inStr) {
        if (ch === '"') inStr = false
      } else if (ch === '"') inStr = true
      else if (ch === '(') depth++
      else if (ch === ')') {
        if (depth === 0) return
        depth--
      } else if (ch === ',' && depth === 0) return
      this.i++
    }
  }
}

function toText(v: Val): string {
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

function callFn(name: string, args: (() => Val)[]): Val {
  switch (name) {
    case 'IF': {
      const cond = args[0]()
      return cond === true || (typeof cond === 'number' && cond !== 0) ? args[1]() : args[2]()
    }
    case 'MID': {
      const text = toText(args[0]())
      const start = Number(args[1]())
      const len = Number(args[2]())
      if (start < 1 || len < 0) throw new Error('#VALUE! (MID)')
      return text.substring(start - 1, start - 1 + len)
    }
    case 'TEXT': {
      const n = Number(args[0]())
      const fmt = toText(args[1]())
      if (/^0+$/.test(fmt)) {
        const s = String(Math.abs(Math.round(n))).padStart(fmt.length, '0')
        return n < 0 ? `-${s}` : s
      }
      if (fmt === '#,##0') return Math.round(n).toLocaleString('en-US')
      throw new Error(`지원하지 않는 TEXT 서식: ${fmt}`)
    }
    case 'VALUE':
      return Number(toText(args[0]()))
    case 'ROUND': {
      const n = Number(args[0]())
      const d = Number(args[1]())
      const f = 10 ** d
      return Math.round(n * f) / f
    }
    case 'ABS':
      return Math.abs(Number(args[0]()))
    default:
      throw new Error(`지원하지 않는 함수: ${name}`)
  }
}

/** 수식(등호 없음)을 셀 값 사전으로 평가한다 */
export function evalFormula(formula: string, cells: Record<string, Val>): Val {
  return new Parser(formula, cells).parse()
}

/** 수식이 호출하는 함수 이름 집합 */
export function functionNames(formula: string): string[] {
  const names = new Set<string>()
  for (const m of formula.matchAll(/\b([A-Z][A-Z0-9_.]*)\(/g)) names.add(m[1])
  return [...names].sort()
}
