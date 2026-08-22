// 행사 데이터 → 랜딩 섹션 자동 조립 (v2.1 §4-20 autofill).
//
// 랜딩보드가 범용 빌더와 갈라지는 지점. 행사명·일시·장소는 Project에, 연사·세션은
// ProgramSession에, 존 안내는 ops 영역 산출물에 이미 있으므로 랜딩에서 다시 입력하지 않는다.
// autofill=true인 섹션은 저장된 items를 무시하고 매 렌더마다 행사 데이터에서 조립하며,
// 수동 편집이 필요하면 UI에서 autofill을 꺼 저장값으로 전환한다(입력값은 그대로 보존된다).
import type {
  Deliverable,
  LandingItem,
  LandingSection,
  ProgramSession,
  Project,
} from '../types/entities'

export interface AutofillSource {
  project: Project
  sessions: ProgramSession[]
  /** 존 운영 항목 — category가 '존운영'인 ops 산출물 */
  zoneDeliverables: Deliverable[]
}

const item = (
  id: string,
  label: string,
  detail: string | null,
  meta: string | null,
  sort_order: number,
): LandingItem => ({ id, label, detail, meta, image_url: null, sort_order })

/** 'YYYY-MM-DD' → '2026.05.07(목)' */
export function formatEventDate(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return null
  const dow = ['일', '월', '화', '수', '목', '금', '토'][
    new Date(`${iso}T00:00:00`).getDay()
  ]
  return `${y}.${m}.${d}(${dow})`
}

/** 히어로 보조 줄 — '2026.05.07(목) | 10:00-18:00 | 장소' */
export function heroMetaLine(project: Project): string {
  const parts: string[] = []
  const date = formatEventDate(project.event_date)
  if (date) parts.push(date)
  if (project.start_time && project.end_time) {
    parts.push(`${project.start_time}-${project.end_time}`)
  }
  if (project.venue) parts.push(project.venue)
  return parts.join(' | ')
}

/** 세션 → 'HH:MM-HH:MM' */
function sessionTime(s: ProgramSession): string | null {
  if (!s.start_time) return null
  return s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time
}

/** 연사 표기 — '이름 · 직함 소속' 중 있는 것만 */
function speakerMeta(s: ProgramSession): string | null {
  const parts = [s.speaker_org, s.speaker_title].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

/**
 * 한 섹션을 행사 데이터로 조립한다. autofill이 꺼져 있거나 지원하지 않는 타입이면
 * 입력 섹션을 그대로 돌려준다(불변) — 호출부가 분기할 필요가 없다.
 */
export function autofillSection(section: LandingSection, src: AutofillSource): LandingSection {
  if (!section.autofill) return section
  const { project, sessions, zoneDeliverables } = src
  const sorted = [...sessions].sort((a, b) => a.sort_order - b.sort_order)

  switch (section.type) {
    case 'hero':
      return {
        ...section,
        headline: section.headline ?? project.name,
        body: section.body ?? heroMetaLine(project),
        items: [],
      }

    case 'speakers': {
      // 연사가 있는 세션만, 같은 연사는 첫 세션 기준으로 1장
      const seen = new Set<string>()
      const items: LandingItem[] = []
      for (const s of sorted) {
        if (!s.speaker_name || seen.has(s.speaker_name)) continue
        seen.add(s.speaker_name)
        items.push(item(`af-spk-${s.id}`, s.speaker_name, s.title, speakerMeta(s), items.length + 1))
      }
      return { ...section, items }
    }

    case 'agenda':
      return {
        ...section,
        items: sorted.map((s, i) =>
          item(
            `af-ses-${s.id}`,
            s.title,
            s.speaker_name ? [s.speaker_name, speakerMeta(s)].filter(Boolean).join(' · ') : s.note,
            sessionTime(s),
            i + 1,
          ),
        ),
      }

    case 'zones':
      return {
        ...section,
        items: zoneDeliverables.map((d, i) =>
          item(`af-zone-${d.id}`, d.title, d.content ?? null, null, i + 1),
        ),
      }

    case 'venue': {
      const items: LandingItem[] = []
      if (project.venue) items.push(item('af-venue-name', '장소', project.venue, null, 1))
      const date = formatEventDate(project.event_date)
      if (date) items.push(item('af-venue-date', '일시', heroMetaLine(project), null, 2))
      return { ...section, items }
    }

    default:
      return section
  }
}

/** 랜딩 전체를 조립 — 미리보기·내보내기 직전에 한 번 통과시킨다 */
export function autofillSections(
  sections: LandingSection[],
  src: AutofillSource,
): LandingSection[] {
  return sections.map((s) => autofillSection(s, src))
}
