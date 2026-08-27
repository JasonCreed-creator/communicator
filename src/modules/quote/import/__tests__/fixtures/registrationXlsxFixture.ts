// 등록(S4) xlsx 임포트(3.15.1 P9) DoD 전용 헬퍼 — CSV/xlsx 등가 테스트가 쓸 최소 xlsx를
// exceljs로 그 자리에서 만든다. exceljs는 src/modules/quote 밖 import 금지(CLAUDE.md §2)라
// 이 파일을 quote 모듈 안(__tests__/fixtures/)에 두고, 등록 테스트는 이 파일이 만든
// ArrayBuffer만 가져다 쓴다(exceljs 자체는 절대 import하지 않는다).
// syntheticQuotes.ts의 toArrayBuffer 패턴을 그대로 따른다.
import ExcelJS from 'exceljs'

async function toArrayBuffer(wb: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buf = await wb.xlsx.writeBuffer()
  if (buf instanceof ArrayBuffer) return buf
  const view = new Uint8Array(buf as unknown as ArrayBufferLike)
  const out = new ArrayBuffer(view.byteLength)
  new Uint8Array(out).set(view)
  return out
}

/** headers(1행) + rows(2행~)로 단일 시트 xlsx를 만든다 — registrationXlsx.ts(xlsxToTable)가
 *  그대로 읽는 형태(첫 시트, 1행=헤더, 이후=데이터). 빈 행 테스트용으로 rows에 [] 를 섞어도 된다. */
export async function buildRegistrationXlsx(headers: string[], rows: (string | number)[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(headers)
  for (const r of rows) {
    if (r.length === 0) {
      ws.addRow([]) // 빈 행 제외 테스트용
      continue
    }
    ws.addRow(r)
  }
  return toArrayBuffer(wb)
}
