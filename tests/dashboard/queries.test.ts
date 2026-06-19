import { describe, it, expect, beforeAll } from 'vitest'
import * as schema from '@/db/schema'
import { getFunnelCounts, getFunnel, getHighlights } from '@/dashboard/queries'
import { makeTestDb } from '../db'

type Db = Awaited<ReturnType<typeof makeTestDb>>['db']

let db: Db
let org: string
let otherOrg: string

// Ranges determinísticos
const cur = { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-06-30T23:59:59Z') }
const prev = { from: new Date('2026-05-01T00:00:00Z'), to: new Date('2026-05-31T23:59:59Z') }
// Range vazio para o período anterior (sem dados) -> deltas null
const emptyPrev = { from: new Date('2026-04-01T00:00:00Z'), to: new Date('2026-04-30T23:59:59Z') }

const d = (iso: string) => new Date(iso)

async function seedLead(opts: {
  ext: string
  channel: string
  createdAt: Date
  value?: number
  stages: { stage: string; at: Date }[]
  organizationId?: string
}) {
  const orgId = opts.organizationId ?? org
  const [lead] = await db
    .insert(schema.leads)
    .values({
      organizationId: orgId,
      provider: 'leavo',
      externalId: opts.ext,
      channel: opts.channel,
      currentStage: opts.stages[opts.stages.length - 1]?.stage ?? 'leads',
      valueCents: opts.value ?? 0,
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
    })
    .returning()
  if (opts.stages.length) {
    await db.insert(schema.leadStageEvents).values(
      opts.stages.map((s) => ({
        organizationId: orgId,
        leadId: lead.id,
        stage: s.stage,
        occurredAt: s.at,
      })),
    )
  }
  return lead
}

const ALL = ['leads', 'mql', 'agendadas', 'realizadas', 'negociacoes', 'vendas']
const full = (at: Date) => ALL.map((stage) => ({ stage, at }))
const upTo = (n: number, at: Date) => ALL.slice(0, n).map((stage) => ({ stage, at }))

beforeAll(async () => {
  ;({ db } = await makeTestDb())
  const [o] = await db.insert(schema.organizations).values({ name: 'Org', slug: 'org' }).returning()
  const [o2] = await db.insert(schema.organizations).values({ name: 'Other', slug: 'other' }).returning()
  org = o.id
  otherOrg = o2.id

  const jun = d('2026-06-10T12:00:00Z')
  const may = d('2026-05-10T12:00:00Z')

  // --- Período atual (junho) ---
  await seedLead({ ext: 'L1', channel: 'meta', createdAt: jun, value: 100000, stages: full(jun) })
  await seedLead({ ext: 'L2', channel: 'meta', createdAt: jun, stages: upTo(3, jun) }) // até agendadas
  await seedLead({ ext: 'L3', channel: 'google', createdAt: jun, stages: upTo(2, jun) }) // até mql
  await seedLead({ ext: 'L4', channel: 'meta', createdAt: jun, stages: upTo(1, jun) }) // só leads
  await seedLead({ ext: 'L5', channel: 'meta', createdAt: jun, value: 50000, stages: full(jun) })

  // --- Período anterior (maio): 1 lead full, channel meta, value 40000 ---
  await seedLead({ ext: 'M1', channel: 'meta', createdAt: may, value: 40000, stages: full(may) })

  // --- Outra org: ruído que NÃO deve aparecer ---
  await seedLead({ ext: 'X1', channel: 'meta', createdAt: jun, value: 999999, stages: full(jun), organizationId: otherOrg })

  // --- Ad metrics ---
  await db.insert(schema.adMetrics).values([
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-05'), campaign: 'c1', creative: 'cr1', channel: 'meta', spendCents: 30000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-15'), campaign: 'c2', creative: 'cr2', channel: 'meta', spendCents: 20000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-20'), campaign: 'c3', creative: 'cr3', channel: 'google', spendCents: 10000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-05-10'), campaign: 'c4', creative: 'cr4', channel: 'meta', spendCents: 25000 },
    // outra org -> ruído
    { organizationId: otherOrg, provider: 'meta_ads', date: d('2026-06-05'), campaign: 'z', creative: 'z', channel: 'meta', spendCents: 777777 },
  ])
})

describe('getFunnelCounts', () => {
  it('retorna a curva monotônica do período atual (channel=all)', async () => {
    const counts = await getFunnelCounts(db, org, { ...cur, channel: 'all' })
    expect(counts).toEqual([5, 4, 3, 2, 2, 2])
  })

  it('filtra por canal', async () => {
    const counts = await getFunnelCounts(db, org, { ...cur, channel: 'meta' })
    expect(counts).toEqual([4, 3, 3, 2, 2, 2])
  })

  it('não vaza dados de outra org', async () => {
    const counts = await getFunnelCounts(db, otherOrg, { ...cur, channel: 'all' })
    expect(counts).toEqual([1, 1, 1, 1, 1, 1])
  })
})

describe('getFunnel', () => {
  it('convGeral = vendas / leads', async () => {
    const { counts, convGeral } = await getFunnel(db, org, { ...cur, channel: 'all' })
    expect(counts).toEqual([5, 4, 3, 2, 2, 2])
    expect(convGeral).toBe(2 / 5)
  })
})

describe('getHighlights', () => {
  it('calcula receita, vendas, invest, roas e deltas vs anterior', async () => {
    const h = await getHighlights(db, org, { ...cur, channel: 'all' }, { ...prev, channel: 'all' })
    // atual
    expect(h.receitaCents).toBe(150000)
    expect(h.vendas).toBe(2)
    expect(h.investCents).toBe(60000)
    expect(h.roas).toBe(150000 / 60000)
    // deltas vs maio (receita 40000, vendas 1, invest 25000, roas 40000/25000)
    expect(h.deltas.receita).toBeCloseTo((150000 - 40000) / 40000, 10)
    expect(h.deltas.vendas).toBeCloseTo((2 - 1) / 1, 10)
    expect(h.deltas.invest).toBeCloseTo((60000 - 25000) / 25000, 10)
    const roasPrev = 40000 / 25000
    expect(h.deltas.roas).toBeCloseTo((150000 / 60000 - roasPrev) / roasPrev, 10)
  })

  it('deltas null quando período anterior vazio', async () => {
    const h = await getHighlights(db, org, { ...cur, channel: 'all' }, { ...emptyPrev, channel: 'all' })
    expect(h.deltas.receita).toBeNull()
    expect(h.deltas.vendas).toBeNull()
    expect(h.deltas.invest).toBeNull()
    expect(h.deltas.roas).toBeNull()
  })
})
