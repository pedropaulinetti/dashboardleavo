import { and, count, countDistinct, desc, eq, gte, isNotNull, lte, inArray, sql, sum } from 'drizzle-orm'
import type { db } from '@/db'
import { adMetrics, FUNNEL_STAGES, leads, leadStageEvents } from '@/db/schema'
import { buildDonutArcs, type DonutArc } from './donut'
import { buildFunnelPaths, type FunnelPath } from './funnel-svg'
import { LOSS_REASONS } from './loss-reasons'
import { delta, safeDiv } from './math'
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

// Soma de spendCents de ad_metrics no range/canal (por ad_metrics.date e ad_metrics.channel).
async function sumInvestCents(
  database: AnyDb,
  organizationId: string,
  f: Filters,
): Promise<number> {
  const [row] = await database
    .select({ total: sum(adMetrics.spendCents) })
    .from(adMetrics)
    .where(adMetricsWhere(organizationId, f))
  return Number(row?.total ?? 0)
}

// Somas agregadas de ad_metrics (invest/impressions/clicks) no range/canal.
async function sumAdAggregates(
  database: AnyDb,
  organizationId: string,
  f: Filters,
): Promise<{ investCents: number; impressions: number; clicks: number }> {
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
  deltas: {
    receita: number | null
    vendas: number | null
    invest: number | null
    roas: number | null
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
  const [receitaCents, investCents, curCounts] = await Promise.all([
    sumReceitaCents(database, organizationId, currentFilters),
    sumInvestCents(database, organizationId, currentFilters),
    getFunnelCounts(database, organizationId, currentFilters),
  ])
  const [prevReceita, prevInvest, prevCounts] = await Promise.all([
    sumReceitaCents(database, organizationId, prevFilters),
    sumInvestCents(database, organizationId, prevFilters),
    getFunnelCounts(database, organizationId, prevFilters),
  ])

  const vendas = curCounts[5]
  const prevVendas = prevCounts[5]
  const roas = safeDiv(receitaCents, investCents)
  const prevRoas = safeDiv(prevReceita, prevInvest)

  return {
    receitaCents,
    vendas,
    investCents,
    roas,
    deltas: {
      receita: delta(receitaCents, prevReceita),
      vendas: delta(vendas, prevVendas),
      invest: delta(investCents, prevInvest),
      roas: deltaOrNull(roas, prevRoas),
    },
  }
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

// Calcula os custos do período (CPL/CPMQL/CPM/CPC) a partir das somas de ad_metrics
// e das contagens de funil (leads, mql).
async function costsFor(
  database: AnyDb,
  organizationId: string,
  f: Filters,
): Promise<{ cpl: number | null; cpmql: number | null; cpm: number | null; cpc: number | null }> {
  const [agg, counts] = await Promise.all([
    sumAdAggregates(database, organizationId, f),
    getFunnelCounts(database, organizationId, f),
  ])
  const leadsN = counts[0]
  const mqlN = counts[1]
  return {
    cpl: safeDiv(agg.investCents, leadsN),
    cpmql: safeDiv(agg.investCents, mqlN),
    cpm: safeDiv(agg.investCents * 1000, agg.impressions),
    cpc: safeDiv(agg.investCents, agg.clicks),
  }
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

  const rows = await database
    .select({
      source: leads.utmSource,
      campaign: leads.utmCampaign,
      leads: count(),
      vendas: sql<number>`count(*) filter (where ${reachedVendas})`,
    })
    .from(leads)
    .where(leadCohortWhere(organizationId, filters))
    .groupBy(leads.utmSource, leads.utmCampaign)
    .orderBy(
      desc(sql`count(*) filter (where ${reachedVendas})`),
      desc(count()),
    )
    .limit(5)

  // Spend por campanha no range/canal (uma query separada, juntado em memória).
  const spendRows = await database
    .select({
      campaign: adMetrics.campaign,
      spend: sum(adMetrics.spendCents),
    })
    .from(adMetrics)
    .where(adMetricsWhere(organizationId, filters))
    .groupBy(adMetrics.campaign)
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
}

/**
 * Ranking de criativos: agrupa ad_metrics por creative no range/canal.
 * Ordena por receita desc. Top 5. Escopo: org.
 */
export async function getCreatives(
  database: AnyDb,
  organizationId: string,
  filters: Filters,
): Promise<CreativeItem[]> {
  const rows = await database
    .select({
      name: adMetrics.creative,
      channel: sql<string | null>`max(${adMetrics.channel})`,
      vendas: sum(adMetrics.sales),
      revenueCents: sum(adMetrics.revenueCents),
    })
    .from(adMetrics)
    .where(adMetricsWhere(organizationId, filters))
    .groupBy(adMetrics.creative)
    .orderBy(desc(sum(adMetrics.revenueCents)))
    .limit(5)

  return rows.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    channel: r.channel,
    vendas: Number(r.vendas ?? 0),
    revenueCents: Number(r.revenueCents ?? 0),
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

  const [funnel, highlights, costCards, utm, creatives, loss] = await Promise.all([
    getFunnel(database, organizationId, cur),
    getHighlights(database, organizationId, cur, prev),
    getCostCards(database, organizationId, cur, prev),
    getUtmRanking(database, organizationId, cur),
    getCreatives(database, organizationId, cur),
    getLossReasons(database, organizationId, cur),
  ])

  const funnelPaths = buildFunnelPaths(funnel.counts)
  const donutArcs = buildDonutArcs(loss.rows.map((r) => r.count))

  return { funnel, highlights, costCards, utm, creatives, loss, funnelPaths, donutArcs }
}
