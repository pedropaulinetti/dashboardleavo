import { describe, it, expect, beforeAll } from 'vitest'
import * as schema from '@/db/schema'
import {
  getFunnelCounts,
  getFunnel,
  getHighlights,
  getCostCards,
  getUtmRanking,
  getCreatives,
  getLossReasons,
  getDashboardData,
} from '@/dashboard/queries'
import { LOSS_REASONS } from '@/dashboard/loss-reasons'
import { makeTestDb } from '../db'

type Db = Awaited<ReturnType<typeof makeTestDb>>['db']

let db: Db
let org: string
let otherOrg: string
let costOrg: string
let lossOrg: string
let roasOrg: string
let utmRegOrg: string
let identityOrg: string
let creativeOrg: string
let cycleOrg: string

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
  utmSource?: string
  utmCampaign?: string
  creative?: string
  lostReason?: string
  provider?: 'leavo' | 'datacrazy' | 'meta_ads' | 'webhook'
  identityKey?: string
}) {
  const orgId = opts.organizationId ?? org
  const [lead] = await db
    .insert(schema.leads)
    .values({
      organizationId: orgId,
      provider: opts.provider ?? 'leavo',
      externalId: opts.ext,
      identityKey: opts.identityKey ?? null,
      channel: opts.channel,
      utmSource: opts.utmSource ?? null,
      utmCampaign: opts.utmCampaign ?? null,
      creative: opts.creative ?? null,
      currentStage: opts.stages[opts.stages.length - 1]?.stage ?? 'leads',
      valueCents: opts.value ?? 0,
      lostReason: opts.lostReason ?? null,
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
  const [o3] = await db.insert(schema.organizations).values({ name: 'Cost', slug: 'cost' }).returning()
  const [o4] = await db.insert(schema.organizations).values({ name: 'Loss', slug: 'loss' }).returning()
  const [o5] = await db.insert(schema.organizations).values({ name: 'Roas', slug: 'roas' }).returning()
  const [o6] = await db.insert(schema.organizations).values({ name: 'UtmReg', slug: 'utmreg' }).returning()
  const [o7] = await db.insert(schema.organizations).values({ name: 'Identity', slug: 'identity' }).returning()
  const [o8] = await db.insert(schema.organizations).values({ name: 'Creative', slug: 'creative' }).returning()
  const [o9] = await db.insert(schema.organizations).values({ name: 'Cycle', slug: 'cycle' }).returning()
  org = o.id
  otherOrg = o2.id
  costOrg = o3.id
  lossOrg = o4.id
  roasOrg = o5.id
  utmRegOrg = o6.id
  identityOrg = o7.id
  creativeOrg = o8.id
  cycleOrg = o9.id

  const jun = d('2026-06-10T12:00:00Z')
  const may = d('2026-05-10T12:00:00Z')

  // --- Período atual (junho) ---
  // utmCampaign casa com ad_metrics.campaign p/ testar CPL por campanha.
  // L1/L4 -> campanha c1 (meta, spend 30000); L2/L5 -> c2 (meta, spend 20000);
  // L3 -> google_orgânico (sem ad_metrics correspondente -> CPL null).
  await seedLead({ ext: 'L1', channel: 'meta', createdAt: jun, value: 100000, stages: full(jun), utmSource: 'facebook', utmCampaign: 'c1' })
  await seedLead({ ext: 'L2', channel: 'meta', createdAt: jun, stages: upTo(3, jun), utmSource: 'facebook', utmCampaign: 'c2' }) // até agendadas
  await seedLead({ ext: 'L3', channel: 'google', createdAt: jun, stages: upTo(2, jun), utmSource: 'organic', utmCampaign: 'seo' }) // até mql, orgânico
  await seedLead({ ext: 'L4', channel: 'meta', createdAt: jun, stages: upTo(1, jun), utmSource: 'facebook', utmCampaign: 'c1' }) // só leads
  await seedLead({ ext: 'L5', channel: 'meta', createdAt: jun, value: 50000, stages: full(jun), utmSource: 'facebook', utmCampaign: 'c2' })

  // --- Período anterior (maio): 1 lead full, channel meta, value 40000 ---
  await seedLead({ ext: 'M1', channel: 'meta', createdAt: may, value: 40000, stages: full(may), utmSource: 'facebook', utmCampaign: 'c4' })

  // --- Outra org: ruído que NÃO deve aparecer ---
  await seedLead({ ext: 'X1', channel: 'meta', createdAt: jun, value: 999999, stages: full(jun), organizationId: otherOrg, utmSource: 'facebook', utmCampaign: 'c1' })

  // --- Ad metrics ---
  await db.insert(schema.adMetrics).values([
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-05'), campaign: 'c1', creative: 'cr1', channel: 'meta', spendCents: 30000, impressions: 10000, clicks: 500, sales: 2, revenueCents: 90000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-15'), campaign: 'c2', creative: 'cr2', channel: 'meta', spendCents: 20000, impressions: 5000, clicks: 300, sales: 5, revenueCents: 200000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-06-20'), campaign: 'c3', creative: 'cr3', channel: 'google', spendCents: 10000, impressions: 5000, clicks: 200, sales: 1, revenueCents: 50000 },
    { organizationId: org, provider: 'meta_ads', date: d('2026-05-10'), campaign: 'c4', creative: 'cr4', channel: 'meta', spendCents: 25000, impressions: 4000, clicks: 100, sales: 1, revenueCents: 40000 },
    // outra org -> ruído
    { organizationId: otherOrg, provider: 'meta_ads', date: d('2026-06-05'), campaign: 'z', creative: 'z', channel: 'meta', spendCents: 777777, impressions: 999, clicks: 99, sales: 99, revenueCents: 999999 },
  ])

  // --- costOrg: cenário de borda (spend > 0, impressions=0, clicks=0) ---
  await seedLead({ ext: 'C1', channel: 'meta', createdAt: jun, value: 30000, stages: full(jun), organizationId: costOrg, utmSource: 'facebook', utmCampaign: 'cc1' })
  await db.insert(schema.adMetrics).values([
    { organizationId: costOrg, provider: 'meta_ads', date: d('2026-06-05'), campaign: 'cc1', creative: 'ccr1', channel: 'meta', spendCents: 15000, impressions: 0, clicks: 0, sales: 1, revenueCents: 30000 },
  ])

  // --- lossOrg: leads com lostReason p/ testar getLossReasons ---
  // 3x 'Sumiu / sem retorno', 2x 'Preço / orçamento', 1x 'Timing / adiou decisão',
  // 1x 'Motivo Desconhecido' (não está na constante -> vai por último),
  // 2 leads sem lostReason (não devem entrar).
  const lossSpec: { reason: string | undefined; n: number }[] = [
    { reason: 'Sumiu / sem retorno', n: 3 },
    { reason: 'Preço / orçamento', n: 2 },
    { reason: 'Timing / adiou decisão', n: 1 },
    { reason: 'Motivo Desconhecido', n: 1 },
    { reason: undefined, n: 2 },
  ]
  let li = 0
  for (const spec of lossSpec) {
    for (let k = 0; k < spec.n; k++) {
      await seedLead({
        ext: `LR${li++}`,
        channel: 'meta',
        createdAt: jun,
        stages: upTo(1, jun),
        organizationId: lossOrg,
        lostReason: spec.reason,
      })
    }
  }

  // --- roasOrg: atual SEM ad_metrics (invest 0 -> roas null) mas COM receita;
  // anterior (maio) COM invest e receita (roas não-null) -> deltas.roas deve ser null.
  await seedLead({ ext: 'R1', channel: 'meta', createdAt: jun, value: 50000, stages: full(jun), organizationId: roasOrg })
  await seedLead({ ext: 'R0', channel: 'meta', createdAt: may, value: 40000, stages: full(may), organizationId: roasOrg })
  await db.insert(schema.adMetrics).values([
    { organizationId: roasOrg, provider: 'meta_ads', date: d('2026-05-10'), campaign: 'rc', creative: 'rcr', channel: 'meta', spendCents: 20000, impressions: 1000, clicks: 50, sales: 1, revenueCents: 40000 },
  ])

  // --- utmRegOrg: lead que ATINGIU 'vendas' mas REGREDIU (currentStage != 'vendas').
  // Deve contar como venda no ranking (semântica por evento, não por currentStage).
  await seedLead({
    ext: 'UR1',
    channel: 'meta',
    createdAt: jun,
    value: 70000,
    organizationId: utmRegOrg,
    utmSource: 'facebook',
    utmCampaign: 'reg',
    // passou por vendas e depois regrediu para negociacoes
    stages: [...full(jun), { stage: 'negociacoes', at: d('2026-06-11T12:00:00Z') }],
  })

  // --- identityOrg: dedup por identidade entre providers.
  // Cliente A em DOIS providers (mesmo identityKey 'a@x.com'):
  //   - leavo: atingiu até mql; datacrazy: atingiu até vendas.
  // Cliente B (identityKey 'b@x.com', 1 provider): atingiu até agendadas.
  await seedLead({
    ext: 'A-leavo',
    channel: 'meta',
    createdAt: jun,
    organizationId: identityOrg,
    provider: 'leavo',
    identityKey: 'a@x.com',
    stages: upTo(2, jun), // leads, mql
  })
  await seedLead({
    ext: 'A-datacrazy',
    channel: 'meta',
    createdAt: jun,
    organizationId: identityOrg,
    provider: 'datacrazy',
    identityKey: 'a@x.com',
    stages: full(jun), // leads..vendas
  })
  await seedLead({
    ext: 'B',
    channel: 'meta',
    createdAt: jun,
    organizationId: identityOrg,
    provider: 'leavo',
    identityKey: 'b@x.com',
    stages: upTo(3, jun), // leads, mql, agendadas
  })

  // --- creativeOrg: ranking de criativos por leads.creative (UTM_CONTENT).
  // AD06: 2 vendas (full) somando 80000 + 1 lead não-venda -> rev 80000, vendas 2, leads 3.
  // AD07: 1 venda (full) 50000 -> rev 50000, vendas 1, leads 1.
  // AD08: 1 lead que NÃO virou venda (value 0) -> rev 0, vendas 0, leads 1.
  // 2 leads SEM creative (null / '') -> devem ser ignorados.
  await seedLead({ ext: 'CR-a', channel: 'meta', createdAt: jun, value: 50000, organizationId: creativeOrg, creative: 'AD06', stages: full(jun) })
  await seedLead({ ext: 'CR-b', channel: 'meta', createdAt: jun, value: 30000, organizationId: creativeOrg, creative: 'AD06', stages: full(jun) })
  await seedLead({ ext: 'CR-c', channel: 'meta', createdAt: jun, organizationId: creativeOrg, creative: 'AD06', stages: upTo(2, jun) }) // não-venda
  await seedLead({ ext: 'CR-d', channel: 'google', createdAt: jun, value: 50000, organizationId: creativeOrg, creative: 'AD07', stages: full(jun) })
  await seedLead({ ext: 'CR-e', channel: 'meta', createdAt: jun, organizationId: creativeOrg, creative: 'AD08', stages: upTo(1, jun) }) // não-venda
  // sem creative -> ignorados
  await seedLead({ ext: 'CR-f', channel: 'meta', createdAt: jun, value: 99999, organizationId: creativeOrg, stages: full(jun) }) // creative null
  await seedLead({ ext: 'CR-g', channel: 'meta', createdAt: jun, value: 99999, organizationId: creativeOrg, creative: '', stages: full(jun) }) // creative ''

  // --- cycleOrg: ciclo de vendas (mediana em dias), ticket médio, CAC e no-show.
  // Etapas pré-vendas no createdAt; evento 'vendas' numa data posterior -> duração em dias.
  const stagesUntilNeg = (at: Date) => ALL.slice(0, 5).map((stage) => ({ stage, at })) // leads..negociacoes
  const fullVenda = (base: Date, venda: Date) => [...stagesUntilNeg(base), { stage: 'vendas', at: venda }]

  // Atual (junho): 3 vendas com durações 4, 10, 6 dias -> mediana 6; 1 no-show (até agendadas).
  await seedLead({ ext: 'CY1', channel: 'meta', createdAt: d('2026-06-01T00:00:00Z'), value: 60000, organizationId: cycleOrg, stages: fullVenda(d('2026-06-01T00:00:00Z'), d('2026-06-05T00:00:00Z')) })
  await seedLead({ ext: 'CY2', channel: 'meta', createdAt: d('2026-06-01T00:00:00Z'), value: 40000, organizationId: cycleOrg, stages: fullVenda(d('2026-06-01T00:00:00Z'), d('2026-06-11T00:00:00Z')) })
  await seedLead({ ext: 'CY3', channel: 'meta', createdAt: d('2026-06-10T00:00:00Z'), value: 20000, organizationId: cycleOrg, stages: fullVenda(d('2026-06-10T00:00:00Z'), d('2026-06-16T00:00:00Z')) })
  await seedLead({ ext: 'CY4', channel: 'meta', createdAt: d('2026-06-05T00:00:00Z'), organizationId: cycleOrg, stages: upTo(3, d('2026-06-05T00:00:00Z')) }) // até agendadas -> no-show

  // Anterior (maio): 2 vendas com durações 2 e 4 dias -> mediana 3; 1 no-show.
  await seedLead({ ext: 'CYM1', channel: 'meta', createdAt: d('2026-05-01T00:00:00Z'), value: 30000, organizationId: cycleOrg, stages: fullVenda(d('2026-05-01T00:00:00Z'), d('2026-05-03T00:00:00Z')) })
  await seedLead({ ext: 'CYM2', channel: 'meta', createdAt: d('2026-05-01T00:00:00Z'), value: 50000, organizationId: cycleOrg, stages: fullVenda(d('2026-05-01T00:00:00Z'), d('2026-05-05T00:00:00Z')) })
  await seedLead({ ext: 'CYM3', channel: 'meta', createdAt: d('2026-05-10T00:00:00Z'), organizationId: cycleOrg, stages: upTo(3, d('2026-05-10T00:00:00Z')) }) // no-show

  await db.insert(schema.adMetrics).values([
    { organizationId: cycleOrg, provider: 'meta_ads', date: d('2026-06-05'), campaign: 'cy', creative: 'cy', channel: 'meta', spendCents: 90000 },
    { organizationId: cycleOrg, provider: 'meta_ads', date: d('2026-05-10'), campaign: 'cy', creative: 'cy', channel: 'meta', spendCents: 80000 },
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

  it('deduplica por identidade: mesmo cliente entre providers conta uma vez', async () => {
    const counts = await getFunnelCounts(db, identityOrg, { ...cur, channel: 'all' })
    // A (leavo até mql + datacrazy até vendas) conta como 1 identidade por etapa;
    // B até agendadas.
    // leads: A+B = 2; mql: A+B = 2; agendadas: A(datacrazy)+B = 2;
    // realizadas: só A = 1; negociacoes: só A = 1; vendas: só A = 1.
    expect(counts).toEqual([2, 2, 2, 1, 1, 1])
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

  it('deltas.roas é null quando roas atual é null (invest atual 0) mesmo com anterior não-null', async () => {
    const h = await getHighlights(db, roasOrg, { ...cur, channel: 'all' }, { ...prev, channel: 'all' })
    // atual: receita 50000, invest 0 -> roas null
    expect(h.investCents).toBe(0)
    expect(h.roas).toBeNull()
    // anterior: roas 40000/20000 = 2 (não-null) -> mas delta deve ser null
    expect(h.deltas.roas).toBeNull()
  })

  it('calcula ticket médio, CAC e no-show (org principal)', async () => {
    const h = await getHighlights(db, org, { ...cur, channel: 'all' }, { ...prev, channel: 'all' })
    // receita 150000 / vendas 2 = 75000
    expect(h.ticketMedioCents).toBe(75000)
    // invest 60000 / vendas 2 = 30000
    expect(h.cacCents).toBe(30000)
    // funil [5,4,3,2,2,2]: (agendadas 3 - realizadas 2)/3 = 1/3
    expect(h.noShowRate).toBeCloseTo(1 / 3, 10)
  })

  it('ticket/CAC null sem vendas e no-show null sem agendadas', async () => {
    // emptyPrev (abril) não tem dados na org -> tudo null
    const h = await getHighlights(db, org, { ...emptyPrev, channel: 'all' }, { ...emptyPrev, channel: 'all' })
    expect(h.ticketMedioCents).toBeNull()
    expect(h.cacCents).toBeNull()
    expect(h.noShowRate).toBeNull()
    expect(h.cicloVendasDias).toBeNull()
  })
})

describe('getHighlights — ciclo de vendas (mediana) e deltas das novas métricas', () => {
  it('mediana de durações lead->venda, com delta vs anterior', async () => {
    const h = await getHighlights(db, cycleOrg, { ...cur, channel: 'all' }, { ...prev, channel: 'all' })
    // atual: durações 4,10,6 -> mediana 6; anterior: 2,4 -> mediana 3
    expect(h.cicloVendasDias).toBe(6)
    expect(h.deltas.cicloVendas).toBeCloseTo((6 - 3) / 3, 10)
  })

  it('ticket médio, CAC e no-show com deltas reais', async () => {
    const h = await getHighlights(db, cycleOrg, { ...cur, channel: 'all' }, { ...prev, channel: 'all' })
    // atual: receita 120000/3 = 40000; anterior 80000/2 = 40000 -> delta 0
    expect(h.ticketMedioCents).toBe(40000)
    expect(h.deltas.ticketMedio).toBeCloseTo(0, 10)
    // CAC atual 90000/3 = 30000; anterior 80000/2 = 40000 -> delta -0.25
    expect(h.cacCents).toBe(30000)
    expect(h.deltas.cac).toBeCloseTo((30000 - 40000) / 40000, 10)
    // no-show atual (agendadas 4 - realizadas 3)/4 = 0.25; anterior (3-2)/3 = 1/3
    expect(h.noShowRate).toBeCloseTo(0.25, 10)
    expect(h.deltas.noShow).toBeCloseTo((0.25 - 1 / 3) / (1 / 3), 10)
  })

  it('deltas das novas métricas null quando período anterior vazio', async () => {
    const h = await getHighlights(db, cycleOrg, { ...cur, channel: 'all' }, { ...emptyPrev, channel: 'all' })
    expect(h.deltas.ticketMedio).toBeNull()
    expect(h.deltas.cac).toBeNull()
    expect(h.deltas.noShow).toBeNull()
    expect(h.deltas.cicloVendas).toBeNull()
  })
})

describe('getCostCards', () => {
  it('calcula CPL/CPMQL/CPM/CPC em centavos e deltas vs anterior', async () => {
    const c = await getCostCards(db, org, { ...cur, channel: 'all' }, { ...prev, channel: 'all' })
    // atual: invest 60000, leads 5, mql 4, impressions 20000, clicks 1000
    expect(c.cplCents).toBe(60000 / 5) // 12000
    expect(c.cpmqlCents).toBe(60000 / 4) // 15000
    expect(c.cpmCents).toBe((60000 * 1000) / 20000) // 3000
    expect(c.cpcCents).toBe(60000 / 1000) // 60
    // anterior (maio): invest 25000, leads 1, mql 1, impressions 4000, clicks 100
    const cplPrev = 25000 / 1
    const cpmqlPrev = 25000 / 1
    const cpmPrev = (25000 * 1000) / 4000
    const cpcPrev = 25000 / 100
    expect(c.deltas.cpl).toBeCloseTo((12000 - cplPrev) / cplPrev, 10)
    expect(c.deltas.cpmql).toBeCloseTo((15000 - cpmqlPrev) / cpmqlPrev, 10)
    expect(c.deltas.cpm).toBeCloseTo((3000 - cpmPrev) / cpmPrev, 10)
    expect(c.deltas.cpc).toBeCloseTo((60 - cpcPrev) / cpcPrev, 10)
  })

  it('card é null quando impressions=0 (cpm) ou clicks=0 (cpc)', async () => {
    const c = await getCostCards(db, costOrg, { ...cur, channel: 'all' }, { ...emptyPrev, channel: 'all' })
    // invest 15000, leads 1, mql 1, impressions 0, clicks 0
    expect(c.cplCents).toBe(15000)
    expect(c.cpmqlCents).toBe(15000)
    expect(c.cpmCents).toBeNull()
    expect(c.cpcCents).toBeNull()
  })

  it('deltas null quando período anterior vazio', async () => {
    const c = await getCostCards(db, org, { ...cur, channel: 'all' }, { ...emptyPrev, channel: 'all' })
    expect(c.deltas.cpl).toBeNull()
    expect(c.deltas.cpmql).toBeNull()
    expect(c.deltas.cpm).toBeNull()
    expect(c.deltas.cpc).toBeNull()
  })

  it('não vaza dados de outra org', async () => {
    const c = await getCostCards(db, otherOrg, { ...cur, channel: 'all' }, { ...emptyPrev, channel: 'all' })
    // otherOrg: invest 777777, leads 1, impressions 999, clicks 99
    expect(c.cplCents).toBe(777777 / 1)
    expect(c.cpcCents).toBe(777777 / 99)
    // confirma que não somou os 60000 da org principal
    expect(c.cplCents).not.toBe(60000 / 5)
  })
})

describe('getUtmRanking', () => {
  it('agrupa por (source, campaign), conv e CPL via spend da campanha', async () => {
    const rows = await getUtmRanking(db, org, { ...cur, channel: 'all' })
    expect(rows.length).toBe(3)

    const byKey = new Map(rows.map((r) => [`${r.source}|${r.campaign}`, r]))
    const c1 = byKey.get('facebook|c1')!
    const c2 = byKey.get('facebook|c2')!
    const seo = byKey.get('organic|seo')!

    // c1: L1(venda)+L4 -> leads 2, vendas 1, conv 0.5, spend c1 30000 -> cpl 15000
    expect(c1.leads).toBe(2)
    expect(c1.vendas).toBe(1)
    expect(c1.conv).toBe(1 / 2)
    expect(c1.cplCents).toBe(30000 / 2)

    // c2: L2+L5(venda) -> leads 2, vendas 1, conv 0.5, spend c2 20000 -> cpl 10000
    expect(c2.leads).toBe(2)
    expect(c2.vendas).toBe(1)
    expect(c2.conv).toBe(1 / 2)
    expect(c2.cplCents).toBe(20000 / 2)

    // orgânico: sem ad_metrics correspondente -> cplCents null
    expect(seo.leads).toBe(1)
    expect(seo.vendas).toBe(0)
    expect(seo.conv).toBe(0)
    expect(seo.cplCents).toBeNull()

    // ordenação por vendas desc: o orgânico (vendas 0) vem por último
    expect(rows[rows.length - 1].source).toBe('organic')
  })

  it('limita a top 5', async () => {
    const rows = await getUtmRanking(db, org, { ...cur, channel: 'all' })
    expect(rows.length).toBeLessThanOrEqual(5)
  })

  it('não vaza dados de outra org', async () => {
    const rows = await getUtmRanking(db, costOrg, { ...cur, channel: 'all' })
    expect(rows.length).toBe(1)
    expect(rows[0].campaign).toBe('cc1')
    expect(rows[0].leads).toBe(1)
  })

  it('conta venda por EVENTO vendas, mesmo se o lead regrediu (currentStage != vendas)', async () => {
    const rows = await getUtmRanking(db, utmRegOrg, { ...cur, channel: 'all' })
    expect(rows.length).toBe(1)
    const r = rows[0]
    expect(r.campaign).toBe('reg')
    expect(r.leads).toBe(1)
    // tem evento 'vendas' embora currentStage seja 'negociacoes' -> conta como venda
    expect(r.vendas).toBe(1)
    expect(r.conv).toBe(1)
  })
})

describe('getCreatives', () => {
  it('ranqueia por leads.creative (UTM_CONTENT): receita desc, somas e rank corretos', async () => {
    const rows = await getCreatives(db, creativeOrg, { ...cur, channel: 'all' })
    // AD06 (rev 80000, vendas 2), AD07 (rev 50000, vendas 1), AD08 (rev 0, vendas 0)
    // -> ordenado por receita desc: AD06, AD07, AD08
    expect(rows.map((r) => r.name)).toEqual(['AD06', 'AD07', 'AD08'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])

    const ad06 = rows[0]
    expect(ad06.revenueCents).toBe(80000) // 50000 + 30000
    expect(ad06.vendas).toBe(2)
    expect(ad06.channel).toBe('meta')

    const ad07 = rows[1]
    expect(ad07.revenueCents).toBe(50000)
    expect(ad07.vendas).toBe(1)
    expect(ad07.channel).toBe('google')

    const ad08 = rows[2]
    expect(ad08.revenueCents).toBe(0)
    expect(ad08.vendas).toBe(0)
  })

  it('ignora leads sem creative (null ou string vazia)', async () => {
    const rows = await getCreatives(db, creativeOrg, { ...cur, channel: 'all' })
    // CR-f (creative null) e CR-g (creative '') são vendas de alto valor mas não entram
    expect(rows.map((r) => r.name)).toEqual(['AD06', 'AD07', 'AD08'])
    // se tivessem entrado, apareceria 99999 como receita
    expect(rows.some((r) => r.revenueCents === 99999)).toBe(false)
  })

  it('limita a top 8', async () => {
    const rows = await getCreatives(db, creativeOrg, { ...cur, channel: 'all' })
    expect(rows.length).toBeLessThanOrEqual(8)
  })

  it('filtra por canal (leads.channel)', async () => {
    const rows = await getCreatives(db, creativeOrg, { ...cur, channel: 'google' })
    // só AD07 tem lead no canal google
    expect(rows.map((r) => r.name)).toEqual(['AD07'])
    expect(rows[0].channel).toBe('google')
  })

  it('não vaza dados de outra org', async () => {
    const rows = await getCreatives(db, org, { ...cur, channel: 'all' })
    // a org principal não tem leads com creative -> ranking vazio
    expect(rows.length).toBe(0)
  })
})

describe('getLossReasons', () => {
  it('agrega counts/pct/total e ordena pela constante (desconhecidos por último)', async () => {
    const { rows, total } = await getLossReasons(db, lossOrg, { ...cur, channel: 'all' })
    // total = 3+2+1+1 = 7 (os 2 sem lostReason não contam)
    expect(total).toBe(7)

    // ordem: segue LOSS_REASONS (conhecidos), depois desconhecidos.
    // presentes conhecidos: 'Preço / orçamento' (2), 'Sumiu / sem retorno' (3),
    //                        'Timing / adiou decisão' (1). Desconhecido: 'Motivo Desconhecido' (1).
    expect(rows.map((r) => r.reason)).toEqual([
      'Preço / orçamento',
      'Sumiu / sem retorno',
      'Timing / adiou decisão',
      'Motivo Desconhecido',
    ])
    const byReason = new Map(rows.map((r) => [r.reason, r]))
    expect(byReason.get('Sumiu / sem retorno')!.count).toBe(3)
    expect(byReason.get('Preço / orçamento')!.count).toBe(2)
    expect(byReason.get('Timing / adiou decisão')!.count).toBe(1)
    expect(byReason.get('Motivo Desconhecido')!.count).toBe(1)
    // pct é fração 0..1
    expect(byReason.get('Sumiu / sem retorno')!.pct).toBeCloseTo(3 / 7, 10)
    expect(byReason.get('Preço / orçamento')!.pct).toBeCloseTo(2 / 7, 10)
    // soma das frações ≈ 1
    expect(rows.reduce((a, r) => a + r.pct, 0)).toBeCloseTo(1, 10)
  })

  it('não inclui motivos com count 0 nem leads sem lostReason', async () => {
    const { rows } = await getLossReasons(db, lossOrg, { ...cur, channel: 'all' })
    // só os 4 presentes
    expect(rows.length).toBe(4)
    // 'Escolheu concorrente' não foi semeado -> ausente
    expect(rows.find((r) => r.reason === 'Escolheu concorrente')).toBeUndefined()
  })

  it('não vaza dados de outra org', async () => {
    const { rows, total } = await getLossReasons(db, org, { ...cur, channel: 'all' })
    expect(total).toBe(0)
    expect(rows.length).toBe(0)
  })
})

describe('getDashboardData', () => {
  it('retorna o objeto com as chaves esperadas e 18 funnelPaths', async () => {
    const data = await getDashboardData(
      db,
      org,
      { period: 'custom', channel: 'all', from: '2026-06-01', to: '2026-06-30' },
      new Date('2026-06-30T00:00:00Z'),
    )
    expect(data).toHaveProperty('funnel')
    expect(data).toHaveProperty('highlights')
    expect(data).toHaveProperty('costCards')
    expect(data).toHaveProperty('utm')
    expect(data).toHaveProperty('creatives')
    expect(data).toHaveProperty('loss')
    expect(data).toHaveProperty('funnelPaths')
    expect(data).toHaveProperty('donutArcs')

    expect(data.funnel.counts).toEqual([5, 4, 3, 2, 2, 2])
    expect(data.funnel.convGeral).toBe(2 / 5)
    expect(data.funnelPaths.length).toBe(18)
    // donutArcs casa com as linhas de loss (org principal: 0 motivos)
    expect(data.donutArcs.length).toBe(data.loss.rows.length)
  })

  it('gera donutArcs a partir dos motivos de perda quando há dados', async () => {
    const data = await getDashboardData(
      db,
      lossOrg,
      { period: 'custom', channel: 'all', from: '2026-06-01', to: '2026-06-30' },
      new Date('2026-06-30T00:00:00Z'),
    )
    expect(data.loss.total).toBe(7)
    expect(data.donutArcs.length).toBe(4)
    expect(data.funnelPaths.length).toBe(18)
  })
})
