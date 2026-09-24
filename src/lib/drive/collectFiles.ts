// 끌어놓기·파일 선택·폴더 선택에서 올릴 파일 목록을 모은다 — 설계서 v2.9 §7.2 업로드 3경로(화면 쪽).
// 폴더를 끌어놓으면 하위 폴더까지 펼친다(브라우저 FileSystemEntry). 숨김·시스템 파일(.DS_Store·Thumbs.db 등)은 뺀다.
// 순서 = 경로 자연 정렬(시안2 < 시안10) — 파일마다 버전 1개로 이 순서대로 올린다(가정 ④, 결정 로그 2026-09-24).

export interface PickedFile {
  file: File
  /** 폴더 안 상대 경로(폴더로 고른 경우) — 없으면 파일 이름 */
  path: string
}

const SYSTEM_NAMES = new Set(['thumbs.db', 'desktop.ini', 'icon\r'])

export function isSystemFile(name: string): boolean {
  const n = name.toLowerCase()
  return n.startsWith('.') || n.startsWith('~$') || SYSTEM_NAMES.has(n)
}

// 사용자 로캘과 무관한 결정적 순서(숫자 → 영문 → 한글, 숫자는 자연 정렬) — 탐색기 '이름순'과 같은 감각.
// 'ko' 로캘 정렬은 한글을 영문보다 앞에 두어 폴더 안 순서가 브라우저 언어에 따라 달라진다.
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function sortPicked(files: PickedFile[]): PickedFile[] {
  return [...files].sort((a, b) => collator.compare(a.path, b.path))
}

/** input[type=file] (multiple · webkitdirectory 모두) → 목록 */
export function pickedFromList(list: FileList | File[] | null | undefined): PickedFile[] {
  const out: PickedFile[] = []
  for (const file of Array.from(list ?? [])) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
    const path = rel && rel.length > 0 ? rel : file.name
    if (path.split('/').some(isSystemFile)) continue
    out.push({ file, path })
  }
  return sortPicked(out)
}

// ── 끌어놓기(폴더 포함) ────────────────────────────────────────────────
interface EntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath?: string
  file?: (ok: (f: File) => void, fail?: (e: unknown) => void) => void
  createReader?: () => { readEntries: (ok: (entries: EntryLike[]) => void, fail?: (e: unknown) => void) => void }
}

function readAll(dir: EntryLike): Promise<EntryLike[]> {
  const reader = dir.createReader?.()
  if (!reader) return Promise.resolve([])
  const all: EntryLike[] = []
  // readEntries는 한 번에 일부(크롬 100개)만 준다 — 빈 배열이 올 때까지 반복
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all)
        else {
          all.push(...batch)
          next()
        }
      }, reject)
    next()
  })
}

async function walk(entry: EntryLike, prefix: string, out: PickedFile[], limit: number): Promise<void> {
  if (out.length >= limit || isSystemFile(entry.name)) return
  const path = prefix ? `${prefix}/${entry.name}` : entry.name
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((ok, fail) => entry.file!(ok, fail))
    out.push({ file, path })
    return
  }
  if (entry.isDirectory) {
    for (const child of await readAll(entry)) await walk(child, path, out, limit)
  }
}

/** 끌어놓은 항목 → 목록. 폴더는 하위까지 펼친다(상한 limit개 — 실수로 큰 폴더를 떨어뜨렸을 때 브라우저를 붙잡지 않게) */
export async function pickedFromDrop(dt: DataTransfer, limit = 200): Promise<PickedFile[]> {
  const items = Array.from(dt.items ?? [])
  const entries = items
    .filter((i) => i.kind === 'file')
    .map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null)
  if (entries.length > 0 && entries.every((e) => e !== null)) {
    const out: PickedFile[] = []
    for (const e of entries) await walk(e as EntryLike, '', out, limit)
    return sortPicked(out)
  }
  return pickedFromList(dt.files)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)}KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`
}
