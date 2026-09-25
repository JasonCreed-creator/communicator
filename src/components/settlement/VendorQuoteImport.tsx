// S-10 협력사 견적서 불러오기 (설계서 v2.11 §19.5 · Phase 4.7) — 업로드 → 확인 큐 → 발주 항목.
//
// §19.5 정본: "확신이 서지 않는 것만 담당자에게 묻는다 — 어느 버킷인지, 부가세가 포함인지" · "읽은 결과는 항상 담당자 확인을
// 거쳐 저장한다(오독이 곧 정산 오류)". 그래서 이 화면은 **제안을 보여 주고 고르게** 한다:
//   ① 파일(.xlsx)과 협력사를 고른다 → 가져오기(제안만 저장 — 항목은 아직 없다)
//   ② 확인 큐: 부가세(모르면 반드시 고른다) · 행마다 포함 여부·버킷(원가 버킷만)·제목 · 공급가 대조 · 읽기 경고
//   ③ 확정 → 고른 행마다 발주 항목(발주액 = 견적서 금액, 부가세 포함이면 분리) — 금액은 서버가 저장된 제안에서 읽는다
// 발주는 항목 단위다(§19.3) — 협력사 묶음 한 줄로 넣는 선택지는 두지 않는다.
// **내부 전용** — 금액은 이 화면과 정산보드에만(§4-24 R-S9).
import { useMemo, useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useMutation } from '../../hooks/useAsync'
import { toVatExcluded } from '../../lib/settlement'
import {
  isVendorQuoteFile,
  supplyCheck,
  vendorQuoteSums,
  VENDOR_QUOTE_FILE_MESSAGE,
  type VendorQuoteRow,
} from '../../lib/vendorQuote'
import { getDataProvider } from '../../providers'
import type { SettlementBucket, SettlementItem, Vendor } from '../../types/entities'
import type { VendorQuoteImportView } from '../../types/views'

const provider = getDataProvider()

function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

const STATUS_LABEL: Record<VendorQuoteImportView['status'], string> = {
  parsed: '확인 대기',
  confirmed: '확정',
  discarded: '버림',
}

/** 행 편집 상태 — 포함 여부·버킷 id·제목(고친 경우) */
interface RowDraft {
  include: boolean
  bucketId: string
  title: string
}

function draftsOf(view: VendorQuoteImportView, buckets: readonly SettlementBucket[]): Record<number, RowDraft> {
  const byCode = new Map(buckets.filter((b) => b.has_cost).map((b) => [b.code, b.id]))
  const out: Record<number, RowDraft> = {}
  for (const r of view.parsed.rows) {
    out[r.index] = { include: r.include, bucketId: (r.bucket_code && byCode.get(r.bucket_code)) || '', title: r.title }
  }
  return out
}

/**
 * 불러온 협력사 견적서 이력 — PR-7(디자인지시서 v1.4 §7-2.11)부터 **불러오기 버튼은 정산보드 머리**에 있고
 * 확인 대기 건은 머리 아래 알림이 먼저 알린다. 이 칸은 기록(파일 · 협력사 · 상태 · 원본 보관)만 — 이력이 있을 때만 그린다.
 */
export default function VendorQuoteHistory({
  imports,
  canEdit,
  onOpen,
}: {
  imports: readonly VendorQuoteImportView[]
  /** pm이고 종료 행사가 아닐 때 — 확인 대기 건을 다시 열 수 있다 */
  canEdit: boolean
  onOpen: (view: VendorQuoteImportView) => void
}) {
  const pending = imports.filter((x) => x.status === 'parsed')
  if (imports.length === 0) return null
  return (
    <section className="ui-card p-5" data-testid="vendor-quote-import" aria-label="불러온 협력사 견적서">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="t-card-title">불러온 협력사 견적서</h2>
        <span className="t-caption">확정한 건만 발주 항목이 됩니다 · 원본은 행사 Drive 폴더(02_견적·정산)에 보관</span>
      </div>
      <ul className="mt-3 divide-y divide-border rounded-md border border-border" aria-label="불러온 견적서">
        {imports.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink" title={x.file_name}>
              {x.file_name}
            </span>
            <span className="text-ink-sub">{x.vendor_name ?? '협력사 미지정'}</span>
            <span className="whitespace-nowrap text-xs text-ink-cap">
              {STATUS_LABEL[x.status]}
              {x.status === 'confirmed' ? ` · 항목 ${x.item_count}개` : ''}
              {x.drive_file_id ? ' · 원본 Drive 보관' : ''}
            </span>
            {x.status === 'parsed' && canEdit && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen(x)}>
                확인하기
              </button>
            )}
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <p className="mt-2 text-xs text-ink-cap" data-testid="vendor-quote-pending">
          확인을 기다리는 견적서 {pending.length}건 — 확정하기 전에는 정산에 들어가지 않습니다.
        </p>
      )}
    </section>
  )
}

export function VendorQuoteDialog({
  projectId,
  initial,
  buckets,
  vendors,
  onClose,
  onConfirmed,
}: {
  projectId: string
  initial: VendorQuoteImportView | null
  buckets: readonly SettlementBucket[]
  vendors: readonly Vendor[]
  onClose: () => void
  onConfirmed: () => void
}) {
  const [view, setView] = useState<VendorQuoteImportView | null>(initial)
  const [file, setFile] = useState<File | null>(null)
  const [vendorId, setVendorId] = useState(initial?.vendor_id ?? '')
  const [vat, setVat] = useState<boolean | null>(initial ? initial.parsed.vat.suggested : null)
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>(() => (initial ? draftsOf(initial, buckets) : {}))
  const [done, setDone] = useState<SettlementItem[] | null>(null)
  const costBuckets = useMemo(() => buckets.filter((b) => b.has_cost), [buckets])

  const load = useMutation(async () => {
    if (!file) throw new Error('견적서 파일을 고르세요.')
    if (!isVendorQuoteFile(file.name)) throw new Error(VENDOR_QUOTE_FILE_MESSAGE)
    const data = await file.arrayBuffer()
    return provider.importVendorQuote(projectId, { file_name: file.name, data, vendor_id: vendorId || null })
  })
  const confirm = useMutation(async () => {
    if (!view) throw new Error('견적서를 먼저 불러오세요.')
    if (vat === null) throw new Error('부가세 포함 여부를 고르세요.')
    const rows = view.parsed.rows
      .filter((r) => drafts[r.index]?.include)
      .map((r) => ({ index: r.index, bucket_id: drafts[r.index].bucketId, title: drafts[r.index].title.trim() }))
    if (rows.length === 0) throw new Error('만들 항목이 없습니다 — 한 줄 이상 고르세요.')
    if (rows.some((r) => !r.bucket_id)) throw new Error('포함한 행마다 버킷을 고르세요.')
    return provider.confirmVendorQuoteImport(view.id, { vat_included: vat, vendor_id: vendorId || null, rows })
  })
  const discard = useMutation(async () => {
    if (!view) return true
    await provider.discardVendorQuoteImport(view.id)
    return true
  })

  const handleLoad = async () => {
    const r = await load.run()
    if (r) {
      setView(r)
      setVat(r.parsed.vat.suggested)
      setDrafts(draftsOf(r, buckets))
    }
  }
  const handleConfirm = async () => {
    const r = await confirm.run()
    if (r) {
      setDone(r)
      onConfirmed()
    }
  }
  const handleDiscard = async () => {
    if (!window.confirm('이 견적서를 버릴까요? 항목은 만들어지지 않습니다.')) return
    if (await discard.run()) onClose()
  }

  const included: VendorQuoteRow[] = view ? view.parsed.rows.filter((r) => drafts[r.index]?.include) : []
  const sums = vendorQuoteSums(included, vat ?? false)
  const check = view ? supplyCheck(view.parsed, included) : null
  const missingBucket = included.some((r) => !drafts[r.index]?.bucketId)
  const canConfirm = !!view && vat !== null && included.length > 0 && !missingBucket && !confirm.pending
  const setRow = (index: number, patch: Partial<RowDraft>) => setDrafts((d) => ({ ...d, [index]: { ...d[index], ...patch } }))

  return (
    <div className="print-hidden fixed inset-0 z-30 flex items-start justify-center overflow-y-auto p-4">
      <div aria-hidden onClick={onClose} className="fixed inset-0 bg-ink/30" />
      <div role="dialog" aria-modal="true" aria-label="협력사 견적서 불러오기" data-testid="vendor-quote-dialog" className="ui-card relative z-10 my-6 w-full max-w-4xl p-6">
        {done ? (
          <>
            <h2 className="t-card-title">발주 항목 {done.length}개를 만들었습니다</h2>
            <p className="mt-2 text-sm text-ink-sub">
              버킷별 발주 합계에 바로 반영됩니다. 실비는 집행 후 항목마다 입력하세요.
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        ) : !view ? (
          <>
            <h2 className="t-card-title">협력사 견적서 불러오기</h2>
            <p className="mt-2 text-sm text-ink-sub">
              엑셀(.xlsx) 견적서를 고르세요. 읽은 결과는 다음 화면에서 확인한 뒤에 저장합니다 — 지금은 아무것도 만들어지지 않습니다.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 t-caption">
                견적서 파일
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  aria-label="견적서 파일"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 t-caption">
                협력사(선택)
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="ui-input ui-select w-64" aria-label="협력사">
                  <option value="">나중에 고르기</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ErrorAlert message={load.error} />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                취소
              </button>
              <button type="button" className="btn btn-primary" disabled={!file || load.pending} onClick={handleLoad}>
                읽기
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="t-card-title">확인하고 저장하기 — {view.file_name}</h2>
            <p className="mt-1 text-xs text-ink-cap">
              서식 {view.parsed.format}형 · 행 {view.parsed.rows.length}개
              {view.parsed.header.manager ? ` · 견적 담당 ${view.parsed.header.manager}` : ''}
              {view.drive_file_id ? ' · 원본은 Drive(02_견적·정산/협력사 견적서)에 보관했습니다' : ''}
            </p>

            <fieldset className="mt-4 rounded-md border border-border p-3" data-testid="vendor-quote-vat">
              <legend className="px-1 text-sm font-medium text-ink">
                견적서 금액에 부가세가 들어 있나요?
                {!view.parsed.vat.certain && (
                  <span className="ml-2 whitespace-nowrap text-xs font-normal text-accent-deep" data-testid="vendor-quote-vat-needs">
                    확인 필요
                  </span>
                )}
              </legend>
              <p className="text-xs text-ink-sub">{view.parsed.vat.reason}</p>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="ui-check-row items-center text-sm">
                  <input type="radio" name="vq-vat" className="ui-check" checked={vat === false} onChange={() => setVat(false)} />
                  별도(항목 금액 그대로 저장)
                </label>
                <label className="ui-check-row items-center text-sm">
                  <input type="radio" name="vq-vat" className="ui-check" checked={vat === true} onChange={() => setVat(true)} />
                  포함(저장 전에 부가세 분리 — ÷1.1)
                </label>
              </div>
            </fieldset>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 t-caption">
                협력사
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="ui-input ui-select w-64" aria-label="협력사">
                  <option value="">지정 안 함</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 t-caption">
                비어 있는 버킷 한 번에 채우기
                <select
                  className="ui-input ui-select w-56"
                  aria-label="버킷 한 번에 채우기"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id) return
                    setDrafts((d) => {
                      const next = { ...d }
                      for (const r of view.parsed.rows) if (!next[r.index].bucketId) next[r.index] = { ...next[r.index], bucketId: id }
                      return next
                    })
                  }}
                >
                  <option value="">버킷 고르기…</option>
                  {costBuckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="ui-table min-w-[760px] text-sm" data-testid="vendor-quote-rows">
                <thead>
                  <tr>
                    <th className="ui-th w-[56px]">포함</th>
                    <th className="ui-th">항목</th>
                    <th className="ui-th w-[140px]">섹션</th>
                    <th className="ui-th w-[130px] text-right">견적서 금액</th>
                    <th className="ui-th w-[200px]">버킷</th>
                  </tr>
                </thead>
                <tbody>
                  {view.parsed.rows.map((r) => {
                    const d = drafts[r.index]
                    const needs = d.include && (!d.bucketId || r.confidence === 'low')
                    return (
                      <tr key={r.index} data-testid={`vq-row-${r.index}`}>
                        <td>
                          <input
                            type="checkbox"
                            className="ui-check"
                            aria-label={`${r.title} 포함`}
                            checked={d.include}
                            onChange={(e) => setRow(r.index, { include: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            className="ui-input w-full"
                            aria-label={`${r.index + 1}번 항목명`}
                            value={d.title}
                            onChange={(e) => setRow(r.index, { title: e.target.value })}
                          />
                          {r.spec && <p className="mt-0.5 text-xs text-ink-cap">{r.spec}</p>}
                        </td>
                        <td className="whitespace-nowrap text-ink-sub">{r.section}</td>
                        <td className="ui-num whitespace-nowrap text-right tabular-nums">{r.amount.toLocaleString('ko-KR')}</td>
                        <td>
                          <select
                            className={`ui-input ui-select w-full ${d.include && !d.bucketId ? 'ui-input-error' : ''}`}
                            aria-label={`${r.index + 1}번 버킷`}
                            value={d.bucketId}
                            onChange={(e) => setRow(r.index, { bucketId: e.target.value })}
                          >
                            <option value="">버킷 고르기…</option>
                            {costBuckets.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.label}
                              </option>
                            ))}
                          </select>
                          {needs && <p className="mt-0.5 whitespace-nowrap text-xs text-accent-deep">확인 필요</p>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-3 text-sm">
              <div className="space-y-1 text-ink-sub" data-testid="vendor-quote-sums">
                <p>
                  고른 {included.length}행 · 견적서 금액 합 {won(sums.raw)} → 저장(부가세 별도){' '}
                  <b className="text-ink">{won(vat === null ? sums.raw : sums.supply)}</b>
                  {vat === null ? ' (부가세를 고르면 확정됩니다)' : ''}
                </p>
                {check && check.expected !== null && (
                  <p className={check.ok ? 'text-positive' : 'text-negative'} data-testid="vendor-quote-check">
                    공급가 대조: 행 합 {won(check.actual)} {check.ok ? '=' : '≠'} 견적서 부가세 전 합계 {won(check.expected)}
                    {check.ok ? '' : ' — 빠진 행이 있는지 확인하세요(막지는 않습니다)'}
                  </p>
                )}
                {view.parsed.warnings.map((w) => (
                  <p key={w} className="text-xs text-ink-cap">
                    · {w}
                  </p>
                ))}
              </div>
              <p className="text-xs text-ink-cap">원가가 없는 버킷(PCO 기획료·RSVP·리드젠)은 고를 수 없습니다.</p>
            </div>

            <ErrorAlert message={confirm.error ?? discard.error} />
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <button type="button" className="btn btn-ghost-negative" onClick={handleDiscard} disabled={discard.pending}>
                버리기
              </button>
              <div className="flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  나중에
                </button>
                <button type="button" className="btn btn-primary" disabled={!canConfirm} onClick={handleConfirm}>
                  확정 — 발주 항목 {included.length}개 만들기
                </button>
              </div>
            </div>
            {vat === true && included.length > 0 && (
              <p className="mt-2 text-right text-xs text-ink-cap">
                예) {won(included[0].amount)}(포함) → {won(toVatExcluded(included[0].amount, true))}(별도)로 저장
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
