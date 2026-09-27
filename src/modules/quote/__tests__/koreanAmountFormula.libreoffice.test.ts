// 한글금액 수식을 **실제 스프레드시트 엔진(LibreOffice Calc)**으로 재계산해 JS 정본과 대조한다.
// soffice가 없는 환경(CI 등)은 건너뛴다 — 로컬·체크아웃 보고에서 실측 결과를 남기는 용도.
// soffice가 있어도 1칸 CSV조차 못 여는 설치 결함(샌드박스 컨테이너에서 실측 — 'source file could not be loaded')이면
// 프로브에서 걸러 '환경 결함'으로 건너뛰고 사유를 남긴다(2026-09-27 사용자 선택 — 가짜 통과가 아니라 명시 스킵). 수식 의미는 미니 평가기 테스트가 상시 검증하고,
// 실제 타깃(구글 시트) 대조는 Phase 6.11 PR-G의 실키 스모크가 맡는다.
// 캐시 결과를 일부러 틀리게 넣은 대조군 셀로 "재계산이 실제로 일어났는지"를 먼저 확인한다(안 일어나면 무효 처리).
// LibreOffice는 xlsx의 캐시 값을 기본적으로 믿으므로(OOXMLRecalcMode=never) 전용 프로필에 "항상 재계산"을 심어 연다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { amountInWordsFormula, amountInWordsKo, koreanAmount, koreanAmountFormula } from '../export/koreanAmountFormula'

function sofficePath(): string | null {
  for (const p of ['/usr/bin/soffice', '/usr/local/bin/soffice', '/opt/homebrew/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']) {
    if (existsSync(p)) return p
  }
  return null
}

const SOFFICE = sofficePath()

/** 설치 결함 프로브 — 전용 프로필로 1칸 CSV를 변환해 본다. 실패하면 사유를 돌려준다(테스트는 건너뛴다) */
function sofficeProbe(soffice: string): { ok: true } | { ok: false; reason: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kor-amount-probe-'))
  try {
    const src = join(dir, 'probe.csv')
    writeFileSync(src, '1\n')
    const profileUrl = writeRecalcProfile(dir)
    try {
      execFileSync(soffice, [`-env:UserInstallation=${profileUrl}`, '--headless', '--calc', '--convert-to', 'csv', '--outdir', join(dir, 'out'), src], {
        stdio: 'pipe',
        timeout: 60_000,
        env: { ...process.env, HOME: dir },
      })
    } catch (e) {
      return { ok: false, reason: `soffice 실행 실패 — ${(e as Error).message.split('\n')[0]}` }
    }
    if (!existsSync(join(dir, 'out', 'probe.csv'))) return { ok: false, reason: 'soffice가 1칸 CSV를 변환하지 못함(설치 결함 — 출력 파일 없음)' }
    return { ok: true }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const PROBE = SOFFICE ? sofficeProbe(SOFFICE) : null
if (PROBE && !PROBE.ok) console.warn(`[koreanAmountFormula.libreoffice] 건너뜀 — 환경 결함: ${PROBE.reason}`)
const SAMPLES = [0, 1, 10, 1_000, 10_000, 120_000, 1_234_567, 137_810_000, 200_000_001, 1_000_010_000, 123_456_789_012, 1_000_000_000_000]

/** 전용 사용자 프로필 — xlsx를 열 때 항상 재계산(OOXMLRecalcMode 0) */
function writeRecalcProfile(dir: string): string {
  const profile = join(dir, 'profile')
  mkdirSync(join(profile, 'user'), { recursive: true })
  writeFileSync(
    join(profile, 'user', 'registrymodifications.xcu'),
    `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>
`,
  )
  return pathToFileURL(profile).href
}

/** xlsx → LibreOffice 재계산 → 탭 구분 CSV 행렬 */
export function recalcWithLibreOffice(xlsxPath: string, dir: string): string[][] {
  const profileUrl = writeRecalcProfile(dir)
  execFileSync(
    SOFFICE!,
    [`-env:UserInstallation=${profileUrl}`, '--headless', '--calc', '--convert-to', 'csv:Text - txt - csv (StarCalc):9,34,76,1,,0,false,true,false,false,false', '--outdir', dir, xlsxPath],
    { stdio: 'pipe', timeout: 120_000, env: { ...process.env, HOME: dir } },
  )
  const csvPath = xlsxPath.replace(/\.xlsx$/, '.csv')
  const csv = readFileSync(join(dir, csvPath.slice(csvPath.lastIndexOf('/') + 1)), 'utf8').replace(/^﻿/, '')
  return csv.split(/\r?\n/).filter(Boolean).map((line) => line.split('\t').map((c) => c.replace(/^"|"$/g, '')))
}

describe.skipIf(!SOFFICE || !PROBE?.ok)('koreanAmountFormula — LibreOffice Calc 재계산 실측', () => {
  it('엔진 재계산 결과 = JS 정본 (샘플 전부)', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('t')
    // 대조군: 캐시를 일부러 틀리게 — 재계산이 일어나면 2, 안 일어나면 999가 읽힌다
    ws.getCell('A1').value = 1
    ws.getCell('B1').value = { formula: 'A1+1', result: 999 }
    SAMPLES.forEach((n, i) => {
      const r = i + 2
      ws.getCell(`A${r}`).value = n
      ws.getCell(`B${r}`).value = { formula: koreanAmountFormula(`A${r}`) }
      ws.getCell(`C${r}`).value = { formula: amountInWordsFormula(`A${r}`) }
    })
    const dir = mkdtempSync(join(tmpdir(), 'kor-amount-'))
    try {
      const xlsx = join(dir, 'f.xlsx')
      await wb.xlsx.writeFile(xlsx)
      const rows = recalcWithLibreOffice(xlsx, dir)
      expect(rows[0][1], `대조군 — LibreOffice가 수식을 재계산해야 한다 (csv: ${JSON.stringify(rows.slice(0, 3))})`).toBe('2')
      SAMPLES.forEach((n, i) => {
        const row = rows[i + 1]
        expect(row[1], `koreanAmount(${n})`).toBe(koreanAmount(n))
        expect(row[2], `amountInWords(${n})`).toBe(amountInWordsKo(n))
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)
})
