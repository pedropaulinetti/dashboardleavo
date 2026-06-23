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
  tags?: { name?: string | null }[] | null
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
  stage?: {
    id: string
    name: string
    index: number
    pipeline?: { id: string; name?: string } | null
  } | null
}

type BusinessesResponse = { count: number; data: Business[] }

type LossReason = { id: string; name: string }
type LossReasonsResponse = { count: number; data: LossReason[] }

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

// A origem que aparece no ranking de UTMs: lead.source com trim; vazio/null → undefined.
function deriveUtmSource(lead: Lead | null | undefined): string | undefined {
  const source = (lead?.source ?? '').trim()
  return source || undefined
}

// Regras de canal a partir do nome das tags (case-insensitive). Ordem de varredura
// importa: a primeira correspondência vence.
const CHANNEL_RULES: { needle: string; channel: string }[] = [
  { needle: 'meta', channel: 'meta' },
  { needle: 'google', channel: 'google' },
  { needle: 'whats', channel: 'whats' },
  { needle: 'indica', channel: 'indica' },
  { needle: 'parceir', channel: 'parceiro' },
  { needle: 'agencia', channel: 'parceiro' },
]

// Deriva o canal: varre os nomes das tags procurando uma regra; se nenhuma casar,
// usa o source (minúsculas/trim) como fallback, ou undefined se vazio.
function deriveChannel(tags: Lead['tags'], source: string | null | undefined): string | undefined {
  const names = (tags ?? []).map((t) => (t?.name ?? '').toLowerCase())
  for (const { needle, channel } of CHANNEL_RULES) {
    if (names.some((n) => n.includes(needle))) return channel
  }
  const fallback = (source ?? '').trim().toLowerCase()
  return fallback || undefined
}

function toCents(total: number | null | undefined, unit: DataCrazyConfig['valueUnit'] | undefined): number {
  const value = typeof total === 'number' && Number.isFinite(total) ? total : 0
  return unit === 'cents' ? Math.round(value) : Math.round(value * 100)
}

// Busca UMA vez os motivos de perda e monta um mapa id → name. Se a chamada falhar,
// devolve mapa vazio (não quebra o sync por causa disso).
async function fetchLossReasonNames(
  apiKey: string,
  fetchImpl: FetchLike | undefined,
): Promise<Record<string, string>> {
  try {
    const { data } = await fetchJson<LossReasonsResponse>(`${BASE_URL}/business-loss-reasons`, {
      token: apiKey,
      fetchImpl,
    })
    const map: Record<string, string> = {}
    for (const r of data ?? []) {
      if (r?.id && r?.name) map[r.id] = r.name
    }
    return map
  } catch {
    return {}
  }
}

function lostReasonFor(
  business: Business,
  config: DataCrazyConfig | undefined,
  lossReasonNames: Record<string, string>,
): string | null {
  const id = business.lossReasonId
  if (id && config?.lossReasonMap?.[id]) return config.lossReasonMap[id]
  if (id && lossReasonNames[id]) return lossReasonNames[id]
  return id ?? 'Perdido'
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

    // Busca UMA vez os motivos de perda (id → name) para traduzir o lossReasonId.
    const lossReasonNames = await fetchLossReasonNames(apiKey, fetchImpl)

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

    // PASSE 1 — descobrir os pipelines "em escopo" do funil: um pipeline está em escopo
    // se existe ≥1 negócio cujo estágio está mapeado (não-ignore) no stageMap. Assim só
    // contam negócios dos pipelines que o usuário realmente mapeou (ex.: "Funil de Vendas"),
    // ignorando outros pipelines (Outbound/CS) que aparecem na mesma conta.
    const inScopePipelines = new Set<string>()
    for (const business of all) {
      const mapped = config ? mapStage(config.stageMap, business.stageId) : null
      const pipelineId = business.stage?.pipeline?.id
      if (mapped != null && pipelineId) inScopePipelines.add(pipelineId)
    }

    const leads: NormalizedLead[] = []
    const stageEvents: NormalizedStageEvent[] = []
    let maxLastMoved: string | null = cursor

    // PASSE 2 — normalizar.
    for (const business of all) {
      const lastMoved = business.lastMovedAt ?? business.statusChangedAt ?? null
      if (lastMoved && (maxLastMoved == null || lastMoved > maxLastMoved)) {
        maxLastMoved = lastMoved
      }

      const mapped = config ? mapStage(config.stageMap, business.stageId) : null
      const pipelineId = business.stage?.pipeline?.id
      const inScope = !!pipelineId && inScopePipelines.has(pipelineId)

      // currentStage final + emissão (ou não) de stage events, por status.
      let currentStage: FunnelStage
      let lostReason: string | null = null
      let emitEvents = true

      if (business.status === 'lost') {
        // Perda só no donut: vira lead com lostReason, SEM nenhum stage event (não entra
        // no funil de etapas). Fora de escopo → pula.
        if (!inScope) continue
        currentStage = 'negociacoes' // apenas rótulo; não afeta o funil (sem events)
        lostReason = lostReasonFor(business, config, lossReasonNames)
        emitEvents = false
      } else if (business.status === 'won') {
        // Ganho em pipeline do funil = venda (não depende de o estágio "Fechado" estar
        // mapeado). Fora de escopo → pula.
        if (!inScope) continue
        currentStage = 'vendas'
      } else {
        // in_process (ou outro): segue o mapeamento. Estágio não mapeado → pula.
        if (mapped == null) continue
        currentStage = mapped
      }

      leads.push({
        externalId: business.id,
        channel: deriveChannel(business.lead?.tags, business.lead?.source),
        utmSource: deriveUtmSource(business.lead),
        utmCampaign: undefined,
        currentStage,
        valueCents: toCents(business.total, config?.valueUnit),
        lostReason,
        identityKey: deriveIdentityKey(business.lead),
        createdAt: new Date(business.createdAt),
        updatedAt: new Date(business.lastMovedAt ?? business.createdAt),
      })

      if (emitEvents) stageEvents.push(...buildStageEvents(business, currentStage))
    }

    return { leads, stageEvents, adMetrics: [], nextCursor: maxLastMoved }
  },
}
