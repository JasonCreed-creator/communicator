// SupabaseProvider · S-3 랜딩보드 도메인 (설계서 v2.1 §4-19~§4-22) — 8메서드.
// 스코프는 언제나 인자(projectId 또는 landing.project_id)로 정한다 — currentUser()의 멤버십에서 유도하지 않는다
// (§4-21 R-L1·R-L2). 섹션·폼·동의는 jsonb 열에 mock과 1:1로 저장되고, 폼 제출은 공개 RPC submit_landing_lead가
// 검증·적재·지표·로그를 한 트랜잭션으로 처리한다. 금액 키는 이 파일 어디에도 없다(DoD 23·30).
import type { DataProvider, LandingPageInput, LandingPagePatch } from '../../DataProvider'
import { SupabaseCtx, newId, nowIso } from '../ctx'
import { ProviderError } from '../../../lib/errors'
import type { Attendee, LandingDailyMetric, LandingPage, UUID } from '../../../types/entities'
import { defaultConsents, defaultFormFields, defaultSections } from '../../../lib/landingTemplate'

type LandingMethods = Pick<
  DataProvider,
  | 'listLandingPages'
  | 'getLandingPage'
  | 'createLandingPage'
  | 'updateLandingPage'
  | 'publishLandingPage'
  | 'deleteLandingPage'
  | 'listLandingMetrics'
  | 'submitLandingLead'
>

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const PUBLIC_URL_RE = /^https?:\/\/.+/
const UUID_RE = /^[0-9a-f-]{36}$/i

/**
 * landing_pages 행 → LandingPage. analytics jsonb의 DB 기본값은 '{}'라 TS 정본(3키 전부 존재)으로 채우고,
 * 배열 열은 null 방어만 한다(앱이 쓴 값은 이미 정본 형태다).
 */
function toLanding(row: Record<string, unknown>): LandingPage {
  const l = row as unknown as LandingPage
  const a = (l.analytics ?? {}) as Partial<LandingPage['analytics']>
  return {
    ...l,
    analytics: {
      ga_measurement_id: a.ga_measurement_id ?? null,
      gtm_container_id: a.gtm_container_id ?? null,
      conversion_event: a.conversion_event ?? 'generate_lead',
    },
    sections: l.sections ?? [],
    form_fields: l.form_fields ?? [],
    consents: l.consents ?? [],
  }
}

/** RPC가 돌려준 attendees jsonb → Attendee (시트 확장 열 null → optional undefined) */
function toAttendee(row: Record<string, unknown>): Attendee {
  const a = row as unknown as Attendee & { sheet_row_id: string | null; sheet_status: Attendee['sheet_status'] | null }
  return { ...a, sheet_row_id: a.sheet_row_id ?? undefined, sheet_status: a.sheet_status ?? undefined }
}

function assertSlugShape(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new ProviderError('validation', 'slug는 영소문자·숫자·하이픈만 쓸 수 있습니다.')
  }
}

export function landingDomain(ctx: SupabaseCtx): LandingMethods {
  async function mustFindLanding(landingId: UUID): Promise<LandingPage> {
    return toLanding(
      ctx.q(
        await ctx.sb.from('landing_pages').select('*').eq('id', landingId).maybeSingle(),
        '랜딩을 찾을 수 없습니다.',
      ) as Record<string, unknown>,
    )
  }

  /** slug는 행사 안에서 유일해야 한다(R-L4) — 내보낸 파일명·공개 주소가 겹치지 않도록 */
  async function assertSlugFree(projectId: UUID, slug: string, exceptId?: UUID): Promise<void> {
    let query = ctx.sb.from('landing_pages').select('id').eq('project_id', projectId).eq('slug', slug)
    if (exceptId) query = query.neq('id', exceptId)
    const taken = ctx.q(await query.limit(1)) as { id: UUID }[]
    if (taken.length > 0) throw new ProviderError('conflict', '이미 사용 중인 slug입니다.')
  }

  return {
    async listLandingPages(projectId: UUID): Promise<LandingPage[]> {
      // 스코프는 인자로만 정한다(§4-21 R-L1). 비멤버에게는 RLS가 빈 목록을 준다
      const rows = ctx.q(
        await ctx.sb
          .from('landing_pages')
          .select('*')
          .eq('project_id', projectId)
          .order('updated_at', { ascending: false }),
      ) as Record<string, unknown>[]
      return rows.map(toLanding)
    },

    async getLandingPage(landingId: UUID): Promise<LandingPage> {
      return mustFindLanding(landingId)
    },

    async createLandingPage(projectId: UUID, input: LandingPageInput): Promise<LandingPage> {
      // 행위자 신원은 활동 로그에만 쓴다(ctx.log 기본 actor). 쓰기 가드·slug 유일성·소속은 전부 인자
      // projectId로 판정한다(§4-21 R-L1·R-L3·R-L4)
      await ctx.me()
      await ctx.assertWritable(projectId)
      const title = input.title?.trim()
      if (!title) throw new ProviderError('validation', '랜딩 제목은 필수입니다.')
      const slug = input.slug?.trim()
      if (!slug) throw new ProviderError('validation', 'slug는 필수입니다.')
      assertSlugShape(slug)
      await assertSlugFree(projectId, slug)

      const id = newId()
      const idFor = (kind: string) => `${id}-${kind}`
      const now = nowIso()
      const row: LandingPage = {
        id,
        project_id: projectId,
        title,
        slug,
        status: 'draft',
        public_url: null,
        sticky_nav: true,
        cta_label: '참가 신청하기',
        submit_target: 'registration',
        external_submit_url: null,
        analytics: {
          ga_measurement_id: input.analytics?.ga_measurement_id ?? null,
          gtm_container_id: input.analytics?.gtm_container_id ?? null,
          conversion_event: input.analytics?.conversion_event ?? 'generate_lead',
        },
        sections: input.sections ?? defaultSections(idFor),
        form_fields: input.form_fields ?? defaultFormFields(idFor),
        consents: input.consents ?? defaultConsents(idFor),
        created_at: now,
        updated_at: now,
        published_at: null,
      }
      const created = toLanding(
        ctx.q(await ctx.sb.from('landing_pages').insert(row).select('*').single()) as Record<string, unknown>,
      )
      await ctx.log(projectId, 'landing.created', 'landing', id, { title })
      return created
    },

    async updateLandingPage(landingId: UUID, patch: LandingPagePatch): Promise<LandingPage> {
      await ctx.me()
      const landing = await mustFindLanding(landingId)
      await ctx.assertWritable(landing.project_id)

      const upd: Record<string, unknown> = {}
      if (patch.title !== undefined) {
        if (!patch.title.trim()) throw new ProviderError('validation', '랜딩 제목은 필수입니다.')
        upd.title = patch.title.trim()
      }
      if (patch.slug !== undefined) {
        const slug = patch.slug.trim()
        assertSlugShape(slug)
        await assertSlugFree(landing.project_id, slug, landing.id)
        upd.slug = slug
      }
      if (patch.status !== undefined) upd.status = patch.status
      if (patch.sticky_nav !== undefined) upd.sticky_nav = patch.sticky_nav
      if (patch.cta_label !== undefined) upd.cta_label = patch.cta_label
      if (patch.submit_target !== undefined) upd.submit_target = patch.submit_target
      if (patch.external_submit_url !== undefined) upd.external_submit_url = patch.external_submit_url
      if (patch.analytics !== undefined) upd.analytics = { ...patch.analytics }
      // 배열은 통째 교체 — 빌더가 항상 전체 순서를 들고 저장한다
      if (patch.sections !== undefined) {
        upd.sections = patch.sections.map((sec, i) => ({ ...sec, sort_order: i + 1 }))
      }
      if (patch.form_fields !== undefined) {
        upd.form_fields = patch.form_fields.map((f, i) => ({ ...f, sort_order: i + 1 }))
      }
      if (patch.consents !== undefined) {
        upd.consents = patch.consents.map((c, i) => ({ ...c, sort_order: i + 1 }))
      }
      upd.updated_at = nowIso()

      const saved = toLanding(
        ctx.q(
          await ctx.sb.from('landing_pages').update(upd).eq('id', landingId).select('*').single(),
        ) as Record<string, unknown>,
      )
      await ctx.log(landing.project_id, 'landing.updated', 'landing', landing.id, {})
      return saved
    },

    async publishLandingPage(landingId: UUID, publicUrl: string | null): Promise<LandingPage> {
      await ctx.me()
      const landing = await mustFindLanding(landingId)
      await ctx.assertWritable(landing.project_id)
      const now = nowIso()
      let upd: Record<string, unknown>
      if (publicUrl === null) {
        upd = { status: 'draft', public_url: null, published_at: null, updated_at: now }
      } else {
        const url = publicUrl.trim()
        if (!PUBLIC_URL_RE.test(url)) {
          throw new ProviderError('validation', '공개 주소는 http(s) URL이어야 합니다.')
        }
        upd = { status: 'published', public_url: url, published_at: now, updated_at: now }
      }
      const saved = toLanding(
        ctx.q(
          await ctx.sb.from('landing_pages').update(upd).eq('id', landingId).select('*').single(),
        ) as Record<string, unknown>,
      )
      await ctx.log(landing.project_id, 'landing.published', 'landing', landing.id, {
        public_url: saved.public_url,
      })
      return saved
    },

    async deleteLandingPage(landingId: UUID): Promise<void> {
      await ctx.me()
      const landing = await mustFindLanding(landingId)
      await ctx.assertWritable(landing.project_id)
      if ((await ctx.roleIn(landing.project_id)) !== 'pm') {
        throw new ProviderError('forbidden', '랜딩 삭제는 PM만 할 수 있습니다.')
      }
      // landing_daily_metrics는 on delete cascade — 지표도 함께 사라진다(mock의 delete landing_metrics[id])
      ctx.ok(await ctx.sb.from('landing_pages').delete().eq('id', landingId))
    },

    async listLandingMetrics(landingId: UUID): Promise<LandingDailyMetric[]> {
      await mustFindLanding(landingId)
      const rows = ctx.q(
        await ctx.sb
          .from('landing_daily_metrics')
          .select('date, views, unique_visitors, form_starts, submits')
          .eq('landing_id', landingId)
          .order('date'),
      ) as LandingDailyMetric[]
      return rows.map((m) => ({
        date: m.date,
        views: m.views,
        unique_visitors: m.unique_visitors,
        form_starts: m.form_starts,
        submits: m.submits,
      }))
    },

    async submitLandingLead(landingId: UUID, values: Record<string, string>): Promise<Attendee> {
      // 공개 경로(anon 허용). 랜딩 404·종료 행사 409·external 409·closed 409·성함/필수 동의 422와
      // 지표 가산·'landing.lead' 로그는 전부 RPC 안에서 mock과 같은 문구로 처리된다
      if (!UUID_RE.test(landingId)) throw new ProviderError('not_found', '랜딩을 찾을 수 없습니다.')
      const row = await ctx.rpc<Record<string, unknown>>('submit_landing_lead', {
        p_landing: landingId,
        p_values: values,
      })
      return toAttendee(row)
    },
  }
}
