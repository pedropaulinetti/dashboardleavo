// Adaptador real do DataCrazy.
// Puxa os negócios (businesses), aplica o MAPEAMENTO do usuário (estágio do CRM →
// etapa do funil) e normaliza em leads + stage events. Sem métricas de anúncio.
//
// API real (confirmada via probe):
//   Base https://api.g1.datacrazy.io/api/v1, auth Bearer <apiKey>.
//   GET /businesses?skip=0&take=100 → { count: N, data: Business[] }
//   Filtro incremental: filter[lastMovedAfter]=<ISO> (usamos o cursor como esse valor).

import { fetchJson, type FetchLike } from '../http'
import {
  FUNNEL_STAGE_VALUES,
  mapStage,
  normalizeIdentity,
  type DataCrazyConfig,
  type FunnelStage,
} from '../mapping'
import type {
  NormalizedLead,
  NormalizedStageEvent,
  PullResult,
  SourceAdapter,
} from '../types'

const BASE_URL = 'https://api.g1.datacrazy.io/api/v1'
const PAGE_SIZE = 100
const MAX_PAGES = 1000

type Contact = { platform: 'EMAIL' | 'WHATSAPP' | string; contactId: string }

type Lead = {
  id?: string
  name?: string | null
  email?: string | null
  phone?: string | null
  source?: string | null
  contacts?: Contact[] | null
  createdAt?: string | null
}

type Business = {
  id: string
  createdAt: string
  stageId: string
  leadId?: string
  total?: number | null
  discount?: number | null
  status: 'won' | 'in_process' | 'lost' | string
  lastMovedAt?: string | null
  statusChangedAt?: string | null
  lossReasonId?: string | null
  externalId?: string | null
  lead?: Lead | null
  stage?: { id: string; name: string; index: number } | null
}

type BusinessesResponse = { count: number; data: Business[] }

// O ctx do pull, estendido localmente para carregar o config salvo e um fetch injetável.
type DataCrazyPullCtx = {
  credentials: Record<string, unknown>
  cursor: string | null
  config?: DataCrazyConfig
  fetchImpl?: FetchLike
}

// Extrai email/phone do lead embutido (campos diretos ou nos contacts) e devolve a
// identityKey normalizada.
function deriveIdentityKey(lead: Lead | null | undefined): string | null {
  let email = lead?.email ?? null
  let phone = lead?.phone ?? null
  for (const c of lead?.contacts ?? []) {
    if (!c?.contactId) continue
    if (c.platform === 'EMAIL' && !email) email = c.contactId
    if (c.platform === 'WHATSAPP' && !phone) phone = c.contactId
  }
  return normalizeIdentity(email, phone)
}

function toCents(total: number | null | undefined, unit: DataCrazyConfig['valueUnit'] | undefined): number {
  const value = typeof total === 'number' && Number.isFinite(total) ? total : 0
  return unit === 'cents' ? Math.round(value) : Math.round(value * 100)
}

function lostReasonFor(business: Business, config: DataCrazyConfig | undefined): string | null {
  const id = business.lossReasonId
  if (id && config?.lossReasonMap?.[id]) return config.lossReasonMap[id]
  return id ?? 'Perdido'
}

// Resolve a etapa final do funil aplicando o mapeamento + regras de won/lost.
// Devolve null quando o business deve ser PULADO (estágio "não usar").
function resolveFunnelStage(
  business: Business,
  config: DataCrazyConfig | undefined,
): FunnelStage | null {
  const mapped = config ? mapStage(config.stageMap, business.stageId) : null
  if (business.status === 'won') return 'vendas'
  if (business.status === 'lost') return mapped ?? 'negociacoes'
  return mapped // null → pular
}

// Emite um evento para CADA etapa de 'leads' até a etapa final (inclusive),
// na ordem de FUNNEL_STAGE_VALUES. Etapas anteriores usam createdAt; a final usa
// lastMovedAt (ou statusChangedAt, ou createdAt).
function buildStageEvents(business: Business, finalStage: FunnelStage): NormalizedStageEvent[] {
  const finalIndex = FUNNEL_STAGE_VALUES.indexOf(finalStage)
  const createdAt = new Date(business.createdAt)
  const finalAt = new Date(business.lastMovedAt ?? business.statusChangedAt ?? business.createdAt)
  const events: NormalizedStageEvent[] = []
  for (let i = 0; i <= finalIndex; i++) {
    const stage = FUNNEL_STAGE_VALUES[i]
    events.push({
      leadExternalId: business.id,
      stage,
      occurredAt: i === finalIndex ? finalAt : createdAt,
    })
  }
  return events
}

async function fetchPage(
  apiKey: string,
  cursor: string | null,
  skip: number,
  fetchImpl: FetchLike | undefined,
): Promise<BusinessesResponse> {
  const url = new URL(`${BASE_URL}/businesses`)
  url.searchParams.set('skip', String(skip))
  url.searchParams.set('take', String(PAGE_SIZE))
  if (cursor) url.searchParams.set('filter[lastMovedAfter]', cursor)
  return fetchJson<BusinessesResponse>(url.toString(), { token: apiKey, fetchImpl })
}

export const datacrazyAdapter: SourceAdapter = {
  provider: 'datacrazy',
  async pull(ctx): Promise<PullResult> {
    const { credentials, cursor, config, fetchImpl } = ctx as DataCrazyPullCtx

    const apiKey = credentials?.apiKey
    if (typeof apiKey !== 'string' || !apiKey) {
      throw new Error('datacrazy: credencial "apiKey" ausente ou inválida')
    }

    // Pagina /businesses até acumular >= count ou uma página vazia.
    const all: Business[] = []
    let skip = 0
    for (let page = 0; page < MAX_PAGES; page++) {
      const { count, data } = await fetchPage(apiKey, cursor, skip, fetchImpl)
      if (!data || data.length === 0) break
      all.push(...data)
      skip += data.length
      if (typeof count === 'number' && all.length >= count) break
    }

    const leads: NormalizedLead[] = []
    const stageEvents: NormalizedStageEvent[] = []
    let maxLastMoved: string | null = cursor

    for (const business of all) {
      const lastMoved = business.lastMovedAt ?? business.statusChangedAt ?? null
      if (lastMoved && (maxLastMoved == null || lastMoved > maxLastMoved)) {
        maxLastMoved = lastMoved
      }

      const funnelStage = resolveFunnelStage(business, config)
      if (funnelStage == null) continue // estágio não mapeado e não é won/lost → pula

      const isLost = business.status === 'lost'

      leads.push({
        externalId: business.id,
        channel: (business.lead?.source ?? '').trim().toLowerCase() || undefined,
        utmSource: undefined,
        utmCampaign: undefined,
        currentStage: funnelStage,
        valueCents: toCents(business.total, config?.valueUnit),
        lostReason: isLost ? lostReasonFor(business, config) : null,
        identityKey: deriveIdentityKey(business.lead),
        createdAt: new Date(business.createdAt),
        updatedAt: new Date(business.lastMovedAt ?? business.createdAt),
      })

      stageEvents.push(...buildStageEvents(business, funnelStage))
    }

    return { leads, stageEvents, adMetrics: [], nextCursor: maxLastMoved }
  },
}
