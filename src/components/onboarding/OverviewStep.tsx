// S0 ①단계 — 행사 기본개요: 행사명·행사일·주제·장소·사회자.
// updateProject(name·event_date, pm 전용) + updateProjectOverview(주제·장소·사회자, pm·ops)로 저장.
import { useState, type FormEvent } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import { PROJECT_ID } from '../../fixtures/sampleProject'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { Project } from '../../types/entities'

const provider = getDataProvider()

export default function OverviewStep({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [name, setName] = useState(project.name)
  const [eventDate, setEventDate] = useState(project.event_date ?? '')
  const [theme, setTheme] = useState(project.theme ?? '')
  const [venue, setVenue] = useState(project.venue ?? '')
  const [mcName, setMcName] = useState(project.mc_name ?? '')

  const save = useMutation(async () => {
    await provider.updateProject(PROJECT_ID, { name: name.trim(), event_date: eventDate || null })
    await provider.updateProjectOverview(PROJECT_ID, {
      theme: theme.trim() || null,
      venue: venue.trim() || null,
      mc_name: mcName.trim() || null,
    })
    return true
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      save.setError('행사명은 비울 수 없습니다.')
      return
    }
    const ok = await save.run()
    if (ok) onSaved()
  }

  return (
    <Card title="① 행사 기본개요">
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            행사명
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            행사일
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            주제
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            장소
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500 sm:col-span-2">
            사회자
            <input
              value={mcName}
              onChange={(e) => setMcName(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
        </div>

        <ErrorAlert message={save.error} />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={save.pending}
            className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            다음
          </button>
        </div>
      </form>
    </Card>
  )
}
