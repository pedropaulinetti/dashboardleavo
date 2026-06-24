import { and, count, countDistinct, desc, eq, gte, isNotNull, lte, inArray, sql, sum } from 'drizzle-orm'
import type { db } from '@/db'
import { adMetrics, FUNNEL_STAGES, leads, leadStageEvents } from '@/db/schema'
import { buildDonutArcs, type DonutArc } from './donut'
import { buildFunnelPaths, type FunnelPath } from './funnel-svg'
import { LOSS_REASONS } from './loss-reasons'
import { delta, median, safeDiv } from './math'
import { resolveRange } from './range'

// `database` aceita o driver de produção (postgres-js) ou o de teste (PGlite).
// Usar genérico sobre `Pick<typeof db,'select'>` evita conflito entre os HKTs dos
// drivers (mesmo padrão de src/db/tenant.ts e src/auth/authorize.ts).
type AnyDb = Pick<typeof db, 'select'>

export type Filters = { from: Date; to: Date; channel: string }

// Predicado de coorte: leads da org, criados no range, opcionalmente filtrados por canal.
function leadCohortWhere(organizationId: string, f: Filters) {
  const conds = [
    eq(leads.organizationId, organizationId),
    gte(leads.createdAt, f.from),
    lte(leads.createdAt, f.to),
  ]
  if (f.channel !== 'all') conds.push(eq(leads.channel, f.channel))
  return and(...conds)
}

/**
 * Contagem de leads DISTINTOS que atingiram cada etapa do funil (via lead_stage_events),
 * na ordem de FUNNEL_STAGES. Escopo: org, coorte por leads.createdAt no range, e canal.
 */
export async function getFunnelCounts(
  database: AnyDb,
  organizationId: string,
  filters: Filters,
): Promise<number[]> {
  const rows = await database
    .select({
      stage: leadStageEvents.stage,
      // Dedup por identidade: o mesmo cliente pode ter um lead em cada provider
      // (ex.: leavo e datacrazy) com o mesmo identityKey — conta uma vez. Quando
      // identityKey é nulo, cada lead é sua própria identidade (id), preservando
      // o comportamento de 1 provider.
      n: countDistinct(sql`coalesce(${leads.identityKey}, ${leads.id}::text)`),
    })
    .from(leadStageEvents)
    .innerJoin(leads, eq(leadStageEvents.leadId, leads.id))
    .where(
      and(
        eq(leadStageEvents.organizationId, organizationId),
        inArray(leadStageEvents.stage, FUNNEL_STAGES as unknown as string[]),
        leadCohortWhere(organizationId, filters),
      ),
    )
    .groupBy(leadStageEvents.stage)

  const byStage = new Map(rows.map((r) => [r.stage, Number(r.n ?? 0)]))
  return FUNNEL_STAGES.map((s) => byStage.get(s) ?? 0)
}

export async function getFunnel(
  database: AnyDb,
  organizationId: string,
  filters: Filters,
): Promise<{ counts: number[]; convGeral: number | null }> {
  const counts = await getFunnelCounts(database, organizationId, filters)
  return { counts, convGeral: safeDiv(counts[5], counts[0]) }
}

// Soma de valueCents dos leads que atingiram 'vendas' (têm evento 'vendas') no range/canal.
async function sumReceitaCents(
  database: AnyDb,
  organizationId: string,
  f: Filters,
): Promise<number> {
  const [row] = await database
    .select({ total: sum(leads.valueCents) })
    .from(leads)
    .innerJoin(
      leadStageEvents,
      and(
        eq(leadStageEvents.leadId, leads.id),
        eq(leadStageEvents.stage, 'vendas'),
      ),
    )
    .where(leadCohortWhere(organizationId, f))
  return Number(row?.total ?? 0)
}

// Dias (lead.createdAt -> primeiro evento 'vendas') de cada lead que fechou na coorte.
// Base do ciclo de vendas; a mediana é calculada em JS (robusta a outliers, sem depender
// de percentile_cont entre Postgres/PGlite). Escopo: org, coorte por createdAt e canal.
const MS_PER_DAY = 86_400_000

async function salesCycleDaysList(
  database: AnyDb,
  organizationId: string,
  f: Filters,
): Promise<number[]> {
  // Uma linha por evento 'vendas'; createdAt e occurredAt passam pelo MESMO mapeamento
  // de timestamp do drizzle (evita o skew de fuso ao parsear um min() cru como string).
  // O primeiro evento 'vendas' (min) é resolvido em JS, por lead.
  const rows = await database
    .select({
      leadId: leads.id,
      createdAt: leads.createdAt,
      vendaAt: leadStageEvents.occurredAt,
    })
    .from(leads)
    .innerJoin(
      leadStageEvents,
      and(eq(leadStageEvents.leadId, leads.id), eq(leadStageEvents.stage, 'vendas')),
    )
    .where(leadCohortWhere(organizationId, f))

  const firstVendaByLead = new Map<string, { createdAt: Date; vendaAt: Date }>()
  for (const r of rows) {
    const prev = firstVendaByLead.get(r.leadId)
    if (!prev || r.vendaAt < prev.vendaAt) {
      firstVendaByLead.set(r.leadId, { createdAt: r.createdAt, vendaAt: r.vendaAt })
    }
  }

  return [...firstVendaByLead.values()].map(
    (v) => (v.vendaAt.getTime() - v.createdAt.getTime()) / MS_PER_DAY,
  )
}

// Predicado de ad_metrics: org, range por ad_metrics.date, opcionalmente por canal.
function adMetricsWhere(organizationId: string, f: Filters) {
  const conds = [
    eq(adMetrics.organizationId, organizationId),
    gte(adMetrics.date, f.from),
    lte(adMetrics.date, f.to),
  ]
  if (f.channel !== 'all') conds.push(eq(adMetrics.channel, f.channel))
  return and(...conds)
}

// Somas agregadas de ad_metrics (invest/impressions/clicks) no range/canal.
// Cobre tanto o "invest" dos highlights quanto impressions/clicks dos cost cards,
// numa só varredura de ad_metrics.
type AdAggregates = { investCents: number; impressions: number; clicks: number }

async function sumAdAggregates(
  database: AnyDb,
  organizationId: string,
  f: Filters,
): Promise<AdAggregates> {
  const [row] = await database
    .select({
      invest: sum(adMetrics.spendCents),
      impressions: sum(adMetrics.impressions),
      clicks: sum(adMetrics.clicks),
    })
    .from(adMetrics)
    .where(adMetricsWhere(organizationId, f))
  return {
    investCents: Number(row?.invest ?? 0),
    impressions: Number(row?.impressions ?? 0),
    clicks: Number(row?.clicks ?? 0),
  }
}

export interface Highlights {
  receitaCents: number
  vendas: number
  investCents: number
  roas: number | null
  ticketMedioCents: number | null
  cacCents: number | null
  noShowRate: number | null
  cicloVendasDias: number | null
  deltas: {
    receita: number | null
    vendas: number | null
    invest: number | null
    roas: number | null
    ticketMedio: number | null
    cac: number | null
    noShow: number | null
    cicloVendas: number | null
  }
}

// Métricas derivadas de um período: ticket médio, CAC, taxa de no-show e ciclo de vendas
// (mediana em dias). Puras — a partir de receita, invest, funil e durações já computados.
function deriveExtraMetrics(
  receitaCents: number,
  investCents: number,
  counts: number[],
  cycleDays: number[],
) {
  return {
    ticketMedio: safeDiv(receitaCents, counts[5]),
    cac: safeDiv(investCents, counts[5]),
    // no-show: agendadas que não se realizaram, sobre as agendadas
    noShow: safeDiv(counts[2] - counts[3], counts[2]),
    ciclo: median(cycleDays),
  }
}

/**
 * Monta os highlights a partir de primitivos já computados (receita, agregados de ad
 * e contagens de funil, atual e anterior). Pura — não acessa o banco. Permite que o
 * orquestrador reaproveite os primitivos sem refazer as queries.
 */
function assembleHighlights(
  receitaCents: number,
  adAggCur: AdAggregates,
  funnelCur: number[],
  cycleDaysCur: number[],
  prevReceita: number,
  adAggPrev: AdAggregates,
  funnelPrev: number[],
  cycleDaysPrev: number[],
): Highlights {
  const investCents = adAggCur.investCents
  const prevInvest = adAggPrev.investCents
  const vendas = funnelCur[5]
  const prevVendas = funnelPrev[5]
  const roas = safeDiv(receitaCents, investCents)
  const prevRoas = safeDiv(prevReceita, prevInvest)

  const xCur = deriveExtraMetrics(receitaCents, investCents, funnelCur, cycleDaysCur)
  const xPrev = deriveExtraMetrics(prevReceita, prevInvest, funnelPrev, cycleDaysPrev)

  return {
    receitaCents,
    vendas,
    investCents,
    roas,
    ticketMedioCents: xCur.ticketMedio,
    cacCents: xCur.cac,
    noShowRate: xCur.noShow,
    cicloVendasDias: xCur.ciclo,
    deltas: {
      receita: delta(receitaCents, prevReceita),
      vendas: delta(vendas, prevVendas),
      invest: delta(investCents, prevInvest),
      roas: deltaOrNull(roas, prevRoas),
      ticketMedio: deltaOrNull(xCur.ticketMedio, xPrev.ticketMedio),
      cac: deltaOrNull(xCur.cac, xPrev.cac),
      noShow: deltaOrNull(xCur.noShow, xPrev.noShow),
      cicloVendas: deltaOrNull(xCur.ciclo, xPrev.ciclo),
    },
  }
}

/**
 * Cards de destaque para o período atual, com deltas relativos vs o período anterior.
 * Recebe os dois conjuntos de filtros (atual e anterior), já com datas resolvidas.
 */
export async function getHighlights(
  database: AnyDb,
  organizationId: string,
  currentFilters: Filters,
  prevFilters: Filters,
): Promise<Highlights> {
  const [receitaCents, adAggCur, curCounts, cycleCur] = await Promise.all([
    sumReceitaCents(database, organizationId, currentFilters),
    sumAdAggregates(database, organizationId, currentFilters),
    getFunnelCounts(database, organizationId, currentFilters),
    salesCycleDaysList(database, organizationId, currentFilters),
  ])
  const [prevReceita, adAggPrev, prevCounts, cyclePrev] = await Promise.all([
    sumReceitaCents(database, organizationId, prevFilters),
    sumAdAggregates(database, organizationId, prevFilters),
    getFunnelCounts(database, organizationId, prevFilters),
    salesCycleDaysList(database, organizationId, prevFilters),
  ])

  return assembleHighlights(
    receitaCents,
    adAggCur,
    curCounts,
    cycleCur,
    prevReceita,
    adAggPrev,
    prevCounts,
    cyclePrev,
  )
}

// Delta entre dois valores possivelmente null: se qualquer lado é null, retorna null.
function deltaOrNull(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null) return null
  return delta(cur, prev)
}

export interface CostCards {
  cplCents: number | null
  cpmqlCents: number | null
  cpmCents: number | null
  cpcCents: number | null
  deltas: {
    cpl: number | null
    cpmql: number | null
    cpm: number | null
    cpc: number | null
  }
}

type Costs = { cpl: number | null; cpmql: number | null; cpm: number | null; cpc: number | null }

// Custos (CPL/CPMQL/CPM/CPC) a partir de primitivos já computados: agregados de
// ad_metrics e contagens de funil (leads, mql). Puro — não acessa o banco.
function costsFromAgg(agg: AdAggregates, counts: number[]): Costs {
  return {
    cpl: safeDiv(agg.investCents, counts[0]),
    cpmql: safeDiv(agg.investCents, counts[1]),
    cpm: safeDiv(agg.investCents * 1000, agg.impressions),
    cpc: safeDiv(agg.investCents, agg.clicks),
  }
}

// Monta os cost cards a partir dos custos atual/anterior já calculados. Puro.
function assembleCostCards(cur: Costs, prv: Costs): CostCards {
  return {
    cplCents: cur.cpl,
    cpmqlCents: cur.cpmql,
    cpmCents: cur.cpm,
    cpcCents: cur.cpc,
    deltas: {
      cpl: deltaOrNull(cur.cpl, prv.cpl),
      cpmql: deltaOrNull(cur.cpmql, prv.cpmql),
      cpm: deltaOrNull(cur.cpm, prv.cpm),
      cpc: deltaOrNull(cur.cpc, prv.cpc),
    },
  }
}

// Calcula os custos do período buscando os primitivos no banco.
async function costsFor(
  database: AnyDb,
  organizationId: string,
  f: Filters,
): Promise<Costs> {
  const [agg, counts] = await Promise.all([
    sumAdAggregates(database, organizationId, f),
    getFunnelCounts(database, organizationId, f),
  ])
  return costsFromAgg(agg, counts)
}

/**
 * Cards de custo (CPL, CPMQL, CPM, CPC) em centavos para o período atual,
 * com deltas relativos vs o período anterior. Escopo: org.
 */
export async function getCostCards(
  database: AnyDb,
  organizationId: string,
  current: Filters,
  prev: Filters,
): Promise<CostCards> {
  const [cur, prv] = await Promise.all([
    costsFor(database, organizationId, current),
    costsFor(database, organizationId, prev),
  ])
  return assembleCostCards(cur, prv)
}

export interface UtmRankItem {
  source: string | null
  campaign: string | null
  leads: number
  vendas: number
  conv: number | null
  cplCents: number | null
}

/**
 * Ranking de UTMs: agrupa leads por (utmSource, utmCampaign) no range/canal.
 * CPL casa ad_metrics.campaign = leads.utmCampaign (spend agregado por campanha).
 * Ordena por vendas desc (desempate leads desc). Top 5. Escopo: org.
 */
export async function getUtmRanking(
  database: AnyDb,
  organizationId: string,
  filters: Filters,
): Promise<UtmRankItem[]> {
  // "Venda" = o lead ATINGIU a etapa vendas (tem evento em lead_stage_events com
  // stage='vendas'), coerente com o funil/highlights — não depende do currentStage,
  // que pode ter regredido. EXISTS correlacionado por lead/org.
  const reachedVendas = sql`exists (
    select 1 from ${leadStageEvents}
    where ${leadStageEvents.leadId} = ${leads.id}
      and ${leadStageEvents.organizationId} = ${organizationId}
      and ${leadStageEvents.stage} = 'vendas'
  )`

  // Identidade: o mesmo cliente pode ter vários leads (ex.: 2 negócios) com o mesmo
  // identityKey — conta uma vez, igual ao funil. Quando identityKey é nulo, cada lead
  // é sua própria identidade (id). Contagens distinct alinham os totais com o funil.
  const identity = sql`coalesce(${leads.identityKey}, ${leads.id}::text)`
  const leadsExpr = sql<number>`count(distinct ${identity})`
  const vendasExpr = sql<number>`count(distinct ${identity}) filter (where ${reachedVendas})`

  // Ranking de leads e spend por campanha são independentes — rodam em paralelo.
  const [rows, spendRows] = await Promise.all([
    database
      .select({
        source: leads.utmSource,
        campaign: leads.utmCampaign,
        leads: leadsExpr,
        vendas: vendasExpr,
      })
      .from(leads)
      .where(leadCohortWhere(organizationId, filters))
      .groupBy(leads.utmSource, leads.utmCampaign)
      .orderBy(desc(vendasExpr), desc(leadsExpr))
      .limit(5),
    database
      .select({
        campaign: adMetrics.campaign,
        spend: sum(adMetrics.spendCents),
      })
      .from(adMetrics)
      .where(adMetricsWhere(organizationId, filters))
      .groupBy(adMetrics.campaign),
  ])
  const spendByCampaign = new Map(
    spendRows.map((r) => [r.campaign, Number(r.spend ?? 0)]),
  )

  return rows.map((r) => {
    const leadsN = Number(r.leads ?? 0)
    const vendasN = Number(r.vendas ?? 0)
    const spend = r.campaign != null ? spendByCampaign.get(r.campaign) : undefined
    return {
      source: r.source,
      campaign: r.campaign,
      leads: leadsN,
      vendas: vendasN,
      conv: safeDiv(vendasN, leadsN),
      cplCents: spend == null ? null : safeDiv(spend, leadsN),
    }
  })
}

export interface CreativeItem {
  rank: number
  name: string
  channel: string | null
  vendas: number
  revenueCents: number
  leadsCount?: number
}

/**
 * Ranking de criativos: agrupa leads por creative (UTM_CONTENT vindo do DataCrazy)
 * no range/canal, ignorando leads sem creative. `vendas` = leads na etapa 'vendas';
 * `revenueCents` = soma de value_cents (só vendas têm valor). Canal representativo via
 * max(channel). Ordena por receita desc (desempate por vendas desc). Top 8. Escopo: org.
 */
export async function getCreatives(
  database: AnyDb,
  organizationId: string,
  filters: Filters,
): Promise<CreativeItem[]> {
  // "Venda" = o lead ATINGIU a etapa vendas (tem evento 'vendas'), coerente com o
  // funil/highlights/getUtmRanking — não depende do currentStage, que pode ter regredido.
  const reachedVendas = sql`exists (
    select 1 from ${leadStageEvents}
    where ${leadStageEvents.leadId} = ${leads.id}
      and ${leadStageEvents.organizationId} = ${organizationId}
      and ${leadStageEvents.stage} = 'vendas'
  )`
  // Contagens por identidade (mesmo cliente com 2 negócios conta 1), alinhadas ao funil.
  const identity = sql`coalesce(${leads.identityKey}, ${leads.id}::text)`
  const vendasExpr = sql<number>`count(distinct ${identity}) filter (where ${reachedVendas})`
  const leadsExpr = sql<number>`count(distinct ${identity})`
  const revenueExpr = sum(leads.valueCents)

  const rows = await database
    .select({
      name: leads.creative,
      channel: sql<string | null>`max(${leads.channel})`,
      vendas: vendasExpr,
      revenueCents: revenueExpr,
      leadsCount: leadsExpr,
    })
    .from(leads)
    .where(
      and(
        leadCohortWhere(organizationId, filters),
        isNotNull(leads.creative),
        sql`${leads.creative} <> ''`,
      ),
    )
    .groupBy(leads.creative)
    .orderBy(desc(revenueExpr), desc(vendasExpr))
    .limit(8)

  return rows.map((r, i) => ({
    rank: i + 1,
    name: r.name as string,
    channel: r.channel,
    vendas: Number(r.vendas ?? 0),
    revenueCents: Number(r.revenueCents ?? 0),
    leadsCount: Number(r.leadsCount ?? 0),
  }))
}

export interface LossReasonRow {
  reason: string
  count: number
  pct: number
}

export interface LossReasons {
  rows: LossReasonRow[]
  total: number
}

// Índice de cada motivo conhecido na constante (ordem de exibição); desconhecidos -> Infinity.
const LOSS_ORDER = new Map<string, number>(LOSS_REASONS.map((l, i) => [l.reason, i]))

/**
 * Agrega leads perdidos (lostReason IS NOT NULL) por motivo, no range/canal.
 * Só inclui motivos presentes (count > 0). Ordena: conhecidos na ordem de
 * LOSS_REASONS, depois desconhecidos. `pct` é fração (0..1). Escopo: org.
 */
export async function getLossReasons(
  database: AnyDb,
  organizationId: string,
  filters: Filters,
): Promise<LossReasons> {
  const rows = await database
    .select({
      reason: leads.lostReason,
      n: count(),
    })
    .from(leads)
    .where(and(leadCohortWhere(organizationId, filters), isNotNull(leads.lostReason)))
    .groupBy(leads.lostReason)

  const counted = rows
    .filter((r): r is { reason: string; n: number } => r.reason != null)
    .map((r) => ({ reason: r.reason, count: Number(r.n ?? 0) }))

  const total = counted.reduce((a, r) => a + r.count, 0)

  const rank = (reason: string) => LOSS_ORDER.get(reason) ?? Number.POSITIVE_INFINITY
  counted.sort((a, b) => {
    const ra = rank(a.reason)
    const rb = rank(b.reason)
    if (ra !== rb) return ra - rb
    // desconhecidos entre si: ordem estável por nome
    return a.reason.localeCompare(b.reason)
  })

  return {
    total,
    rows: counted.map((r) => ({
      reason: r.reason,
      count: r.count,
      pct: total === 0 ? 0 : r.count / total,
    })),
  }
}

export interface RecentLeadItem {
  name: string | null
  contact: string | null // identityKey (email/telefone normalizado)
  channel: string | null
  utmSource: string | null
  creative: string | null
  currentStage: string
  valueCents: number
  lostReason: string | null
  createdAt: Date
}

/**
 * Os leads mais recentes da coorte (org + createdAt no range + canal), ordenados
 * por createdAt desc, limitados a `limit`. `contact` é o identityKey. Escopo: org.
 */
export async function getRecentLeads(
  database: AnyDb,
  organizationId: string,
  filters: Filters,
  limit = 15,
): Promise<RecentLeadItem[]> {
  const rows = await database
    .select({
      name: leads.name,
      contact: leads.identityKey,
      channel: leads.channel,
      utmSource: leads.utmSource,
      creative: leads.creative,
      currentStage: leads.currentStage,
      valueCents: leads.valueCents,
      lostReason: leads.lostReason,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(leadCohortWhere(organizationId, filters))
    .orderBy(desc(leads.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    name: r.name,
    contact: r.contact,
    channel: r.channel,
    utmSource: r.utmSource,
    creative: r.creative,
    currentStage: r.currentStage,
    valueCents: Number(r.valueCents ?? 0),
    lostReason: r.lostReason,
    createdAt: r.createdAt,
  }))
}

export type Granularity = 'day' | 'month' | 'year'

export interface TimeSeriesPoint {
  period: string // ISO date do início do bucket, ex.: '2026-06-01'
  leads: number // leads que atingiram 'leads' nesse bucket
  agendadas: number // atingiram 'agendadas'
  realizadas: number // atingiram 'realizadas'
  vendas: number // atingiram 'vendas' (negócios fechados)
  spendCents: number // investimento em mídia no bucket
}

// Stages expostos na série temporal (subconjunto de FUNNEL_STAGES).
const TS_STAGES = ['leads', 'agendadas', 'realizadas', 'vendas'] as const
type TsStage = (typeof TS_STAGES)[number]

// Limite de segurança para a geração de buckets em JS (evita travar com ranges absurdos).
const MAX_BUCKETS = 1000

// Avança um Date (em UTC) por um bucket da granularidade dada.
function advanceBucket(d: Date, g: Granularity): Date {
  const x = new Date(d)
  if (g === 'day') x.setUTCDate(x.getUTCDate() + 1)
  else if (g === 'month') x.setUTCMonth(x.getUTCMonth() + 1)
  else x.setUTCFullYear(x.getUTCFullYear() + 1)
  return x
}

// Trunca um Date (em UTC) para o início do bucket da granularidade dada.
function truncBucket(d: Date, g: Granularity): Date {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  if (g === 'year') return new Date(Date.UTC(y, 0, 1))
  if (g === 'month') return new Date(Date.UTC(y, m, 1))
  return new Date(Date.UTC(y, m, day))
}

// Chave 'YYYY-MM-DD' (UTC) do início de um bucket — usada como period e p/ juntar com o SQL.
function bucketKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Série temporal para o gráfico de evolução: por dia/mês/ano, com as métricas
 * de etapa (leads/agendadas/realizadas/vendas — clientes distintos que atingiram
 * cada etapa no bucket) e o investimento em mídia (spendCents) somado por bucket.
 * Gera TODOS os buckets do range (preenchendo com 0) em ordem cronológica. Escopo: org.
 */
export async function getTimeSeries(
  database: AnyDb,
  organizationId: string,
  opts: { from: Date; to: Date; channel: string; granularity: Granularity },
): Promise<TimeSeriesPoint[]> {
  const { from, to, channel, granularity } = opts

  // date_trunc no Postgres/PGlite: 'day'|'month'|'year'. O resultado é o início
  // do bucket (timestamp); normalizamos p/ chave 'YYYY-MM-DD' (UTC) em JS.
  // A granularidade é inserida como literal (não como parâmetro): além de ser um
  // enum fechado (sem risco de injeção), placeholders distintos no SELECT e no
  // GROUP BY impediriam o Postgres de reconhecer a expressão agrupada.
  const granLit = sql.raw(`'${granularity}'`)
  const stageBucket = sql<string>`date_trunc(${granLit}, ${leadStageEvents.occurredAt})`
  const adBucket = sql<string>`date_trunc(${granLit}, ${adMetrics.date})`

  // --- Métricas de etapa (clientes distintos por bucket+stage) ---
  const stageConds = [
    eq(leadStageEvents.organizationId, organizationId),
    inArray(leadStageEvents.stage, TS_STAGES as unknown as string[]),
    gte(leadStageEvents.occurredAt, from),
    lte(leadStageEvents.occurredAt, to),
  ]
  if (channel !== 'all') stageConds.push(eq(leads.channel, channel))

  const stageRows = await database
    .select({
      bucket: stageBucket,
      stage: leadStageEvents.stage,
      n: countDistinct(sql`coalesce(${leads.identityKey}, ${leads.id}::text)`),
    })
    .from(leadStageEvents)
    .innerJoin(leads, eq(leadStageEvents.leadId, leads.id))
    .where(and(...stageConds))
    .groupBy(stageBucket, leadStageEvents.stage)

  // --- Investimento (spend somado por bucket) ---
  const adConds = [
    eq(adMetrics.organizationId, organizationId),
    gte(adMetrics.date, from),
    lte(adMetrics.date, to),
  ]
  if (channel !== 'all') adConds.push(eq(adMetrics.channel, channel))

  const adRows = await database
    .select({ bucket: adBucket, spend: sum(adMetrics.spendCents) })
    .from(adMetrics)
    .where(and(...adConds))
    .groupBy(adBucket)

  // Normaliza o timestamp do date_trunc para a chave 'YYYY-MM-DD' (UTC).
  const keyOf = (raw: string): string => bucketKey(new Date(raw))

  const stageByKey = new Map<string, Map<TsStage, number>>()
  for (const r of stageRows) {
    const k = keyOf(r.bucket)
    let m = stageByKey.get(k)
    if (!m) {
      m = new Map()
      stageByKey.set(k, m)
    }
    m.set(r.stage as TsStage, Number(r.n ?? 0))
  }

  const spendByKey = new Map<string, number>()
  for (const r of adRows) spendByKey.set(keyOf(r.bucket), Number(r.spend ?? 0))

  // --- Montar a série: todos os buckets de [trunc(from), to], em ordem ---
  const out: TimeSeriesPoint[] = []
  let cursor = truncBucket(from, granularity)
  while (cursor.getTime() <= to.getTime() && out.length < MAX_BUCKETS) {
    const key = bucketKey(cursor)
    const stages = stageByKey.get(key)
    out.push({
      period: key,
      leads: stages?.get('leads') ?? 0,
      agendadas: stages?.get('agendadas') ?? 0,
      realizadas: stages?.get('realizadas') ?? 0,
      vendas: stages?.get('vendas') ?? 0,
      spendCents: spendByKey.get(key) ?? 0,
    })
    cursor = advanceBucket(cursor, granularity)
  }

  return out
}

export interface DashboardInput {
  period?: string
  channel: string
  from?: string
  to?: string
}

export interface DashboardData {
  funnel: { counts: number[]; convGeral: number | null }
  highlights: Highlights
  costCards: CostCards
  utm: UtmRankItem[]
  creatives: CreativeItem[]
  loss: LossReasons
  funnelPaths: FunnelPath[]
  donutArcs: DonutArc[]
  recentLeads: RecentLeadItem[]
}

/**
 * Orquestrador: resolve o range, dispara todas as agregações do dashboard
 * (atual vs anterior onde aplicável) e gera os SVGs derivados. Escopo: org.
 */
export async function getDashboardData(
  database: AnyDb,
  organizationId: string,
  input: DashboardInput,
  today: Date,
): Promise<DashboardData> {
  const { from, to, prevFrom, prevTo } = resolveRange(input, today)
  const cur: Filters = { from, to, channel: input.channel }
  const prev: Filters = { from: prevFrom, to: prevTo, channel: input.channel }

  // Primitivos compartilhados, computados UMA vez. Antes, funnelCounts e os agregados
  // de ad_metrics eram refeitos por getFunnel/getHighlights/getCostCards (3x cur e 2x
  // prev para o funil — a query mais cara, com join+countDistinct). Aqui rodam só uma
  // vez cada e são reusados pelos assembladores puros.
  const [
    funnelCur,
    funnelPrev,
    adAggCur,
    adAggPrev,
    receitaCur,
    receitaPrev,
    cycleCur,
    cyclePrev,
    utm,
    creatives,
    loss,
    recentLeads,
  ] = await Promise.all([
    getFunnelCounts(database, organizationId, cur),
    getFunnelCounts(database, organizationId, prev),
    sumAdAggregates(database, organizationId, cur),
    sumAdAggregates(database, organizationId, prev),
    sumReceitaCents(database, organizationId, cur),
    sumReceitaCents(database, organizationId, prev),
    salesCycleDaysList(database, organizationId, cur),
    salesCycleDaysList(database, organizationId, prev),
    getUtmRanking(database, organizationId, cur),
    getCreatives(database, organizationId, cur),
    getLossReasons(database, organizationId, cur),
    getRecentLeads(database, organizationId, cur),
  ])

  const funnel = { counts: funnelCur, convGeral: safeDiv(funnelCur[5], funnelCur[0]) }
  const highlights = assembleHighlights(
    receitaCur,
    adAggCur,
    funnelCur,
    cycleCur,
    receitaPrev,
    adAggPrev,
    funnelPrev,
    cyclePrev,
  )
  const costCards = assembleCostCards(
    costsFromAgg(adAggCur, funnelCur),
    costsFromAgg(adAggPrev, funnelPrev),
  )

  const funnelPaths = buildFunnelPaths(funnel.counts)
  const donutArcs = buildDonutArcs(loss.rows.map((r) => r.count))

  return { funnel, highlights, costCards, utm, creatives, loss, funnelPaths, donutArcs, recentLeads }
}
