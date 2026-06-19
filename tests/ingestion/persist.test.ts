import { describe, it, expect, beforeAll } from 'vitest'
import { sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { persist } from '@/ingestion/persist'
import type { PullResult } from '@/ingestion/types'
import { makeTestDb } from '../db'

type Db = Awaited<ReturnType<typeof makeTestDb>>['db']

let db: Db
let orgA: string
let orgB: string

const provider = 'leavo'

// Datas FIXAS (determinístico)
const d = (s: string) => new Date(s)

function makePull(): PullResult {
  return {
    leads: [
      {
        externalId: 'L1',
        channel: 'paid',
        utmSource: 'google',
        utmCampaign: 'camp-1',
        currentStage: 'mql',
        valueCents: 10000,
        lostReason: null,
        createdAt: d('2026-06-01T10:00:00Z'),
        updatedAt: d('2026-06-01T10:00:00Z'),
      },
      {
        externalId: 'L2',
        channel: 'organic',
        utmSource: 'instagram',
        utmCampaign: 'camp-2',
        currentStage: 'leads',
        valueCents: 0,
        lostReason: null,
        createdAt: d('2026-06-02T10:00:00Z'),
        updatedAt: d('2026-06-02T10:00:00Z'),
      },
      {
        externalId: 'L3',
        currentStage: 'vendas',
        valueCents: 50000,
        createdAt: d('2026-06-03T10:00:00Z'),
        updatedAt: d('2026-06-03T10:00:00Z'),
      },
    ],
    stageEvents: [
      { leadExternalId: 'L1', stage: 'leads', occurredAt: d('2026-06-01T10:00:00Z') },
      { leadExternalId: 'L1', stage: 'mql', occurredAt: d('2026-06-01T12:00:00Z') },
      { leadExternalId: 'L3', stage: 'vendas', occurredAt: d('2026-06-03T11:00:00Z') },
      // evento órfão: lead inexistente -> deve ser ignorado
      { leadExternalId: 'GHOST', stage: 'leads', occurredAt: d('2026-06-04T10:00:00Z') },
    ],
    adMetrics: [
      {
        date: d('2026-06-01T00:00:00Z'),
        campaign: 'camp-1',
        creative: 'cr-1',
        channel: 'meta',
        spendCents: 20000,
        impressions: 1000,
        clicks: 100,
        leads: 10,
        sales: 2,
        revenueCents: 80000,
      },
      {
        date: d('2026-06-02T00:00:00Z'),
        campaign: 'camp-2',
        creative: 'cr-2',
        channel: 'google',
        spendCents: 15000,
        impressions: 800,
        clicks: 60,
        leads: 5,
        sales: 1,
        revenueCents: 30000,
      },
    ],
    nextCursor: null,
  }
}

async function counts(orgId: string) {
  const [l] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(sql`${schema.leads.organizationId} = ${orgId}`)
  const [e] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.leadStageEvents)
    .where(sql`${schema.leadStageEvents.organizationId} = ${orgId}`)
  const [m] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.adMetrics)
    .where(sql`${schema.adMetrics.organizationId} = ${orgId}`)
  return { leads: l.n, events: e.n, metrics: m.n }
}

beforeAll(async () => {
  ;({ db } = await makeTestDb())
  const [a] = await db.insert(schema.organizations).values({ name: 'A', slug: 'a' }).returning()
  const [b] = await db.insert(schema.organizations).values({ name: 'B', slug: 'b' }).returning()
  orgA = a.id
  orgB = b.id
})

describe('persist', () => {
  it('grava contagens corretas na primeira execução', async () => {
    await persist(db, orgA, provider, makePull())
    const c = await counts(orgA)
    // 3 leads; 3 eventos válidos (GHOST ignorado); 2 métricas
    expect(c).toEqual({ leads: 3, events: 3, metrics: 2 })
  })

  it('é idempotente: persist com os mesmos dados não duplica', async () => {
    await persist(db, orgA, provider, makePull())
    const c = await counts(orgA)
    expect(c).toEqual({ leads: 3, events: 3, metrics: 2 })
  })

  it('atualiza campo mutável de lead em vez de duplicar', async () => {
    const data = makePull()
    data.leads[0].currentStage = 'vendas'
    data.leads[0].valueCents = 99999
    await persist(db, orgA, provider, data)

    const c = await counts(orgA)
    expect(c.leads).toBe(3)

    const [row] = await db
      .select({ stage: schema.leads.currentStage, value: schema.leads.valueCents })
      .from(schema.leads)
      .where(sql`${schema.leads.organizationId} = ${orgA} and ${schema.leads.externalId} = 'L1'`)
    expect(row.stage).toBe('vendas')
    expect(row.value).toBe(99999)
  })

  it('atualiza campo mutável de adMetric em vez de duplicar', async () => {
    const data = makePull()
    data.adMetrics[0].spendCents = 77777
    await persist(db, orgA, provider, data)

    const c = await counts(orgA)
    expect(c.metrics).toBe(2)

    const [row] = await db
      .select({ spend: schema.adMetrics.spendCents })
      .from(schema.adMetrics)
      .where(
        sql`${schema.adMetrics.organizationId} = ${orgA} and ${schema.adMetrics.campaign} = 'camp-1' and ${schema.adMetrics.creative} = 'cr-1'`,
      )
    expect(row.spend).toBe(77777)
  })

  it('isola por organização: persist numa org não afeta a outra', async () => {
    const before = await counts(orgB)
    expect(before).toEqual({ leads: 0, events: 0, metrics: 0 })

    await persist(db, orgB, provider, makePull())

    const cb = await counts(orgB)
    const ca = await counts(orgA)
    expect(cb).toEqual({ leads: 3, events: 3, metrics: 2 })
    // orgA permanece intacta (3/3/2)
    expect(ca).toEqual({ leads: 3, events: 3, metrics: 2 })
  })
})
