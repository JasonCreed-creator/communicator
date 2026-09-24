// Phase 5 (설계서 v2.9 §7.2b) — Drive 링크 파서 · 파일 모으기(끌어놓기·폴더 선택) · OAuth 복귀 문구. 순수 함수 계약.
import { describe, expect, it } from 'vitest'
import { driveFileUrl, driveFolderUrl, looksLikeDriveFileId, parseDriveLink } from '../lib/driveLink'
import { formatBytes, isSystemFile, pickedFromDrop, pickedFromList } from '../lib/drive/collectFiles'
import { driveReturnMessage } from '../lib/drive/driveGateway'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456'

describe('parseDriveLink — 받는 형태', () => {
  it.each([
    [`https://drive.google.com/file/d/${ID}/view?usp=sharing`, 'file'],
    [`https://drive.google.com/file/u/0/d/${ID}/view`, 'file'],
    [`https://drive.google.com/open?id=${ID}`, 'file'],
    [`https://drive.google.com/uc?id=${ID}&export=download`, 'file'],
    [`https://docs.google.com/document/d/${ID}/edit`, 'file'],
    [`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, 'file'],
    [`https://docs.google.com/presentation/u/1/d/${ID}/edit`, 'file'],
    [`https://docs.google.com/drawings/d/${ID}/edit`, 'file'],
    [`https://drive.google.com/drive/folders/${ID}?usp=drive_link`, 'folder'],
    [`https://drive.google.com/drive/u/1/folders/${ID}`, 'folder'],
    [`drive.google.com/file/d/${ID}/view`, 'file'],
    [`  ${ID}  `, 'file'],
  ])('%s → %s', (input, kind) => {
    expect(parseDriveLink(input)).toEqual({ kind, id: ID })
  })

  it("'링크 복사'가 주는 폴더 링크 형태(?usp=drive_link)도 폴더로 읽는다 — id는 가상 값", () => {
    expect(parseDriveLink('https://drive.google.com/drive/folders/1Fake0FolderIdForSharedLinkSample?usp=drive_link')).toEqual({
      kind: 'folder',
      id: '1Fake0FolderIdForSharedLinkSample',
    })
  })

  it.each([
    'https://example.com/file/d/abcdefghijklmnop/view',
    'https://drive.google.com.evil.example/file/d/abcdefghijklmnop/view',
    'https://drive.google.com/drive/my-drive',
    'https://docs.google.com/forms/d/abcdefghijklmnop/edit',
    'hello',
    '',
    'https://drive.google.com/file/d/short/view',
  ])('Drive 파일·폴더가 아니면 null: %s', (input) => {
    expect(parseDriveLink(input)).toBeNull()
  })

  it('보기 링크·폴더 링크를 만들고, 실제 Drive id와 자리표시 id를 가른다', () => {
    expect(driveFileUrl(ID)).toBe(`https://drive.google.com/file/d/${ID}/view`)
    expect(driveFolderUrl(ID)).toBe(`https://drive.google.com/drive/folders/${ID}`)
    expect(looksLikeDriveFileId(ID)).toBe(true)
    expect(looksLikeDriveFileId('drv-root-stc26')).toBe(false)
    expect(looksLikeDriveFileId('drv-f-inbox-001')).toBe(false)
    expect(looksLikeDriveFileId('pending:0b5b1c1e-1111-2222-3333-444455556666')).toBe(false)
    expect(looksLikeDriveFileId(null)).toBe(false)
  })
})

describe('파일 모으기 — 파일 선택·폴더 선택·끌어놓기', () => {
  const f = (name: string, rel?: string) => {
    const file = new File(['x'], name)
    if (rel) Object.defineProperty(file, 'webkitRelativePath', { value: rel })
    return file
  }

  it('자연 정렬(시안2 < 시안10) · 숨김·시스템 파일 제외 · 폴더 선택은 상대 경로', () => {
    const picked = pickedFromList([f('시안10.pdf'), f('.DS_Store'), f('시안2.pdf'), f('Thumbs.db'), f('~$견적.xlsx')])
    expect(picked.map((p) => p.path)).toEqual(['시안2.pdf', '시안10.pdf'])
    const inFolder = pickedFromList([f('b.png', '배너/시안/b.png'), f('a.png', '배너/a.png'), f('x', '배너/.git/x')])
    expect(inFolder.map((p) => p.path)).toEqual(['배너/a.png', '배너/시안/b.png'])
    expect(isSystemFile('desktop.ini')).toBe(true)
    expect(isSystemFile('정상.pdf')).toBe(false)
  })

  it('끌어놓은 폴더는 하위까지 펼친다(readEntries 여러 번 · 상한)', async () => {
    const fileEntry = (name: string) => ({ isFile: true, isDirectory: false, name, file: (ok: (x: File) => void) => ok(f(name)) })
    const batches = [[fileEntry('2.pdf'), fileEntry('.hidden')], [fileEntry('10.pdf')], []]
    const dir = {
      isFile: false,
      isDirectory: true,
      name: '시안',
      createReader: () => ({ readEntries: (ok: (e: unknown[]) => void) => ok(batches.shift() ?? []) }),
    }
    const dt = {
      items: [
        { kind: 'file', webkitGetAsEntry: () => dir },
        { kind: 'file', webkitGetAsEntry: () => fileEntry('표지.pdf') },
      ],
      files: [],
    } as unknown as DataTransfer
    const picked = await pickedFromDrop(dt)
    expect(picked.map((p) => p.path)).toEqual(['시안/2.pdf', '시안/10.pdf', '표지.pdf'])
    // 폴더 API가 없는 브라우저 → files 목록으로
    const plain = await pickedFromDrop({ items: [], files: [f('b.pdf'), f('a.pdf')] } as unknown as DataTransfer)
    expect(plain.map((p) => p.path)).toEqual(['a.pdf', 'b.pdf'])
  })

  it('크기 표기', () => {
    expect(formatBytes(512)).toBe('512B')
    expect(formatBytes(2048)).toBe('2.0KB')
    expect(formatBytes(6 * 1024 * 1024)).toBe('6.0MB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00GB')
  })
})

describe('OAuth 복귀 문구', () => {
  it('연결 성공·사유별 실패를 한국어로 — 모르는 사유도 빈 문구가 아니다', () => {
    expect(driveReturnMessage('?drive=connected')).toMatchObject({ ok: true })
    expect(driveReturnMessage('?drive=error&reason=root_access')?.message).toContain('편집 권한')
    expect(driveReturnMessage('?drive=error&reason=denied')?.message).toContain('허용')
    expect(driveReturnMessage('?drive=error&reason=???')?.message).toContain('실패')
    expect(driveReturnMessage('?x=1')).toBeNull()
  })
})
