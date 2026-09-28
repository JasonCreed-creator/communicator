// S9 발행 게이트 — 시트 위 한 줄에 문서 상태·버전·최종 수정자 + [마스터 시트 만들기] + [16:9 장표] + [인쇄 · PDF] + [컨펌 발송].
// 미입력 섹션이 하나라도 있으면 컨펌 발송을 잠근다(인쇄는 항상 허용) — 잠긴 이유는 InfoTip과
// 하단 경고 띠에서 밝힌다. 관리 UI이므로 인쇄에서는 통째로 빠진다.
// v2.21 §27.5(Phase 6.11 PR-G) — '마스터 시트 만들기'는 클릭에만(자동 0) · 결과 줄(링크·파일 이름·탭) · mock은 사실 안내.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import InfoTip from '../internal/InfoTip'
import { LevelBadge } from '../internal/StatusBadge'
import PrintExcludedChip from './PrintExcludedChip'
import { planSectionAnchor, type PlanSectionStatus } from './planSections'
import type { MasterSheetState } from './useMasterSheet'

const LOCK_HELP =
  '미입력 섹션이 있으면 컨펌 발송이 열리지 않습니다. 인쇄·PDF는 언제든 가능합니다.'

const SEND_NOTICE =
  '컨펌 발송은 문서 스냅숏 발행(서버 이식) 후 열립니다 — 지금은 인쇄 · PDF로 내려받아 전달하세요.'

export default function PlanPublishGate({
  docStateLabel,
  locked,
  blocking,
  versionLabel,
  printedAt,
  authorLabel,
  onPrint,
  masterSheet,
}: {
  docStateLabel: string
  locked: boolean
  /** 미입력이라 발송을 막는 섹션들(첫 항목으로 이동 링크를 건다) */
  blocking: PlanSectionStatus[]
  versionLabel: string
  printedAt: string
  authorLabel: string
  onPrint: () => void
  /** 마스터 시트 내보내기(v2.21 §27.5) — 없으면 단추를 그리지 않는다 */
  masterSheet?: MasterSheetState
}) {
  const [notice, setNotice] = useState(false)
  const first = blocking[0]

  return (
    <div className="ui-card print-hidden overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <LevelBadge
            level={locked ? 'progress' : 'positive'}
            prefix="문서"
            label={docStateLabel}
          />
          <span className="truncate text-[13px] text-ink-sub">
            {versionLabel} · {printedAt} 출력 · {authorLabel}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PrintExcludedChip />
          {/* v2.21 §27.5 — 앱 데이터를 표준 마스터 시트(탭 7 고정)로 행사 폴더에 내보낸다 — 클릭에만 */}
          {masterSheet && (
            <button
              type="button"
              onClick={() => void masterSheet.create()}
              disabled={masterSheet.pending}
              className="btn btn-ghost print-hidden"
              data-testid="master-sheet-create"
            >
              {masterSheet.pending ? '마스터 시트 만드는 중…' : '마스터 시트 만들기'}
            </button>
          )}
          {/* v2.13.2 §23.7 — 같은 내용을 16:9 장표로(사이드바 없는 전체 화면 · 장표만 인쇄) */}
          <Link to="/plan/deck" className="btn btn-ghost print-hidden">
            16:9 장표
          </Link>
          <button type="button" onClick={onPrint} className="btn btn-ghost print-hidden">
            인쇄 · PDF
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => setNotice(true)}
            className="btn btn-accent print-hidden"
          >
            컨펌 발송
          </button>
          {locked && <InfoTip text={LOCK_HELP} />}
        </div>
      </div>

      {locked && first && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border bg-negative-tint px-5 py-2.5">
          <span className="text-[13px] leading-relaxed text-negative">
            <strong className="font-semibold">
              {first.meta.number} {first.meta.title}이(가) 비어 있습니다.
            </strong>{' '}
            미입력 섹션이 있으면 컨펌 발송이 열리지 않습니다 — 인쇄는 가능합니다.
          </span>
          <a
            href={`#${planSectionAnchor(first.key)}`}
            className="shrink-0 text-[13px] font-medium text-negative underline"
          >
            해당 섹션으로 이동 →
          </a>
        </div>
      )}

      {notice && (
        <p className="border-t border-border bg-canvas px-5 py-2.5 text-[13px] leading-relaxed text-ink-sub">
          {SEND_NOTICE}
        </p>
      )}

      {masterSheet?.notice && (
        <p className="border-t border-border bg-canvas px-5 py-2.5 text-[13px] leading-relaxed text-ink-sub" data-testid="master-sheet-notice">
          {masterSheet.notice}
        </p>
      )}
      {masterSheet?.error && (
        <p role="alert" className="border-t border-border bg-negative-tint px-5 py-2.5 text-[13px] leading-relaxed text-negative" data-testid="master-sheet-error">
          {masterSheet.error}
        </p>
      )}
      {masterSheet?.result && <MasterSheetResultLine result={masterSheet.result} />}
    </div>
  )
}

/** 만든 시트 — 링크(새 탭)·링크 복사·파일 이름·탭 이름. 앱은 이 시트를 다시 읽지 않는다(R-M1) */
function MasterSheetResultLine({ result }: { result: NonNullable<MasterSheetState['result']> }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div role="status" className="border-t border-border bg-positive-tint px-5 py-2.5 text-[13px] leading-relaxed" data-testid="master-sheet-result">
      <span className="font-semibold text-positive">마스터 시트가 만들어졌습니다</span>
      <span className="text-ink-sub"> — {result.file_name}</span>
      <span className="text-ink-cap"> · 행사 폴더 04_WBS·운영계획 · 탭 {result.tabs.length ? result.tabs.join(' · ') : '—'}</span>
      <span className="ml-2 inline-flex flex-wrap items-center gap-2 align-middle">
        <a className="btn btn-ghost btn-sm" href={result.url} target="_blank" rel="noopener noreferrer">
          새 탭에서 열기 ↗
        </a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>
          {copied ? '복사됨' : '링크 복사'}
        </button>
      </span>
    </div>
  )
}
