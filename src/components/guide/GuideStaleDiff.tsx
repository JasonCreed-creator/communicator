// R-O4 차이 확인 패널 (v2.5 §23 — 3.16d에서 GuideBuilder 안에 있던 것을 옮김, 동작 불변).
// "기준 견적 갱신"과 같은 패턴 — 저장된 내용과 현재 원본을 나란히 보여주기만 하고,
// 반영 버튼을 사람이 직접 눌러야만 saveGuideSections가 호출된다(자동 덮어쓰기 금지).
import { useState } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { assembleRoleSectionContent, assembleZoneSectionContent } from '../../lib/guideAssembly'
import { getDataProvider } from '../../providers'
import type { GuideSection } from '../../types/entities'
import { renderLiteMarkdown } from '../plan/markdown'

const provider = getDataProvider()

export default function GuideStaleDiff({
  section,
  projectId,
  canApply,
  applying,
  onApply,
}: {
  section: GuideSection
  projectId: string
  canApply: boolean
  applying: boolean
  onApply: (content: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (current !== null) return
    setLoading(true)
    setError(null)
    try {
      let assembled = section.content ?? ''
      if (section.source_ref === 'zone_items') {
        const items = await provider.listDeliverables(projectId, { area: 'ops' })
        assembled = assembleZoneSectionContent(items)
      } else if (section.source_ref === 'role_charters') {
        const charters = await provider.listRoleCharters(projectId)
        assembled = assembleRoleSectionContent(charters)
      }
      setCurrent(assembled)
    } catch (e) {
      setError(e instanceof Error ? e.message : '원본을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="plan-print-hidden mt-3 border-t border-border pt-3">
      <button type="button" onClick={handleToggle} className="text-xs font-medium text-steel underline">
        {open ? '차이 확인 접기' : '차이 확인'}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <ErrorAlert message={error} />
          {loading && <p className="text-xs text-ink-cap">불러오는 중…</p>}
          {!loading && current !== null && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="t-caption mb-1">저장된 내용</p>
                  <div className="rounded-md border border-border bg-canvas p-2 text-xs text-ink-sub">
                    {renderLiteMarkdown(section.content ?? '_내용 없음_')}
                  </div>
                </div>
                <div>
                  <p className="t-caption mb-1">현재 원본</p>
                  <div className="rounded-md border border-accent/40 bg-accent-tint/30 p-2 text-xs text-ink-sub">
                    {renderLiteMarkdown(current || '_내용 없음_')}
                  </div>
                </div>
              </div>
              {canApply && (
                <button type="button" onClick={() => onApply(current)} disabled={applying} className="btn btn-accent btn-sm">
                  반영
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
