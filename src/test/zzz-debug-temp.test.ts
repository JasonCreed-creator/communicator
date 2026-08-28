import { describe, expect, it } from 'vitest'
import { MockProvider } from '../providers/mock/MockProvider'
import { PROJECT_ID_REBUILD27 } from '../fixtures/sampleProject'

describe('debug', () => {
  it('prints plan.scenario', async () => {
    const p = new MockProvider()
    const plan = await p.getPlan(PROJECT_ID_REBUILD27)
    const info = {
      scenario: plan.scenario,
      sessions: plan.program_sessions.map((s) => ({ id: s.id, title: s.title })),
    }
    expect(info).toBe(JSON.stringify(info, null, 2))
  })
})
