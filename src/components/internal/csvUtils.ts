// 등록 모듈(S4) CSV 임포트/내보내기용 파서 — 외부 의존성 없이 쉼표 구분 + 큰따옴표 필드를 지원한다.
// (설계서 §11: 헤더 자동 매핑 UI 대상)

/** 큰따옴표 필드(",", 내부 이스케이프 "" 포함)를 지원하는 최소 CSV 파서 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const push = () => {
    row.push(field)
    field = ''
  }
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      push()
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      push()
      rows.push(row)
      row = []
      i++
      continue
    }
    field += ch
    i++
  }
  if (field.length > 0 || row.length > 0) {
    push()
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** 헤더 + 행 배열 → CSV 문자열 (CRLF, 큰따옴표 이스케이프) */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n')
}

/** CSV 문자열을 파일로 다운로드 (Blob + a[download]) */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
