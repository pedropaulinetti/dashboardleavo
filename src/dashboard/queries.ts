import { and, count, countDistinct, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm'
import type { db } from '@/db'
import { adMetrics, FUNNEL_STAGES, leads, leadStageEvents } from '@/db/schema'
import { delta, safeDiv } from './math'

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
      n: countDistinct(leadStageEvents.leadId),
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
      roas: prevRoas === null ? null : delta(roas ?? 0, prevRoas),
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
  const rows = await database
    .select({
      source: leads.utmSource,
      campaign: leads.utmCampaign,
      leads: count(),
      vendas: sql<number>`count(*) filter (where ${eq(leads.currentStage, 'vendas')})`,
    })
    .from(leads)
    .where(leadCohortWhere(organizationId, filters))
    .groupBy(leads.utmSource, leads.utmCampaign)
    .orderBy(
      desc(sql`count(*) filter (where ${eq(leads.currentStage, 'vendas')})`),
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
