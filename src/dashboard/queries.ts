import { and, countDistinct, eq, gte, inArray, lte, sum } from 'drizzle-orm'
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

// Soma de spendCents de ad_metrics no range/canal (por ad_metrics.date e ad_metrics.channel).
async function sumInvestCents(
  database: AnyDb,
  organizationId: string,
  f: Filters,
): Promise<number> {
  const conds = [
    eq(adMetrics.organizationId, organizationId),
    gte(adMetrics.date, f.from),
    lte(adMetrics.date, f.to),
  ]
  if (f.channel !== 'all') conds.push(eq(adMetrics.channel, f.channel))
  const [row] = await database
    .select({ total: sum(adMetrics.spendCents) })
    .from(adMetrics)
    .where(and(...conds))
  return Number(row?.total ?? 0)
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
