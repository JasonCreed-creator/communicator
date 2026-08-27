// xlsx(=ZIP + SpreadsheetML) → 시트 격자. **동기**·의존 0 (inflate.ts만 사용).
//
// 파서 계약이 동기라 exceljs의 비동기 로더를 쓸 수 없다(inflate.ts 머리말 참조).
// 여기서 다루는 범위는 "견적서 읽기"에 필요한 최소치다 — 시트 이름·셀 값(공유 문자열·인라인
// 문자열·수식 캐시값·숫자·불리언)까지만 읽고, 서식·병합·차트는 읽지 않는다.
// 병합 셀은 좌상단 셀에만 값이 있는 xlsx 규약을 그대로 따른다(견적서 라벨 열이 병합된 경우
// 값은 좌상단에 있으므로 라벨 매칭에 지장이 없다).
import { inflateRaw } from './inflate'

export type CellValue = string | number | boolean | null

export interface SheetGrid {
  name: string
  /** rows[r][c] — 0-based. 빈 셀은 null */
  rows: CellValue[][]
}

// ── ZIP ────────────────────────────────────────────────────────────────
interface ZipEntry {
  name: string
  method: number
  offset: number
  compressedSize: number
  uncompressedSize: number
}

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50

function findEocd(view: DataView): number {
  const max = Math.min(view.byteLength, 0xffff + 22)
  for (let i = 22; i <= max; i++) {
    const pos = view.byteLength - i
    if (pos < 0) break
    if (view.getUint32(pos, true) === EOCD_SIG) return pos
  }
  return -1
}

function readZipEntries(view: DataView): ZipEntry[] {
  const eocd = findEocd(view)
  if (eocd < 0) throw new Error('ZIP 구조를 찾지 못했습니다')
  const count = view.getUint16(eocd + 10, true)
  let pos = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder('utf-8')
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (pos + 46 > view.byteLength || view.getUint32(pos, true) !== CD_SIG) break
    const method = view.getUint16(pos + 10, true)
    const compressedSize = view.getUint32(pos + 20, true)
    const uncompressedSize = view.getUint32(pos + 24, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const offset = view.getUint32(pos + 42, true)
    const nameBytes = new Uint8Array(view.buffer, view.byteOffset + pos + 46, nameLen)
    entries.push({
      name: decoder.decode(nameBytes),
      method,
      offset,
      compressedSize,
      uncompressedSize,
    })
    pos += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** 지연 압축 해제 — 필요한 파일만 푼다(스타일·테마·미디어는 건드리지 않는다) */
class ZipArchive {
  private readonly view: DataView
  private readonly bytes: Uint8Array
  private readonly entries = new Map<string, ZipEntry>()

  constructor(data: ArrayBuffer) {
    this.view = new DataView(data)
    this.bytes = new Uint8Array(data)
    for (const e of readZipEntries(this.view)) this.entries.set(e.name, e)
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  read(name: string): Uint8Array | null {
    const e = this.entries.get(name)
    if (!e) return null
    const lo = e.offset
    if (lo + 30 > this.bytes.length) return null
    const nameLen = this.view.getUint16(lo + 26, true)
    const extraLen = this.view.getUint16(lo + 28, true)
    const start = lo + 30 + nameLen + extraLen
    const raw = this.bytes.subarray(start, start + e.compressedSize)
    if (e.method === 0) return raw
    if (e.method === 8) return inflateRaw(raw, e.uncompressedSize)
    throw new Error(`지원하지 않는 압축 방식(${e.method})입니다`)
  }

  readText(name: string): string | null {
    const bytes = this.read(name)
    return bytes ? new TextDecoder('utf-8').decode(bytes) : null
  }
}

// ── XML (필요한 만큼만) ─────────────────────────────────────────────────
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeXmlText(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body] ?? whole
  })
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag)
  return m ? decodeXmlText(m[1]) : null
}

/** <t> 조각을 모두 이어 붙인다(리치 텍스트 런 대응) */
function joinTextNodes(xml: string): string {
  let out = ''
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out += m[1] ? decodeXmlText(m[1]) : ''
  return out
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const out: string[] = []
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si(?:\s[^>]*)?\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1] ? joinTextNodes(m[1]) : '')
  return out
}

/** "A1"·"AB12" → [row0, col0] */
function parseRef(ref: string): [number, number] | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return null
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return [Number(m[2]) - 1, col - 1]
}

function parseSheet(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = []
  const setCell = (r: number, c: number, v: CellValue) => {
    while (rows.length <= r) rows.push([])
    const row = rows[r]
    while (row.length <= c) row.push(null)
    row[c] = v
  }
  // 자기닫힘(<c .../> = 빈 셀)과 값 있는 셀을 한 번에 훑는다
  const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  let m: RegExpExecArray | null
  let fallbackRow = 0
  let fallbackCol = 0
  while ((m = re.exec(xml))) {
    const tag = m[1] ?? ''
    const inner = m[2] ?? ''
    const ref = attr(tag, 'r')
    const pos = ref ? parseRef(ref) : null
    const r = pos ? pos[0] : fallbackRow
    const c = pos ? pos[1] : fallbackCol++
    if (pos) {
      fallbackRow = pos[0]
      fallbackCol = pos[1] + 1
    }
    if (!inner) continue
    const type = attr(tag, 't') ?? 'n'
    if (type === 'inlineStr') {
      const isMatch = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)
      setCell(r, c, isMatch ? joinTextNodes(isMatch[1]) : '')
      continue
    }
    const vMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)
    if (!vMatch) {
      // 값 없는 수식 셀 등
      continue
    }
    const raw = decodeXmlText(vMatch[1])
    if (type === 's') {
      const idx = Number(raw)
      setCell(r, c, shared[idx] ?? '')
    } else if (type === 'str' || type === 'd' || type === 'e') {
      setCell(r, c, raw)
    } else if (type === 'b') {
      setCell(r, c, raw === '1')
    } else {
      const n = Number(raw)
      setCell(r, c, Number.isFinite(n) ? n : raw)
    }
  }
  return rows
}

function sheetTargets(zip: ZipArchive): { name: string; path: string }[] {
  const wb = zip.readText('xl/workbook.xml')
  if (!wb) return []
  const rels = zip.readText('xl/_rels/workbook.xml.rels') ?? ''
  const relMap = new Map<string, string>()
  const relRe = /<Relationship\b([^>]*)\/?>/g
  let rm: RegExpExecArray | null
  while ((rm = relRe.exec(rels))) {
    const id = attr(rm[1], 'Id')
    const target = attr(rm[1], 'Target')
    if (id && target) relMap.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''))
  }
  const out: { name: string; path: string }[] = []
  const sheetRe = /<sheet\b([^>]*)\/?>/g
  let sm: RegExpExecArray | null
  while ((sm = sheetRe.exec(wb))) {
    const name = attr(sm[1], 'name') ?? `Sheet${out.length + 1}`
    const rid = attr(sm[1], 'r:id') ?? attr(sm[1], 'id')
    const target = rid ? relMap.get(rid) : undefined
    const path = target ? `xl/${target}` : `xl/worksheets/sheet${out.length + 1}.xml`
    out.push({ name, path })
  }
  return out
}

/** xlsx 바이너리 → 시트 격자 배열. xlsx가 아니면 throw */
export function readXlsxSheets(data: ArrayBuffer): SheetGrid[] {
  if (data.byteLength < 4) throw new Error('빈 파일입니다')
  const head = new Uint8Array(data, 0, 4)
  if (!(head[0] === 0x50 && head[1] === 0x4b)) {
    throw new Error('xlsx(ZIP) 형식이 아닙니다')
  }
  const zip = new ZipArchive(data)
  const shared = parseSharedStrings(zip.readText('xl/sharedStrings.xml'))
  const targets = sheetTargets(zip)
  const sheets: SheetGrid[] = []
  for (const t of targets) {
    const xml = zip.readText(t.path) ?? zip.readText(t.path.replace(/^xl\//, ''))
    if (!xml) continue
    sheets.push({ name: t.name, rows: parseSheet(xml, shared) })
  }
  if (sheets.length === 0) throw new Error('워크시트를 찾지 못했습니다')
  return sheets
}
