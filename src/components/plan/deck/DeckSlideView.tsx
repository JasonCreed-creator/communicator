// 16:9 장표 한 장 — 설계서 v2.13.2 §23.7 · 디자인지시서 §7-2.15.
// 1280×720 CSS px 고정 틀(인쇄 338.67mm×190.5mm) — 화면에서는 바깥이 zoom으로 줄인다.
// 틀 = 오렌지 헤어라인 · 머리 줄(행사명 · 장) · 제목(장 번호 · 제목 · 보조 줄 · n/m) · 본문 · 꼬리 줄(버전 · 출력 · 쪽).
// 높이 칸은 planDeck.ts의 쪽 나누기 어림과 같은 값을 쓴다(머리 52 · 제목 76 · 꼬리 48 · 표 줄 20 + 15).
import type { ReactNode } from 'react'
import { ddayLabel, formatDateWeekday } from '../../../lib/labels'
import type { Project } from '../../../types/entities'
import {
  DECK_CHAPTERS,
  DECK_SIZE,
  type DeckChecklistCard,
  type DeckColumn,
  type DeckFlowItem,
  type DeckSlide,
  type DeckTableRow,
  type DeckTile,
  type DeckTocEntry,
} from './planDeck'

export interface DeckMeta {
  project: Project
  versionLabel: string
  printedAt: string
  authorLabel: string
  total: number
  today: Date
}

export default function DeckSlideView({ slide, no, meta }: { slide: DeckSlide; no: number; meta: DeckMeta }) {
  const label = `${no}쪽 — ${slideLabel(slide)}`
  if (slide.kind === 'cover') {
    return (
      <SlideFrame label={label} no={no} meta={meta} chapter={null} bare>
        <CoverBody meta={meta} />
      </SlideFrame>
    )
  }
  return (
    <SlideFrame label={label} no={no} meta={meta} chapter={slide.chapter} chapterLabel={chapterLabel(slide)}>
      <SlideTitle slide={slide} />
      <div data-testid="deck-body" className="relative min-h-0 flex-1 overflow-hidden px-16 pb-4">
        <SlideBody slide={slide} />
      </div>
    </SlideFrame>
  )
}

function slideLabel(slide: DeckSlide): string {
  if (slide.kind === 'cover') return '표지'
  const part = slide.part ? ` ${slide.part.index}/${slide.part.total}` : ''
  return `${slide.title}${part}`
}

function chapterLabel(slide: DeckSlide): string | null {
  if (!slide.chapter) return null
  const c = DECK_CHAPTERS[slide.chapter]
  return c.number ? `${c.number} ${c.title}` : c.title
}

function SlideFrame({
  label,
  no,
  meta,
  chapter,
  chapterLabel,
  bare = false,
  children,
}: {
  label: string
  no: number
  meta: DeckMeta
  chapter: DeckSlide['chapter']
  chapterLabel?: string | null
  bare?: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-label={label}
      data-testid="deck-slide"
      data-chapter={chapter ?? undefined}
      className="deck-slide relative flex flex-col overflow-hidden rounded-md bg-card text-ink shadow-card"
      style={{ width: DECK_SIZE.width, height: DECK_SIZE.height }}
    >
      <div aria-hidden className="h-1 shrink-0 bg-accent" />
      {!bare && (
        <div className="flex h-[52px] shrink-0 items-end justify-between gap-6 px-16 pb-3 text-[12px] tracking-[.04em] text-ink-cap">
          <span className="truncate">{meta.project.name} · 운영계획서</span>
          <span className="shrink-0">{chapterLabel}</span>
        </div>
      )}
      {children}
      <div className="flex h-12 shrink-0 items-center justify-between gap-6 border-t border-border px-16 text-[12px] tracking-[.04em] text-ink-cap">
        <span className="truncate">
          {bare ? `${meta.project.name} · 운영계획서` : `${meta.versionLabel} · ${meta.printedAt} 출력`}
        </span>
        <span className="shrink-0 tabular-nums">
          {no} / {meta.total}
        </span>
      </div>
    </section>
  )
}

function SlideTitle({ slide }: { slide: Exclude<DeckSlide, { kind: 'cover' }> }) {
  const chapter = slide.chapter ? DECK_CHAPTERS[slide.chapter] : null
  const emergency = 'tone' in slide && slide.tone === 'emergency'
  return (
    <div className="flex h-[76px] shrink-0 items-center gap-4 px-16">
      {chapter?.number && (
        <span
          className={
            emergency
              ? 'inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-negative text-[15px] font-bold text-white'
              : 'shrink-0 text-[34px] font-light leading-none text-brown opacity-50'
          }
        >
          {chapter.number}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-baseline gap-3">
          <h2 className={`m-0 truncate text-[28px] font-semibold leading-[1.2] tracking-[-.01em] ${emergency ? 'text-negative' : 'text-ink'}`}>
            {slide.title}
          </h2>
          {slide.subtitle && <span className="shrink-0 text-[15px] text-ink-sub">{slide.subtitle}</span>}
          {slide.part && (
            <span className="shrink-0 rounded-full bg-track px-2 py-0.5 text-[12px] font-medium text-ink-sub tabular-nums">
              {slide.part.index}/{slide.part.total}
            </span>
          )}
        </div>
        <span aria-hidden className={`h-[2.5px] w-[26px] rounded-sm ${emergency ? 'bg-negative' : 'bg-accent'}`} />
      </div>
    </div>
  )
}

function SlideBody({ slide }: { slide: Exclude<DeckSlide, { kind: 'cover' }> }) {
  switch (slide.kind) {
    case 'toc':
      return <TocBody entries={slide.entries} />
    case 'summary':
      return <SummaryBody tiles={slide.tiles} line={slide.line} />
    case 'facts':
      return <FactsBody facts={slide.facts} items={slide.items} />
    case 'table':
      return (
        <TableBody
          columns={slide.columns}
          rows={slide.rows}
          notes={slide.notes}
          chain={slide.chain}
          legend={slide.legend}
          tone={slide.tone}
        />
      )
    case 'flow':
      return <FlowBody items={slide.items} />
    case 'registration':
      return <RegistrationBody stats={slide.stats} capacity={slide.capacity} notes={slide.notes} caption={slide.caption} />
    case 'checklists':
      return <ChecklistsBody cards={slide.cards} />
    case 'empty':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-center">
          <p className="m-0 text-[17px] font-semibold text-ink-sub">아직 채운 내용이 없습니다</p>
          <p className="m-0 max-w-[640px] text-[14px] leading-relaxed text-ink-cap">{slide.message}</p>
        </div>
      )
  }
}

// ── 표지 ──────────────────────────────────────────────────────────────

function CoverBody({ meta }: { meta: DeckMeta }) {
  const p = meta.project
  const date = p.event_date
    ? p.event_end_date && p.event_end_date !== p.event_date
      ? `${formatDateWeekday(p.event_date)} ~ ${formatDateWeekday(p.event_end_date)}`
      : formatDateWeekday(p.event_date)
    : null
  const time = p.start_time && p.end_time ? `${p.start_time}–${p.end_time}` : null
  const line = [date, time, p.venue].filter(Boolean).join(' · ')
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between px-16 pb-10 pt-16">
      <div className="flex items-start justify-between gap-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="h-[2.5px] w-[26px] rounded-sm bg-accent" />
            <span className="text-[13px] font-semibold tracking-[.14em] text-ink-cap">OPERATION PLAN</span>
          </div>
          <h1 className="m-0 mt-6 text-[64px] font-semibold leading-[1.1] tracking-[-.02em] text-ink">운영계획서</h1>
          <p className="m-0 mt-4 text-[30px] font-semibold leading-[1.3] text-brown">{p.name}</p>
          {line && <p className="m-0 mt-3 text-[18px] leading-relaxed text-ink-sub">{line}</p>}
        </div>
        {p.event_date && (
          <div className="shrink-0 text-right">
            <div className="text-[56px] font-light leading-none text-accent-deep tabular-nums">{ddayLabel(p.event_date, meta.today)}</div>
            <div className="mt-2 text-[13px] text-ink-cap">{meta.printedAt} 기준</div>
          </div>
        )}
      </div>
      <dl className="m-0 grid grid-cols-4 gap-6 border-t border-border pt-6">
        <CoverField label="주최 · 주관" value={p.organizer ?? '—'} />
        <CoverField label="작성" value={meta.authorLabel} />
        <CoverField label="문서 버전" value={meta.versionLabel} note="컨펌 스냅숏 기준" />
        <CoverField label="출력" value={meta.printedAt} note={`전 ${meta.total}장`} />
      </dl>
    </div>
  )
}

function CoverField({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium tracking-[.04em] text-ink-cap">{label}</dt>
      <dd className="m-0 mt-1.5 truncate text-[16px] text-ink">{value}</dd>
      {note && <dd className="m-0 text-[12px] text-ink-cap">{note}</dd>}
    </div>
  )
}

// ── 목차 ──────────────────────────────────────────────────────────────

function TocBody({ entries }: { entries: DeckTocEntry[] }) {
  return (
    <ol className="m-0 grid list-none grid-flow-col grid-cols-2 grid-rows-4 gap-x-12 gap-y-1 p-0">
      {entries.map((e) => (
        <li
          key={e.chapter}
          data-testid="deck-toc-entry"
          data-chapter={e.chapter}
          data-slide-no={e.slideNo}
          className="flex items-start gap-4 border-b border-border py-3"
        >
          <span className="w-10 shrink-0 text-[26px] font-light leading-none text-brown opacity-50">{e.number ?? '—'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-[18px] font-semibold ${e.empty ? 'text-ink-cap' : 'text-ink'}`}>{e.title}</span>
              <span className="shrink-0 text-[14px] text-ink-cap tabular-nums">{e.slideNo}</span>
            </div>
            <p className="m-0 mt-1 truncate text-[13px] text-ink-sub">
              {e.empty ? '아직 채운 내용 없음' : e.items.join(' · ')}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── 운영 요약 ─────────────────────────────────────────────────────────

function Tile({ tile, big = false }: { tile: DeckTile; big?: boolean }) {
  return (
    <div className="rounded-lg bg-canvas px-6 py-5">
      <div className="text-[13px] font-medium tracking-[.04em] text-ink-cap">{tile.label}</div>
      <div
        className={`mt-2 font-semibold leading-none tracking-[-.01em] tabular-nums ${big ? 'text-[40px]' : 'text-[30px]'} ${
          tile.empty ? 'text-ink-cap' : 'text-ink'
        }`}
      >
        {tile.value}
      </div>
      <div className="mt-2.5 truncate text-[13px] text-ink-sub">{tile.sub}</div>
    </div>
  )
}

function SummaryBody({ tiles, line }: { tiles: DeckTile[]; line: string | null }) {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        {tiles.map((t) => (
          <Tile key={t.label} tile={t} big />
        ))}
      </div>
      {line && <p className="m-0 text-[14px] text-ink-sub">{line}</p>}
    </div>
  )
}

// ── 행사 개요 ─────────────────────────────────────────────────────────

function FactsBody({ facts, items }: { facts: { label: string; value: string }[]; items: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-col gap-6">
      <dl className="m-0 grid grid-cols-2 gap-x-12">
        {facts.map((f) => (
          <div key={f.label} className="flex min-h-14 items-center gap-6 border-b border-border py-2">
            <dt className="w-24 shrink-0 text-[13px] text-ink-cap">{f.label}</dt>
            <dd className="m-0 min-w-0 text-[17px] leading-6 text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>
      {items.length > 0 && (
        <ul className="m-0 list-disc space-y-1 pl-6 text-[15px] leading-[25px] text-ink-sub">
          {items.map((it, i) => (
            <li key={i}>
              <span className="font-medium text-ink">{it.label}</span> — {it.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── 표 ───────────────────────────────────────────────────────────────

const MARK_CLASS: Record<string, string> = { '●': 'text-accent-deep', '○': 'text-steel', '—': 'text-border-strong' }

function TableBody({
  columns,
  rows,
  notes,
  chain,
  legend,
  tone,
}: {
  columns: DeckColumn[]
  rows: DeckTableRow[]
  notes: string[]
  chain: string[]
  legend: string | null
  tone: 'default' | 'emergency'
}) {
  return (
    <div className="relative">
      {legend && <p className="absolute -top-7 right-0 m-0 text-[12px] text-ink-cap">{legend}</p>}
      <table className="w-full table-fixed border-collapse text-[13px] leading-5">
        <colgroup>
          {columns.map((c) => (
            <col key={c.label} style={{ width: `${c.width * 100}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.label}
                scope="col"
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-[12px] font-semibold tracking-[.02em] text-ink-cap ${
                  tone === 'emergency' ? 'border-negative' : 'border-border-strong'
                } ${alignClass(c)}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) =>
            'band' in row ? (
              <tr key={`band-${i}`}>
                <td colSpan={columns.length} className="bg-track px-3 py-[7.5px] text-[12px] font-semibold text-brown">
                  {row.band}
                </td>
              </tr>
            ) : (
              <tr key={i} className="border-b border-border">
                {row.cells.map((cell, j) => {
                  const c = columns[j]
                  return (
                    <td
                      key={j}
                      className={`px-3 py-[7.5px] align-top ${alignClass(c)} ${c?.nowrap ? 'whitespace-nowrap' : 'break-words'} ${
                        c?.mark ? `text-[15px] ${MARK_CLASS[cell] ?? 'text-ink'}` : c?.strong ? 'font-medium text-ink' : 'text-ink-sub'
                      }`}
                    >
                      {cell}
                    </td>
                  )
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
      {chain.length > 0 && (
        <div className="mt-3.5 flex h-10 flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink-cap">지휘 흐름</span>
          {chain.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-ink-cap">→</span>}
              <span className="rounded-full bg-steel-tint px-3 py-1 text-steel">{c}</span>
            </span>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <ul className="m-0 mt-3.5 list-none space-y-0 p-0 text-[13px] leading-[22px] text-ink-sub">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function alignClass(c: DeckColumn | undefined): string {
  if (!c) return 'text-left'
  return c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : 'text-left'
}

// ── 글 ───────────────────────────────────────────────────────────────

function FlowBody({ items }: { items: DeckFlowItem[] }) {
  return (
    <div className="text-[15px] leading-[25px]">
      {items.map((it, i) =>
        it.type === 'h' ? (
          <h3 key={i} className="m-0 flex h-9 items-end pb-1.5 text-[16px] font-semibold text-ink">
            {it.text}
          </h3>
        ) : it.type === 'li' ? (
          <p key={i} className="relative m-0 mb-1 pl-[22px] text-ink-sub">
            <span aria-hidden className="absolute left-1.5 top-[11px] size-[5px] rounded-full bg-border-strong" />
            {it.text}
          </p>
        ) : (
          <p key={i} className="m-0 mb-1 text-ink-sub">
            {it.text}
          </p>
        ),
      )}
    </div>
  )
}

// ── 등록 운영 ─────────────────────────────────────────────────────────

function RegistrationBody({
  stats,
  capacity,
  notes,
  caption,
}: {
  stats: DeckTile[]
  capacity: DeckTile[]
  notes: string[]
  caption: string | null
}) {
  return (
    <div className="flex flex-col gap-5">
      {stats.length > 0 && (
        <div>
          <h3 className="m-0 mb-2 text-[13px] font-semibold text-ink-cap">등록 현황</h3>
          <div className="grid grid-cols-3 gap-4">
            {stats.map((t) => (
              <Tile key={t.label} tile={t} />
            ))}
          </div>
        </div>
      )}
      {capacity.length > 0 && (
        <div>
          <h3 className="m-0 mb-2 text-[13px] font-semibold text-ink-cap">접수 처리 용량</h3>
          <div className="grid grid-cols-3 gap-4">
            {capacity.map((t) => (
              <Tile key={t.label} tile={t} />
            ))}
          </div>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="m-0 list-disc space-y-0.5 pl-5 text-[13px] leading-[22px] text-ink-sub">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {caption && <p className="m-0 text-[12px] text-ink-cap">{caption}</p>}
    </div>
  )
}

// ── 구간별 체크리스트 ─────────────────────────────────────────────────

function ChecklistsBody({ cards }: { cards: DeckChecklistCard[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card, i) => (
        <article key={i} className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="m-0 truncate text-[15px] font-semibold text-ink">
              {card.title}
              {card.continued && <span className="ml-1 text-[12px] font-normal text-ink-cap">(이어서)</span>}
            </h3>
            {card.span && <span className="shrink-0 rounded-full bg-track px-2 py-0.5 text-[12px] text-ink-sub">{card.span}</span>}
          </div>
          {card.items.length === 0 ? (
            <p className="m-0 text-[13px] text-ink-cap">항목 없음</p>
          ) : (
            <ul className="m-0 list-none space-y-0 p-0 text-[13px] leading-[22px] text-ink-sub">
              {card.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  {card.style === 'check' ? (
                    <span aria-hidden className="mt-[5px] size-3 shrink-0 rounded-[3px] border border-border-strong" />
                  ) : (
                    <span className="w-[60px] shrink-0 whitespace-nowrap font-medium text-brown tabular-nums">{it.at || '—'}</span>
                  )}
                  <span className="min-w-0 break-words">{it.text}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  )
}
