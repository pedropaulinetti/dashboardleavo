import { describe, it, expect, beforeAll } from 'vitest'
import * as schema from '@/db/schema'
import { forOrg } from '@/db/tenant'
import { makeTestDb } from './db'

let db: Awaited<ReturnType<typeof makeTestDb>>['db']
let orgA: string
let orgB: string

beforeAll(async () => {
  ;({ db } = await makeTestDb())
  const [a] = await db.insert(schema.organizations).values({ name: 'A', slug: 'a' }).returning()
  const [b] = await db.insert(schema.organizations).values({ name: 'B', slug: 'b' }).returning()
  orgA = a.id; orgB = b.id
  const now = new Date()
  await db.insert(schema.leads).values([
    { organizationId: orgA, provider: 'leavo', externalId: '1', currentStage: 'leads', createdAt: now, updatedAt: now },
    { organizationId: orgB, provider: 'leavo', externalId: '1', currentStage: 'leads', createdAt: now, updatedAt: now },
  ])
})

describe('tenant scoping', () => {
  it('forOrg(A).leads() retorna só leads da org A', async () => {
    const rows = await forOrg(db, orgA).leads()
    expect(rows).toHaveLength(1)
    expect(rows[0].organizationId).toBe(orgA)
  })
  it('forOrg(B) só enxerga dados da org B', async () => {
    const rows = await forOrg(db, orgB).leads()
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true)
    expect(rows).toHaveLength(1)
  })
})
