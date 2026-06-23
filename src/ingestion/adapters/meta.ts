// Adaptador real do Meta Ads.
// Puxa insights por anúncio/dia (level=ad, time_increment=1) e normaliza em
// NormalizedAdMetric (gasto, impressões, cliques, campanha, criativo). Alimenta os
// cards de custo (CPL/CPM/CPC) e a linha de Investimento do gráfico.
//
// API real (confirmada via probe):
//   GET https://graph.facebook.com/v21.0/{adAccountId}/insights
//   query: level=ad, time_increment=1,
//          fields=spend,impressions,clicks,campaign_name,ad_name,
//          time_range={"since":"YYYY-MM-DD","until":"YYYY-MM-DD"} (JSON url-encoded),
//          limit=500, access_token={token} (NA QUERY STRING).
//   Resposta: { data: Row[], paging?: { next?: <url completa>, cursors?: {...} } }.
//   spend/impressions/clicks vêm como string; spend em reais ("12.34") → centavos.
//   Paginação: seguir paging.next (URL completa) até não haver mais next/data.

import { fetchJson, type FetchLike } from '../http'
import type { NormalizedAdMetric, PullResult, SourceAdapter } from '../types'

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const INSIGHTS_FIELDS = 'spend,impressions,clicks,campaign_name,ad_name'
const PAGE_LIMIT = 500
const MAX_PAGES = 200
const LOOKBACK_DAYS = 365

type InsightsRow = {
  spend?: string | null
  impressions?: string | null
  clicks?: string | null
  campaign_name?: string | null
  ad_name?: string | null
  date_start?: string | null
  date_stop?: string | null
}

type InsightsResponse = {
  data?: InsightsRow[] | null
  paging?: { next?: string | null; cursors?: unknown } | null
}

// O ctx do pull com um fetch injetável.
type MetaPullCtx = {
  credentials: Record<string, unknown>
  cursor: string | null
  fetchImpl?: FetchLike
}

// Garante o prefixo act_ no id da conta (pode vir com ou sem).
function normalizeAdAccountId(id: string): string {
  return id.startsWith('act_') ? id : `act_${id}`
}

// Data UTC no formato YYYY-MM-DD.
function toUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Monta a URL inicial de insights (level=ad, time_increment=1, fields, time_range,
// limit, access_token na query).
function buildInsightsUrl(
  adAccountId: string,
  accessToken: string,
  since: string,
  until: string,
): string {
  const url = new URL(`${GRAPH_BASE}/${adAccountId}/insights`)
  url.searchParams.set('level', 'ad')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('fields', INSIGHTS_FIELDS)
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('limit', String(PAGE_LIMIT))
  url.searchParams.set('access_token', accessToken)
  return url.toString()
}

function toMetric(row: InsightsRow): NormalizedAdMetric {
  return {
    date: new Date(`${row.date_start ?? ''}T00:00:00.000Z`),
    campaign: row.campaign_name ?? '',
    creative: row.ad_name ?? '',
    channel: 'meta',
    spendCents: Math.round(parseFloat(row.spend ?? '0') * 100),
    impressions: parseInt(row.impressions ?? '0', 10),
    clicks: parseInt(row.clicks ?? '0', 10),
    leads: 0,
    sales: 0,
    revenueCents: 0,
  }
}

export const metaAdapter: SourceAdapter = {
  provider: 'meta_ads',
  async pull(ctx): Promise<PullResult> {
    const { credentials, cursor, fetchImpl } = ctx as MetaPullCtx

    const adAccountIdRaw = credentials?.adAccountId
    if (typeof adAccountIdRaw !== 'string' || !adAccountIdRaw) {
      throw new Error('meta_ads: credencial "adAccountId" ausente ou inválida')
    }
    const accessToken = credentials?.accessToken
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('meta_ads: credencial "accessToken" ausente ou inválida')
    }

    const adAccountId = normalizeAdAccountId(adAccountIdRaw)

    // Janela: until = hoje (UTC); since = cursor (se houver) ou hoje − 365 dias.
    const until = toUtcDate(new Date())
    const since =
      typeof cursor === 'string' && cursor
        ? cursor
        : toUtcDate(new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000))

    const adMetrics: NormalizedAdMetric[] = []

    // Pagina seguindo paging.next (URL completa já vem com tudo, inclusive token).
    let nextUrl: string | null = buildInsightsUrl(adAccountId, accessToken, since, until)
    for (let page = 0; page < MAX_PAGES && nextUrl; page++) {
      const res: InsightsResponse = await fetchJson<InsightsResponse>(nextUrl, { fetchImpl })
      const rows = res.data ?? []
      if (rows.length === 0) break
      for (const row of rows) adMetrics.push(toMetric(row))
      nextUrl = res.paging?.next ?? null
    }

    // nextCursor = hoje (UTC). O próximo sync começa daí; re-puxar o último dia é
    // aceitável porque o persist faz upsert por (org, provider, date, campaign, creative).
    return { leads: [], stageEvents: [], adMetrics, nextCursor: until }
  },
}
