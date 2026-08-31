// S6 행사 설정 — 3탭: ①행사개요 ②담당자 ③유형·연동 (설계서 v1.5 §10 S6).
// ①탭은 S0 온보딩 ①단계와 동일한 ProjectOverviewForm을 재사용한다.
// pm이 아니면 각 편집 컴포넌트가 읽기 전용으로 전환된다(표시는 유지, 쓰기만 숨김/비활성).
//
// Phase 3.17 시안 정렬(행사 설정 · 행사 목록.dc.html §행사 설정):
//  · 상단 필수 4항목 체크 스트립 — 탭을 열지 않고도 무엇이 비었는지 안다.
//  · 탭 라벨에 미입력 개수 배지(필수=accent · 선택=중립). 배지는 aria-hidden이고
//    개수는 버튼 title로 전달한다 — 탭의 접근 가능한 이름을 흔들지 않기 위해서다.
//  · Drive·Slack 미연결 자리를 빈 상태 정본(②)으로 — 무엇이 좋아지는지 + 언제 열리는지.
//    게이트 뒤에 숨기지 않는다(§10 진입점 원칙).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/internal/Card'
import EmptyState from '../components/internal/EmptyState'
import ErrorAlert from '../components/internal/ErrorAlert'
import PageHeader from '../components/internal/PageHeader'
import PermissionNotice from '../components/internal/PermissionNotice'
import PartnerRosterEditor from '../components/partner/PartnerRosterEditor'
import ClientContactsEditor from '../components/settings/ClientContactsEditor'
import MembersEditor from '../components/settings/MembersEditor'
import PartnerGuideEditor from '../components/settings/PartnerGuideEditor'
import PartnerTierEditor from '../components/settings/PartnerTierEditor'
import ProjectKindCards from '../components/settings/ProjectKindCards'
import ProjectOverviewForm from '../components/settings/ProjectOverviewForm'
import { REQUIRED_FIELDS, filledRequired } from '../components/settings/requiredFields'
import { useProject } from '../context/ProjectContext'
import { useAsync } from '../hooks/useAsync'
import { externalViewUrl } from '../lib/externalLink'
import { EVENT_TYPE_LABELS, ROLE_BAR_CLASSES, ROLE_LABELS, formatDate } from '../lib/labels'
import { getDataProvider } from '../providers'
import type { ClientContact, ClientToken } from '../types/entities'
import type { MemberRole } from '../types/enums'

const provider = getDataProvider()

type Tab = 'overview' | 'members' | 'integration'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '① 행사개요' },
  { id: 'members', label: '② 담당자' },
  { id: 'integration', label: '③ 유형·연동' },
]

/** 탭 배지 — 필수 미입력은 accent(내 행동을 기다림), 선택 미입력은 중립 */
interface TabGap {
  required: number
  optional: number
}

/** 3.20 — 발급된 발주처 링크를 **열어볼 수 있는** 자리. 복사만으로는 발주처가 무엇을 보는지 모른다.
 *  회수·만료된 토큰은 열 수 없으므로 목록에서 뺀다(열면 410 화면이라 확인 목적에 맞지 않는다). */
function ClientViewLinks({
  contacts,
  tokens,
}: {
  contacts: ClientContact[]
  tokens: ClientToken[]
}) {
  const now = Date.now()
  const openable = tokens
    .filter((t) => !t.revoked_at && (!t.expires_at || new Date(t.expires_at).getTime() > now))
    .map((t) => ({ token: t, contact: contacts.find((c) => c.id === t.contact_id) ?? null }))

  return (
    <div data-testid="client-view-links" className="space-y-2.5">
      <p className="text-xs leading-relaxed text-ink-sub">
        발급된 링크를 받은 사람은 <strong>로그인 없이</strong> 이 행사의 컨펌 화면을 봅니다. 금액은
        어느 항목도 실리지 않습니다.
      </p>
      {openable.length === 0 ? (
        <EmptyState message="발급된 발주처 링크가 없습니다 — 위 표에서 발급하면 여기서 열어볼 수 있습니다." />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {openable.map(({ token, contact }) => (
            <li key={token.token}>
              <a
                href={externalViewUrl(`/c/${token.token}`)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
                title="무로그인 링크 — 받은 사람은 로그인 없이 발주처 화면을 봅니다"
              >
                {contact?.name ?? '이름 미상'} 화면 열기
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const ROLE_PREVIEW: { role: MemberRole; blurb: string }[] = [
  { role: 'pm', blurb: '계약·정산·컨펌 게이트' },
  { role: 'design', blurb: '랜딩·제작물' },
  { role: 'ops', blurb: '현장·리허설·결과보고' },
  { role: 'reg', blurb: '모객·RSVP·등록' },
]

export default function SettingsPage() {
  const { projectId, reloadSummaries } = useProject()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  const project = useAsync(() => provider.getProject(projectId), [projectId])
  const currentUser = useAsync(() => provider.getCurrentUser(), [])
  const members = useAsync(() => provider.listMembers(projectId), [projectId])
  const contacts = useAsync(() => provider.listClientContacts(projectId), [projectId])
  const isPm = currentUser.data?.role === 'pm'
  // 토큰 조회는 pm 전용(provider assertPm) — 아니면 호출 자체를 하지 않는다(무의미한 오류 방지)
  const clientTokens = useAsync(
    () => (isPm ? provider.listClientTokens(projectId) : Promise.resolve([])),
    [projectId, isPm],
  )

  const filled = project.data ? filledRequired(project.data) : new Set<string>()
  const missingCount = REQUIRED_FIELDS.length - filled.size
  const onboarded = !!project.data?.onboarded_at

  // 탭별 미입력 — ①은 필수 4 + 선택 개요 4, ②는 PM 지정(필수)·연락 창구(선택), ③은 연동 2종(선택)
  const gaps: Record<Tab, TabGap> = {
    overview: {
      required: missingCount,
      optional: project.data
        ? [
            project.data.theme,
            project.data.organizer,
            project.data.target_audience,
            project.data.expected_headcount,
          ].filter((v) => v == null || v === '').length
        : 0,
    },
    members: {
      required: members.data ? (members.data.some((m) => m.role === 'pm') ? 0 : 1) : 0,
      optional:
        project.data?.kind === 'agency' && contacts.data ? (contacts.data.length === 0 ? 1 : 0) : 0,
    },
    integration: {
      required: 0,
      optional: project.data
        ? (project.data.drive_root_folder_id ? 0 : 1) + (project.data.slack_webhook_url ? 0 : 1)
        : 0,
    },
  }

  const handleSaved = () => {
    project.reload()
    members.reload()
    contacts.reload()
    clientTokens.reload()
    reloadSummaries()
  }

  /** 발주처 연락처·토큰만 다시 읽는다 — 아래 '발주처 화면 열기' 목록이 같은 토큰을 본다 */
  const refreshContacts = () => {
    contacts.reload()
    clientTokens.reload()
  }


  return (
    <section className="space-y-6 p-6">
      <PageHeader
        caption="S6 · 행사 설정"
        title="행사 설정"
        action={
          project.data ? (
            onboarded ? (
              <span className="inline-flex items-center rounded-full bg-positive-tint px-3 py-1 text-xs font-medium text-positive">
                세팅 완료 · {formatDate((project.data.onboarded_at as string).slice(0, 10))}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-negative-tint px-3 py-1 text-xs font-medium text-negative">
                {/* 3.10.1 R5 — 필수 4가 모두 입력돼도 온보딩 미완료면 '필수 0개 남음' 대신 확인 유도 문구 */}
                {missingCount === 0
                  ? '세팅 미완료 · 온보딩 확인 필요'
                  : `세팅 미완료 · 필수 ${missingCount}개 남음`}
              </span>
            )
          ) : undefined
        }
      />

      <ErrorAlert message={project.error} />
      <ErrorAlert message={currentUser.error} />
      {project.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}

      {/* 필수 4항목 체크 스트립 — 탭 밖에서 무엇이 비었는지 읽힌다 */}
      {project.data && (
        <div
          data-testid="required-strip"
          className="ui-card flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5"
        >
          <span className="t-caption">필수 항목</span>
          {REQUIRED_FIELDS.map((f) => {
            const done = filled.has(f.key)
            return (
              <span
                key={f.key}
                data-testid={`required-${f.key}`}
                data-filled={done ? 'true' : 'false'}
                className="inline-flex items-center gap-2 text-sm"
              >
                <span
                  aria-hidden
                  className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full ${
                    done ? 'bg-positive' : 'border border-border bg-track'
                  }`}
                >
                  {done && (
                    <svg viewBox="0 0 20 20" className="size-[11px] fill-white">
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                    </svg>
                  )}
                </span>
                <span className={done ? 'text-ink' : 'text-ink-sub'}>{f.label}</span>
              </span>
            )
          })}
          <span data-testid="required-summary" className="ml-auto text-xs text-ink-cap">
            {filled.size}/{REQUIRED_FIELDS.length} 입력
            {missingCount > 0
              ? ' — 입력해야 행사를 활성화할 수 있습니다'
              : onboarded
                ? ' — 행사가 활성화되어 있습니다'
                : ' — 온보딩 확인만 남았습니다'}
          </span>
        </div>
      )}

      {project.data && !onboarded && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent-tint px-4 py-3 text-sm text-ink">
          <p>
            {missingCount === 0
              ? "필수 항목은 모두 입력됐습니다 — '온보딩 이어서 하기'에서 담당자·유형을 확인하면 행사가 활성화됩니다."
              : `필수 항목 ${missingCount}개를 입력하면 행사를 활성화할 수 있습니다 — 입력 후 '행사 목록'에서 온보딩을 완료하세요.`}
          </p>
          <button
            type="button"
            onClick={() => navigate('/onboarding')}
            className="btn btn-accent btn-sm shrink-0"
          >
            온보딩 이어서 하기
          </button>
        </div>
      )}

      {project.data && (
        <>
          <div className="flex gap-1 border-b border-border">
            {TABS.map((t) => {
              const gap = gaps[t.id]
              const count = gap.required > 0 ? gap.required : gap.optional
              const tone = gap.required > 0 ? 'required' : 'optional'
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  title={
                    count > 0
                      ? `${t.label} — ${tone === 'required' ? '필수' : '선택'} 미입력 ${count}건`
                      : undefined
                  }
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium ${
                    tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-sub hover:text-ink'
                  }`}
                >
                  {t.label}
                  {count > 0 && (
                    <span
                      aria-hidden
                      data-testid={`tab-gap-${t.id}`}
                      data-tone={tone}
                      className={`inline-flex items-center rounded-full px-[7px] py-0.5 text-[11px] font-medium ${
                        tone === 'required' ? 'bg-accent-tint text-accent-deep' : 'bg-track text-ink-sub'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {tab === 'overview' && (
            <Card title="행사개요">
              <ProjectOverviewForm projectId={projectId} onSaved={handleSaved} readOnly={!isPm} />
            </Card>
          )}

          {tab === 'members' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card title="담당자">
                <MembersEditor projectId={projectId} onChanged={handleSaved} readOnly={!isPm} />
              </Card>
              <div className="space-y-6">
                {/* v2.4 §10.1 표시 규칙 — 주최형은 발주처 연락처·토큰 표 대신 파트너 탭을 쓴다 */}
                {project.data.kind === 'host' ? (
                  <Card title="파트너">
                    <PartnerRosterEditor projectId={projectId} readOnly={!isPm} />
                  </Card>
                ) : (
                  <>
                    <Card title="발주처 연락처·토큰">
                      {/* 발급·회수가 아래 '발주처 화면 열기' 목록에 바로 반영되게 콜백을 받는다 */}
                      <ClientContactsEditor
                        projectId={projectId}
                        readOnly={!isPm}
                        onChanged={refreshContacts}
                      />
                    </Card>
                    {/* 3.20 — 발주처가 보는 화면으로 가는 경로. 토큰이 있는 자리 바로 아래 둔다 */}
                    <Card title="발주처 화면 열기">
                      {isPm ? (
                        <ClientViewLinks
                          contacts={contacts.data ?? []}
                          tokens={clientTokens.data ?? []}
                        />
                      ) : (
                        <PermissionNotice
                          reason="발주처 링크는 PM만 발급·조회할 수 있습니다."
                          howToRequest="이 행사의 PM에게 링크 발급을 요청하면 여기서 발주처 화면을 열어볼 수 있습니다."
                        />
                      )}
                    </Card>
                  </>
                )}
                <Card title="R&R 미리보기">
                  <ul className="space-y-2 text-sm">
                    {ROLE_PREVIEW.map((r) => (
                      <li key={r.role} className="flex items-center gap-2">
                        {/* 역할은 면(pill)이 아니라 형태 — 4px 좌측 바 (패턴 §04) */}
                        <span
                          aria-hidden
                          className={`h-4 w-1 shrink-0 rounded-full ${ROLE_BAR_CLASSES[r.role]}`}
                        />
                        <span className="w-12 shrink-0 font-medium text-ink">{ROLE_LABELS[r.role]}</span>
                        <span className="text-ink-sub">{r.blurb}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          )}

          {tab === 'integration' && (
            <div className="space-y-6">
              <Card title="행사 성격">
                <ProjectKindCards
                  projectId={projectId}
                  kind={project.data.kind}
                  onChanged={handleSaved}
                  readOnly={!isPm}
                />
              </Card>

              {project.data.kind === 'host' && (
                <Card title="파트너 등급">
                  <PartnerTierEditor projectId={projectId} readOnly={!isPm} />
                </Card>
              )}

              {project.data.kind === 'host' && (
                <Card title="파트너 안내 창구">
                  <PartnerGuideEditor
                    projectId={projectId}
                    project={project.data}
                    onSaved={handleSaved}
                    readOnly={!isPm}
                  />
                </Card>
              )}

              <Card
                title="행사 유형"
                action={
                  <span className="inline-flex shrink-0 items-center rounded-full bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">
                    {EVENT_TYPE_LABELS[project.data.event_type]}
                  </span>
                }
              >
                <p className="text-sm text-ink-sub">
                  행사 유형을 바꿔도 등록 데이터는 삭제되지 않습니다(표시 계층만 전환). WBS 재전개는
                  일정 화면에서 실행하세요.
                </p>
                <p className="mt-2 text-xs text-ink-cap">유형 변경은 ① 행사개요 탭에서 합니다.</p>
              </Card>

              {/* 연동 2종 — 빈 상태 정본 ②: 무엇이 좋아지는지 + 언제 열리는지 (accent CTA 없음) */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card
                  title="Drive 연결"
                  action={
                    <span className="inline-flex shrink-0 items-center rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
                      {project.data.drive_root_folder_id ? '연결됨' : '미연결'}
                    </span>
                  }
                >
                  <EmptyState
                    message="산출물 폴더가 연결되지 않았습니다."
                    action={
                      <div
                        data-testid="drive-empty"
                        className="flex flex-col items-center gap-2.5 text-center"
                      >
                        <p className="max-w-[280px] text-xs leading-relaxed text-ink-cap">
                          연결하면 표준 폴더 트리가 자동 생성되고, 직접 올린 파일이 미등록 인박스에
                          쌓입니다.
                        </p>
                        <span className="inline-flex items-center rounded-full bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">
                          Phase 5 예정
                        </span>
                      </div>
                    }
                  />
                </Card>

                <Card
                  title="Slack Webhook"
                  action={
                    <span className="inline-flex shrink-0 items-center rounded-full bg-track px-2 py-0.5 text-xs font-medium text-ink-sub">
                      {project.data.slack_webhook_url ? '등록됨' : '미등록'}
                    </span>
                  }
                >
                  <div data-testid="slack-empty" className="flex flex-col items-start gap-2.5">
                    <input
                      value={project.data.slack_webhook_url ?? ''}
                      placeholder="https://hooks.slack.com/services/…"
                      readOnly
                      disabled
                      aria-label="Slack Webhook URL"
                      className="ui-input w-full max-w-lg bg-canvas disabled:opacity-60"
                    />
                    <p className="text-xs leading-relaxed text-ink-cap">
                      등록하면 컨펌 요청·수정요청·지연 알림이 이 채널로 갑니다. 미등록 상태에서도
                      화면 동작은 그대로입니다.
                    </p>
                    <span className="inline-flex items-center rounded-full bg-steel-tint px-2 py-0.5 text-xs font-medium text-steel">
                      Phase 6 예정
                    </span>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
