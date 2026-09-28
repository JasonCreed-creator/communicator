// Google Sheets API 호출 — 마스터 시트 내보내기(설계서 v2.21 §27.5 · Phase 6.11 PR-G).
// Drive가 만든 빈 스프레드시트(네이티브 파일 — 행사 폴더 04_WBS·운영계획 안)를 ① 탭 구조·최소 서식(batchUpdate) ② 값(values:batchUpdate)
// 두 요청으로 채운다. xlsx는 만들지 않는다(§2 xlsx 라이브러리 규칙 무접촉). 토큰 = 저장소 Drive OAuth(전체 drive scope — Sheets API 문서가
// 허용 scope로 적는다 · **가정**: 실키 1회 클릭이 검증). 구글 오류는 조치 문구로 바꾼다 — Sheets API 꺼짐 → GCP 콘솔 링크 ·
// scope 부족·인증 만료 → Drive 재연결 · 요청 몰림 → 잠시 후.
import { DriveError } from '../drive/errors.js'
import { tabColumnCount } from '../../../src/lib/masterSheet/build.js'
import type { MasterSheet, MasterSheetTab } from '../../../src/lib/masterSheet/types'

export const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
export const SHEETS_CONSOLE_URL = 'https://console.cloud.google.com/apis/library/sheets.googleapis.com'
/** 머리 줄 바탕(웜 페이퍼 — 시트에서 머리 줄이 구분되게 · 색 토큰과 무관한 서식 최소값) */
const HEADER_BG = { red: 0.96, green: 0.94, blue: 0.9 }

interface GoogleErrorBody {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: { reason?: string; metadata?: Record<string, string> }[]
    errors?: { reason?: string }[]
  }
}

/** 구글 응답 → 조치 문구. 어떤 경우에도 토큰·요청 본문을 문구에 싣지 않는다 */
export async function sheetsErrorFrom(res: Response, what: string): Promise<DriveError> {
  let body: GoogleErrorBody = {}
  try {
    body = (await res.clone().json()) as GoogleErrorBody
  } catch {
    body = {}
  }
  const err = body.error ?? {}
  const message = err.message ?? ''
  const reasons = [...(err.details ?? []).map((d) => d.reason ?? ''), ...(err.errors ?? []).map((e) => e.reason ?? '')]
  const activation = (err.details ?? []).map((d) => d.metadata?.activationUrl).find(Boolean) ?? message.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\S+/)?.[0] ?? null
  const disabled = reasons.includes('SERVICE_DISABLED') || reasons.includes('accessNotConfigured') || /has not been used|is disabled|not enabled/i.test(message)
  if (res.status === 403 && disabled) {
    return new DriveError(
      503,
      'validation',
      `Google Sheets API가 이 구글 프로젝트에서 꺼져 있습니다 — Drive OAuth 클라이언트와 같은 GCP 프로젝트에서 Sheets API를 켜고 몇 분 뒤 다시 시도하세요: ${activation ?? SHEETS_CONSOLE_URL}`,
    )
  }
  const scope = reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || /insufficient authentication scopes|insufficientPermissions/i.test(message)
  if (res.status === 403 && scope) {
    return new DriveError(
      503,
      'validation',
      'Drive 연결 계정의 권한 범위(scope)에 스프레드시트 쓰기가 없습니다 — 관리자가 행사 설정 ③에서 Drive 연결 해제 → 다시 연결(동의 화면에서 전부 허용)한 뒤 다시 시도하세요.',
    )
  }
  if (res.status === 401) {
    return new DriveError(503, 'validation', 'Drive 인증이 만료됐습니다 — 관리자가 행사 설정 ③에서 Drive를 다시 연결해야 합니다.')
  }
  if (res.status === 429 || reasons.includes('RATE_LIMIT_EXCEEDED') || reasons.includes('rateLimitExceeded')) {
    return new DriveError(503, 'validation', '구글 시트 요청이 몰렸습니다 — 잠시 후 다시 시도하세요.')
  }
  if (res.status === 403) return new DriveError(403, 'forbidden', `${what} — 연결된 Drive 계정에 이 스프레드시트를 쓸 권한이 없습니다.`)
  if (res.status === 404) return new DriveError(404, 'not_found', `${what} — 스프레드시트를 찾을 수 없습니다.`)
  return new DriveError(502, 'validation', `${what} — Google Sheets 응답 오류(${res.status})${message ? `: ${message.slice(0, 200)}` : ''}.`)
}

function gridOf(tab: MasterSheetTab) {
  const cols = tabColumnCount(tab)
  const rows = tab.rows.length + (tab.columns.length ? 1 : 0)
  return {
    rowCount: Math.max(rows + 50, 100),
    columnCount: Math.max(cols + 2, 26),
    frozenRowCount: tab.frozen_rows,
    frozenColumnCount: tab.frozen_cols,
  }
}

/** 열 폭 요청 — 같은 폭이 이어지면 한 범위로 묶는다(요청 수 절약) */
function widthRequests(sheetId: number, widths: number[]): unknown[] {
  const out: unknown[] = []
  let i = 0
  while (i < widths.length) {
    let j = i
    while (j + 1 < widths.length && widths[j + 1] === widths[i]) j++
    out.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: j + 1 },
        properties: { pixelSize: widths[i] },
        fields: 'pixelSize',
      },
    })
    i = j + 1
  }
  return out
}

function boldRequest(sheetId: number, rowIndex: number, cols: number, background: boolean): unknown {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: cols },
      cell: { userEnteredFormat: { textFormat: { bold: true }, ...(background ? { backgroundColor: HEADER_BG } : {}) } },
      fields: background ? 'userEnteredFormat(textFormat,backgroundColor)' : 'userEnteredFormat(textFormat)',
    },
  }
}

/** 탭 구조·서식 요청 목록(순수 — 테스트가 모양을 본다) */
export function structureRequests(sheet: MasterSheet, firstSheetId: number): { requests: unknown[]; sheetIds: number[] } {
  const requests: unknown[] = []
  const sheetIds: number[] = []
  sheet.tabs.forEach((tab, i) => {
    const sheetId = i === 0 ? firstSheetId : firstSheetId + 1 + i
    sheetIds.push(sheetId)
    const properties = { sheetId, title: tab.title, index: i, gridProperties: gridOf(tab) }
    if (i === 0) {
      requests.push({ updateSheetProperties: { properties, fields: 'title,index,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount)' } })
    } else {
      requests.push({ addSheet: { properties } })
    }
  })
  sheet.tabs.forEach((tab, i) => {
    const sheetId = sheetIds[i]
    const cols = tabColumnCount(tab)
    if (tab.columns.length) requests.push(boldRequest(sheetId, 0, cols, true))
    const offset = tab.columns.length ? 1 : 0
    for (const r of tab.bold_rows) requests.push(boldRequest(sheetId, r + offset, cols, false))
    requests.push(...widthRequests(sheetId, tab.widths.slice(0, cols)))
  })
  return { requests, sheetIds }
}

function rangeOf(tab: MasterSheetTab): string {
  return `'${tab.title.replace(/'/g, "''")}'!A1`
}

/** 값 요청(순수) — RAW 입력 · 빈 칸은 '' · 줄이 비면 [''] */
export function valuesRequest(sheet: MasterSheet): unknown {
  return {
    valueInputOption: 'RAW',
    data: sheet.tabs.map((tab) => ({
      range: rangeOf(tab),
      majorDimension: 'ROWS',
      values: [
        ...(tab.columns.length ? [tab.columns] : []),
        ...tab.rows.map((r) => (r.length ? r.map((c) => (c === null || c === undefined ? '' : c)) : [''])),
      ],
    })),
  }
}

async function sheetsCall(fetchImpl: typeof fetch, token: string, url: string, init: RequestInit, what: string): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  headers.set('authorization', `Bearer ${token}`)
  const res = await fetchImpl(url, { ...init, headers })
  if (!res.ok) throw await sheetsErrorFrom(res, what)
  return res
}

/** Drive가 만든 빈 스프레드시트를 탭 구조·서식·값으로 채운다 — 첫 탭은 기본 시트를 이름만 바꿔 쓴다 */
export async function fillSpreadsheet(fetchImpl: typeof fetch, token: string, spreadsheetId: string, sheet: MasterSheet): Promise<{ sheet_ids: number[] }> {
  const id = encodeURIComponent(spreadsheetId)
  const got = await sheetsCall(fetchImpl, token, `${SHEETS_API}/${id}?fields=sheets.properties.sheetId`, { method: 'GET' }, '시트 읽기')
  const meta = (await got.json().catch(() => ({}))) as { sheets?: { properties?: { sheetId?: number } }[] }
  const firstSheetId = meta.sheets?.[0]?.properties?.sheetId ?? 0
  const { requests, sheetIds } = structureRequests(sheet, firstSheetId)
  await sheetsCall(
    fetchImpl,
    token,
    `${SHEETS_API}/${id}:batchUpdate`,
    { method: 'POST', headers: { 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ requests, includeSpreadsheetInResponse: false }) },
    '탭 만들기',
  )
  await sheetsCall(
    fetchImpl,
    token,
    `${SHEETS_API}/${id}/values:batchUpdate`,
    { method: 'POST', headers: { 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify(valuesRequest(sheet)) },
    '값 쓰기',
  )
  return { sheet_ids: sheetIds }
}
