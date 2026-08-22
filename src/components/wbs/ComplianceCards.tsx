// v2.0 §4-17 컴플라이언스 카드 2종(내부·고객사 계약 규약) — S5 R&R 옆 배치, 체크는 멤버 전원.
// 온보딩 완료 시 시드되며(§8), 체크 상태는 updateComplianceCard로 왕복한다(DoD 25).
import ErrorAlert from '../internal/ErrorAlert'
import { useProject } from '../../context/ProjectContext'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { ComplianceCard, ComplianceItem } from '../../types/entities'

const provider = getDataProvider()

const KIND_LABELS: Record<ComplianceCard['kind'], string> = {
  internal: '내부',
  client: '고객사',
}

const KIND_PILL: Record<ComplianceCard['kind'], string> = {
  internal: 'bg-steel-tint text-steel',
  client: 'bg-accent-tint text-accent-deep',
}

export default function ComplianceCards() {
  const { projectId } = useProject()
  const cards = useAsync(() => provider.listComplianceCards(projectId), [projectId])
  const update = useMutation((cardId: string, items: ComplianceItem[]) =>
    provider.updateComplianceCard(cardId, { items }),
  )

  const toggle = async (card: ComplianceCard, idx: number) => {
    const items = card.items.map((item, i) => (i === idx ? { ...item, checked: !item.checked } : item))
    const result = await update.run(card.id, items)
    if (result) cards.reload()
  }

  if (cards.loading) return <p className="text-sm text-ink-cap">불러오는 중…</p>

  return (
    <div className="space-y-4">
      <ErrorAlert message={cards.error} />
      <ErrorAlert message={update.error} />
      {(cards.data ?? []).length === 0 && (
        <p className="text-sm text-ink-cap">온보딩 완료 시 규약 카드가 자동으로 시드됩니다.</p>
      )}
      {(cards.data ?? []).map((card) => {
        const done = card.items.filter((item) => item.checked).length
        return (
          <div key={card.id} className="rounded-[10px] border border-border p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_PILL[card.kind]}`}>
                {KIND_LABELS[card.kind]}
              </span>
              <p className="t-card-title">{card.title}</p>
              <span className="ml-auto text-xs text-ink-cap">
                {done}/{card.items.length}
              </span>
            </div>
            <ul className="space-y-1.5">
              {card.items.map((item, idx) => (
                <li key={idx}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => void toggle(card, idx)}
                      disabled={update.pending}
                      className="mt-0.5"
                    />
                    <span className={item.checked ? 'text-ink-cap line-through' : 'text-ink-sub'}>{item.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
