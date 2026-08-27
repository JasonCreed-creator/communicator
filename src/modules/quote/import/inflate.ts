// RFC 1951 raw DEFLATE 디코더 — 의존 0, **동기**.
//
// 왜 직접 쓰는가: 파서 계약(parseQuoteWorkbook)이 동기 함수이고(MockProvider.importQuoteFile이
// `const parsed = parseQuoteWorkbook(...)`로 호출한다), exceljs·JSZip의 로더는 모두 비동기다.
// 새 런타임 의존을 들이지 않는다는 규약(CLAUDE.md §2 — 견적 모듈 허용 의존은 exceljs·file-saver뿐)
// 아래서 xlsx(zip)를 동기로 열려면 압축 해제를 여기서 직접 해결해야 한다.
// 알고리즘은 표준(zlib "puff" 방식의 정준 허프만 디코딩)이며 이식한 외부 코드는 없다.

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
]
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
]
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
]
/** 코드 길이 알파벳의 전송 순서 (RFC 1951 §3.2.7) */
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

/** 정준 허프만 표 — counts[len] = 길이 len인 심볼 수, symbols = 길이순 정렬된 심볼 */
interface Huffman {
  counts: Uint16Array
  symbols: Uint16Array
}

function buildHuffman(lengths: Uint8Array, n: number): Huffman {
  const counts = new Uint16Array(16)
  for (let i = 0; i < n; i++) counts[lengths[i]]++
  counts[0] = 0
  const offsets = new Uint16Array(16)
  let sum = 0
  for (let len = 1; len < 16; len++) {
    offsets[len] = sum
    sum += counts[len]
  }
  const symbols = new Uint16Array(sum)
  for (let i = 0; i < n; i++) {
    if (lengths[i]) symbols[offsets[lengths[i]]++] = i
  }
  return { counts, symbols }
}

let FIXED_LIT: Huffman | null = null
let FIXED_DIST: Huffman | null = null

function fixedTables(): { lit: Huffman; dist: Huffman } {
  if (!FIXED_LIT || !FIXED_DIST) {
    const lit = new Uint8Array(288)
    for (let i = 0; i < 144; i++) lit[i] = 8
    for (let i = 144; i < 256; i++) lit[i] = 9
    for (let i = 256; i < 280; i++) lit[i] = 7
    for (let i = 280; i < 288; i++) lit[i] = 8
    FIXED_LIT = buildHuffman(lit, 288)
    const dist = new Uint8Array(30).fill(5)
    FIXED_DIST = buildHuffman(dist, 30)
  }
  return { lit: FIXED_LIT, dist: FIXED_DIST }
}

class BitReader {
  private pos = 0
  private buf = 0
  private cnt = 0
  constructor(private readonly src: Uint8Array) {}

  bit(): number {
    if (this.cnt === 0) {
      if (this.pos >= this.src.length) throw new Error('압축 데이터가 예기치 않게 끝났습니다')
      this.buf = this.src[this.pos++]
      this.cnt = 8
    }
    const b = this.buf & 1
    this.buf >>>= 1
    this.cnt--
    return b
  }

  bits(n: number): number {
    let v = 0
    for (let i = 0; i < n; i++) v |= this.bit() << i
    return v >>> 0
  }

  /** 비저장 블록 전 바이트 경계 정렬 */
  alignByte(): void {
    this.cnt = 0
    this.buf = 0
  }

  readBytes(n: number): Uint8Array {
    if (this.pos + n > this.src.length) throw new Error('압축 데이터가 예기치 않게 끝났습니다')
    const out = this.src.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }

  readU16(): number {
    const a = this.readBytes(2)
    return a[0] | (a[1] << 8)
  }
}

function decodeSymbol(r: BitReader, table: Huffman): number {
  let code = 0
  let first = 0
  let index = 0
  for (let len = 1; len < 16; len++) {
    code |= r.bit()
    const count = table.counts[len]
    if (code - first < count) return table.symbols[index + (code - first)]
    index += count
    first = (first + count) << 1
    code <<= 1
  }
  throw new Error('손상된 허프만 코드')
}

class OutBuffer {
  private data: Uint8Array
  length = 0
  constructor(hint: number) {
    this.data = new Uint8Array(Math.max(1024, hint))
  }
  private ensure(extra: number): void {
    if (this.length + extra <= this.data.length) return
    let size = this.data.length * 2
    while (size < this.length + extra) size *= 2
    const next = new Uint8Array(size)
    next.set(this.data.subarray(0, this.length))
    this.data = next
  }
  push(byte: number): void {
    this.ensure(1)
    this.data[this.length++] = byte
  }
  append(chunk: Uint8Array): void {
    this.ensure(chunk.length)
    this.data.set(chunk, this.length)
    this.length += chunk.length
  }
  copyBack(distance: number, len: number): void {
    if (distance > this.length) throw new Error('손상된 역참조 거리')
    this.ensure(len)
    let from = this.length - distance
    for (let i = 0; i < len; i++) this.data[this.length++] = this.data[from++]
  }
  toUint8Array(): Uint8Array {
    return this.data.subarray(0, this.length)
  }
}

function readDynamicTables(r: BitReader): { lit: Huffman; dist: Huffman } {
  const hlit = r.bits(5) + 257
  const hdist = r.bits(5) + 1
  const hclen = r.bits(4) + 4
  const clens = new Uint8Array(19)
  for (let i = 0; i < hclen; i++) clens[CLEN_ORDER[i]] = r.bits(3)
  const clTable = buildHuffman(clens, 19)

  const lengths = new Uint8Array(hlit + hdist)
  let i = 0
  while (i < lengths.length) {
    const sym = decodeSymbol(r, clTable)
    if (sym < 16) {
      lengths[i++] = sym
    } else if (sym === 16) {
      if (i === 0) throw new Error('손상된 코드 길이 반복')
      const prev = lengths[i - 1]
      const repeat = 3 + r.bits(2)
      for (let k = 0; k < repeat; k++) lengths[i++] = prev
    } else if (sym === 17) {
      const repeat = 3 + r.bits(3)
      for (let k = 0; k < repeat; k++) lengths[i++] = 0
    } else {
      const repeat = 11 + r.bits(7)
      for (let k = 0; k < repeat; k++) lengths[i++] = 0
    }
  }
  return {
    lit: buildHuffman(lengths.subarray(0, hlit), hlit),
    dist: buildHuffman(lengths.subarray(hlit), hdist),
  }
}

/** raw DEFLATE(zlib 헤더 없음) 스트림을 동기로 푼다 */
export function inflateRaw(src: Uint8Array, sizeHint = 0): Uint8Array {
  const r = new BitReader(src)
  const out = new OutBuffer(sizeHint)
  for (;;) {
    const last = r.bit()
    const type = r.bits(2)
    if (type === 0) {
      r.alignByte()
      const len = r.readU16()
      const nlen = r.readU16()
      if ((len ^ 0xffff) !== nlen) throw new Error('손상된 비압축 블록 길이')
      out.append(r.readBytes(len))
    } else if (type === 1 || type === 2) {
      const { lit, dist } = type === 1 ? fixedTables() : readDynamicTables(r)
      for (;;) {
        const sym = decodeSymbol(r, lit)
        if (sym < 256) {
          out.push(sym)
        } else if (sym === 256) {
          break
        } else {
          const li = sym - 257
          if (li >= LENGTH_BASE.length) throw new Error('손상된 길이 심볼')
          const length = LENGTH_BASE[li] + r.bits(LENGTH_EXTRA[li])
          const ds = decodeSymbol(r, dist)
          if (ds >= DIST_BASE.length) throw new Error('손상된 거리 심볼')
          const distance = DIST_BASE[ds] + r.bits(DIST_EXTRA[ds])
          out.copyBack(distance, length)
        }
      }
    } else {
      throw new Error('알 수 없는 DEFLATE 블록 유형')
    }
    if (last) break
  }
  return out.toUint8Array()
}
