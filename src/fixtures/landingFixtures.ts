// v2.1 랜딩보드 픽스처 — 샘플 행사에 랜딩 1건과 최근 30일 유입 지표를 시드한다.
// #RULE-NO-COMPANY: 실명·실행사명을 쓰지 않는다(RE:BUILD 예외는 rebuildFixtures.ts 한 파일 한정).
// 지표는 실행 시점 기준 상대 날짜로 생성해 D-day·추세가 언제 열어도 자연스럽게 보이도록 한다.
import type { LandingDailyMetric, LandingPage } from '../types/entities'
import type { MockState } from './sampleProject'
import { defaultConsents, defaultFormFields, defaultSections } from '../lib/landingTemplate'

export const LANDING_ID_SAMPLE = 'lnd-001'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * 결정론적 의사난수 — Math.random을 쓰면 스냅숏 테스트가 흔들리므로
 * 날짜 인덱스에서 파생한 값으로 자연스러운 요일 굴곡만 만든다.
 */
function wave(i: number, base: number, amp: number): number {
  const dow = i % 7
  const weekend = dow === 5 || dow === 6 ? 0.55 : 1
  const drift = 1 + i * 0.035 // 행사일이 가까워질수록 상승
  const jitter = ((i * 37) % 11) / 10 - 0.5
  return Math.max(0, Math.round((base + amp * jitter) * weekend * drift))
}

/** 최근 30일 지표 — 뷰 > 폼 열람 > 제출 순으로 자연스러운 깔때기 */
export function buildLandingMetrics(today: string, days = 30): LandingDailyMetric[] {
  const out: LandingDailyMetric[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -(days - 1 - i))
    const views = wave(i, 180, 90)
    const unique = Math.round(views * 0.72)
    const formStarts = Math.round(views * 0.16)
    const submits = Math.round(formStarts * 0.38)
    out.push({ date, views, unique_visitors: unique, form_starts: formStarts, submits })
  }
  return out
}

/** 랜딩 1건 — 기본 13섹션 + 폼 6필드 + 동의 2종. hero·agenda 등은 autofill이 켜져 있다 */
export function buildSampleLanding(projectId: string, now: string): LandingPage {
  // defaultSections는 (kind) => prefix 형태의 id 팩토리를 받는다 — 픽스처는 고정 접두사로 안정 id를 만든다
  const idFor = (kind: string) => `${LANDING_ID_SAMPLE}-${kind}`
  return {
    id: LANDING_ID_SAMPLE,
    project_id: projectId,
    title: '샘플 테크 컨퍼런스 2026',
    slug: 'sample-tech-2026',
    status: 'published',
    public_url: 'https://example.com/ads/sample-tech-2026/',
    sticky_nav: true,
    cta_label: '참가 신청하기',
    submit_target: 'registration',
    external_submit_url: null,
    analytics: {
      ga_measurement_id: 'G-SAMPLE1234',
      gtm_container_id: null,
      conversion_event: 'generate_lead',
    },
    sections: defaultSections(idFor),
    form_fields: defaultFormFields(idFor),
    consents: defaultConsents(idFor),
    created_at: now,
    updated_at: now,
    published_at: now,
  }
}

export function seedLandingFixtures(state: MockState, projectId: string, today: string): void {
  const now = `${today}T09:00:00.000Z`
  const landing = buildSampleLanding(projectId, now)
  state.landing_pages = [landing]
  state.landing_metrics = { [landing.id]: buildLandingMetrics(today) }
}
