// 견적서 Blob 저장 트리거 — file-saver는 src/modules/quote 밖에서 import 금지(CLAUDE.md §2)이므로
// UI는 provider.exportQuoteXlsx가 돌려준 blob을 이 헬퍼로 저장한다.
let fileSaverModule: { saveAs?: (blob: Blob, name: string) => void; default?: (blob: Blob, name: string) => void } | null = null

export async function saveQuoteFile(blob: Blob, fileName: string): Promise<void> {
  if (!fileSaverModule) fileSaverModule = await import('file-saver')
  const saveAs = fileSaverModule.saveAs || fileSaverModule.default
  saveAs!(blob, fileName)
}
