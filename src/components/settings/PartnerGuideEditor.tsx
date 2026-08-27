// 행사 설정 ③ 파트너 안내 창구 (v2.4.1 §21.1, 감수 M2) — /p 포털 상단 '참가 가이드 보기' 버튼과
// 하단 문의 안내에 쓰이는 두 필드. kind='host'에서만 렌더(SettingsPage가 조건 분기).
// updateProject 단일 호출로 두 필드를 함께 저장 — ProjectKindCards·PartnerTierEditor와 동일한
// useMutation 패턴. 값이 없으면 null로 저장해 포털 쪽 조건부 렌더(있을 때만 노출)가 그대로 먹는다.
import { useState, type FormEvent } from 'react'
import ErrorAlert from '../internal/ErrorAlert'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { Project, UUID } from '../../types/entities'

const provider = getDataProvider()

export default function PartnerGuideEditor({
  projectId,
  project,
  onSaved,
  readOnly = false,
}: {
  projectId: UUID
  project: Project
  onSaved: () => void
  readOnly?: boolean
}) {
  const [guideUrl, setGuideUrl] = useState(project.partner_guide_url ?? '')
  const [contactEmail, setContactEmail] = useState(project.partner_contact_email ?? '')

  const save = useMutation(() =>
    provider.updateProject(projectId, {
      partner_guide_url: guideUrl.trim() || null,
      partner_contact_email: contactEmail.trim() || null,
    }),
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await save.run()
    if (result) onSaved()
  }

  if (readOnly) {
    return (
      <div className="space-y-2 text-sm">
        <p>
          <span className="text-ink-cap">참가 가이드 링크</span>{' '}
          <span className="text-ink">{project.partner_guide_url || '미등록'}</span>
        </p>
        <p>
          <span className="text-ink-cap">문의 창구 이메일</span>{' '}
          <span className="text-ink">{project.partner_contact_email || '미등록'}</span>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-ink-cap">
        /p 제출 포털 상단의 &lsquo;참가 가이드 보기&rsquo; 버튼과 하단 문의 안내에 쓰입니다 — 값이
        없으면 해당 UI는 표시되지 않습니다.
      </p>
      <label className="flex flex-col gap-1 t-caption">
        참가 가이드 링크
        <input
          type="url"
          value={guideUrl}
          onChange={(e) => setGuideUrl(e.target.value)}
          placeholder="https://example.com/..."
          className="ui-input w-full max-w-md"
        />
      </label>
      <label className="flex flex-col gap-1 t-caption">
        문의 창구 이메일
        <input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="partners@example.com"
          className="ui-input w-full max-w-md"
        />
      </label>
      <button type="submit" disabled={save.pending} className="btn btn-primary btn-sm">
        저장
      </button>
      <ErrorAlert message={save.error} />
    </form>
  )
}
