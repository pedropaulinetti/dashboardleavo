import { describe, it, expect, beforeAll } from 'vitest'
import * as schema from '@/db/schema'
import { getTimeSeries } from '@/dashboard/queries'
import { makeTestDb } from '../db'

type Db = Awaited<ReturnType<typeof makeTestDb>>['db']

let db: Db
let org: string
let otherOrg: string

const d = (iso: string) => new Date(iso)

const ALL = ['leads', 'mql', 'agendadas', 'realizadas', 'negociacoes', 'vendas']
const full = (at: Date) => ALL.map((stage) => ({ stage, at }))
const upTo = (n: number, at: Date) => ALL.slice(0, n).map((stage) => ({ stage, at }))

async function seedLead(opts: {
  ext: string
  channel: string
  createdAt: Date
  organizationId: string
  stages: { stage: string; at: Date }[]
  identityKey?: string
  provider?: 'leavo' | 'datacrazy' | 'meta_ads' | 'webhook'
}) {
  const [lead] = await db
    .insert(schema.leads)
    .values({
      organizationId: opts.organizationId,
      provider: opts.provider ?? 'leavo',
      externalId: opts.ext,
      identityKey: opts.identityKey ?? null,
      channel: opts.channel,
      currentStage: opts.stages[opts.stages.length - 1]?.stage ?? 'leads',
      valueCents: 0,
      createdAt: opts.createdAt,
      updatedAt: opts.createdAt,
    })
    .returning()
  if (opts.stages.length) {
    await db.insert(schema.leadStageEvents).values(
      opts.stages.map((s) => ({
        organizationId: opts.organizationId,
        leadId: lead.id,
        stage: s.stage,
        occurredAt: s.at,
      })),
    )
  }
  return lead
}

beforeAll(async () => {
  ;({ db } = await makeTestDb())
  const [o] = await db.insert(schema.organizations).values({ name: 'Org', slug: 'org' }).returning()
  const [o2] = await db.insert(schema.organizations).values({ name: 'Other', slug: 'other' }).returning()
  org = o.id
  otherOrg = o2.id

  const may = d('2026-05-10T12:00:00Z')
  const jun = d('2026-06-10T12:00:00Z')
  const jun2 = d('2026-06-20T12:00:00Z')

  // --- Maio: 2 leads, 1 full (vendas), 1 até agendadas ---
  await seedLead({ ext: 'M1', channel: 'meta', createdAt: may, organizationId: org, stages: full(may) })
  await seedLead({ ext: 'M2', channel: 'google', createdAt: may, organizationId: org, stages: upTo(3, may) }) // leads, mql, agendadas

  // --- Junho dia 10: 2 leads meta full; dia 20: 1 lead google até realizadas ---
  await seedLead({ ext: 'J1', channel: 'meta', createdAt: jun, organizationId: org, stages: full(jun) })
  await seedLead({ ext: 'J2', channel: 'meta', createdAt: jun, organizationId: org, stages: upTo(4, jun) }) // até realizadas
  await seedLead({ ext: 'J3', channel: 'google', createdAt: jun2, organizationId: org, stages: upTo(4, jun2) }) // até realizadas

  // --- Outra org: ruído ---
  await seedLead({ ext: 'X1', channel: 'meta', createdAt: jun, organizationId: otherOrg, stages: full(jun) })

  // --- Ad metrics: maio 25000, junho dia 5 -> 30000, junho dia 15 -> 20000 (meta);
  //     junho dia 20 -> 10000 (google) ---
  await db.insert(schema.adMetrics).values([
    { organizationId: org, provider: 'meta_ads', date: d('2026-05-10'), campaign: 'c0', creative: 'cr0', channel: 'meta', spendCents: 25000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-05'), campaign: 'c1', creative: 'cr1', channel: 'meta', spendCents: 30000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-15'), campaign: 'c2', creative: 'cr2', channel: 'meta', spendCents: 20000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-20'), campaign: 'c3', creative: 'cr3', channel: 'google', spendCents: 10000 },
    // outra org -> ruído
    { organizationId: otherOrg, provider: 'meta_ads', date: d('2026-06-05'), campaign: 'z', creative: 'z', channel: 'meta', spendCents: 777777 },
  ])
})

describe('getTimeSeries (month)', () => {
  it('agrega por mês com contagens por etapa e spend somado, preenchendo buckets vazios', async () => {
    // Range cobre abril..junho (3 buckets mensais; abril vazio).
    const series = await getTimeSeries(db, org, {
      from: d('2026-04-01T00:00:00Z'),
      to: d('2026-06-30T23:59:59Z'),
      channel: 'all',
      granularity: 'month',
    })
    expect(series.map((p) => p.period)).toEqual(['2026-04-01', '2026-05-01', '2026-06-01'])

    const byPeriod = new Map(series.map((p) => [p.period, p]))

    // abril: tudo zero (sem dados)
    const abr = byPeriod.get('2026-04-01')!
    expect(abr).toEqual({ period: '2026-04-01', leads: 0, agendadas: 0, realizadas: 0, vendas: 0, spendCents: 0 })

    // maio: M1 (full) + M2 (até agendadas) -> leads 2, agendadas 2, realizadas 1, vendas 1; spend 25000
    const mai = byPeriod.get('2026-05-01')!
    expect(mai.leads).toBe(2)
    expect(mai.agendadas).toBe(2)
    expect(mai.realizadas).toBe(1)
    expect(mai.vendas).toBe(1)
    expect(mai.spendCents).toBe(25000)

    // junho: J1 (full), J2 (até realizadas), J3 (até realizadas) -> leads 3, agendadas 3,
    //   realizadas 3, vendas 1; spend 30000+20000+10000 = 60000
    const jun = byPeriod.get('2026-06-01')!
    expect(jun.leads).toBe(3)
    expect(jun.agendadas).toBe(3)
    expect(jun.realizadas).toBe(3)
    expect(jun.vendas).toBe(1)
    expect(jun.spendCents).toBe(60000)
  })

  it('isola por organização', async () => {
    const series = await getTimeSeries(db, otherOrg, {
      from: d('2026-06-01T00:00:00Z'),
      to: d('2026-06-30T23:59:59Z'),
      channel: 'all',
      granularity: 'month',
    })
    expect(series.length).toBe(1)
    const jun = series[0]
    // só o lead X1 (full) e o spend 777777
    expect(jun.leads).toBe(1)
    expect(jun.vendas).toBe(1)
    expect(jun.spendCents).toBe(777777)
  })

  it('filtra por canal, reduzindo as contagens e o spend', async () => {
    const series = await getTimeSeries(db, org, {
      from: d('2026-06-01T00:00:00Z'),
      to: d('2026-06-30T23:59:59Z'),
      channel: 'meta',
      granularity: 'month',
    })
    const jun = series[0]
    // canal meta: J1 (full), J2 (até realizadas). J3 (google) fora.
    expect(jun.leads).toBe(2)
    expect(jun.agendadas).toBe(2)
    expect(jun.realizadas).toBe(2)
    expect(jun.vendas).toBe(1)
    // spend meta: 30000 + 20000 = 50000 (o 10000 de google fora)
    expect(jun.spendCents).toBe(50000)
  })
})

describe('getTimeSeries (day)', () => {
  it('agrega por dia com buckets diários corretos, vazios com 0', async () => {
    const series = await getTimeSeries(db, org, {
      from: d('2026-06-10T00:00:00Z'),
      to: d('2026-06-20T23:59:59Z'),
      channel: 'all',
      granularity: 'day',
    })
    // 11 buckets: dia 10 ao dia 20
    expect(series.length).toBe(11)
    expect(series[0].period).toBe('2026-06-10')
    expect(series[series.length - 1].period).toBe('2026-06-20')

    const byPeriod = new Map(series.map((p) => [p.period, p]))
    // dia 10: J1 (full) + J2 (até realizadas) -> leads 2, realizadas 2, vendas 1
    const dia10 = byPeriod.get('2026-06-10')!
    expect(dia10.leads).toBe(2)
    expect(dia10.realizadas).toBe(2)
    expect(dia10.vendas).toBe(1)
    // dia 20: J3 (até realizadas) -> leads 1, realizadas 1, vendas 0; spend 10000
    const dia20 = byPeriod.get('2026-06-20')!
    expect(dia20.leads).toBe(1)
    expect(dia20.realizadas).toBe(1)
    expect(dia20.vendas).toBe(0)
    expect(dia20.spendCents).toBe(10000)
    // dia 12: vazio
    const dia12 = byPeriod.get('2026-06-12')!
    expect(dia12).toEqual({ period: '2026-06-12', leads: 0, agendadas: 0, realizadas: 0, vendas: 0, spendCents: 0 })
  })
})
