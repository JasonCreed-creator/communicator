// P9 — xlsx → {headers, rows} 격자. src/modules/quote/import/xlsxReader.ts(동기 xlsx 리더, quote 모듈
// 전용이 아닌 우리 자체 모듈이라 재사용 허용)를 그대로 얹는다. exceljs는 여기서 import하지 않는다.
import { readXlsxSheets, type CellValue } from '../../modules/quote/import/xlsxReader'

function cellToText(v: CellValue): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

export interface ParsedTable {
  headers: string[]
  rows: string[][]
}

/** 첫 시트, 1행=헤더, 이후=데이터, 빈 행 제외(모든 셀이 빈 문자열인 행). */
export function xlsxToTable(data: ArrayBuffer): ParsedTable {
  const sheets = readXlsxSheets(data)
  const sheet = sheets[0]
  const grid = sheet.rows.map((row) => row.map(cellToText)).filter((row) => row.some((c) => c !== ''))
  if (grid.length === 0) return { headers: [], rows: [] }
  const [headers, ...rows] = grid
  return { headers, rows }
}
