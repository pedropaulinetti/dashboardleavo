import { describe, it, expect } from 'vitest'
import { datacrazyAdapter } from '@/ingestion/adapters/datacrazy'
import type { FetchLike } from '@/ingestion/http'
import type { DataCrazyConfig } from '@/ingestion/mapping'
import type { NormalizedLead, NormalizedStageEvent } from '@/ingestion/types'

// stageIds fictícios mas estáveis
const STAGE_NEGOCIACAO = 'stg-negociacao'
const STAGE_FECHADO = 'stg-fechado'
const STAGE_IGNORE = 'stg-ignore'
// estágio do funil "PERDIDOS" — NÃO mapeado (perda fica só no donut)
const STAGE_PERDIDOS = 'stg-perdidos'
// estágios de OUTRO pipeline (Outbound) — nenhum mapeado → pipeline fora de escopo
const STAGE_OUT_NEG = 'stg-out-neg'
const STAGE_OUT_FECHADO = 'stg-out-fechado'

// ids de pipeline
const PIPE_FUNIL = 'pf'
const PIPE_OUTBOUND = 'po'

const config: DataCrazyConfig = {
  stageMap: {
    [STAGE_NEGOCIACAO]: 'negociacoes',
    [STAGE_FECHADO]: 'vendas',
    [STAGE_IGNORE]: 'ignore',
  },
  valueUnit: 'reais',
  lossReasonMap: { 'reason-1': 'Preço alto' },
}

// Negócios em 2 pipelines:
//  - Funil de Vendas (pf): won, in_process(negociacao), lost(PERDIDOS não mapeado), in_process(ignore -> pulado)
//  - Outbound (po): lost e won — pipeline sem nenhum estágio mapeado → fora de escopo → pulados
const businesses = [
  {
    id: 'biz-won',
    createdAt: '2026-01-01T10:00:00.000Z',
    lastMovedAt: '2026-01-05T12:00:00.000Z',
    statusChangedAt: '2026-01-05T12:00:00.000Z',
    stageId: STAGE_FECHADO,
    leadId: 'lead-won',
    total: 1000, // R$1000 -> 100000 cents
    discount: 0,
    status: 'won',
    lossReasonId: null,
    externalId: null,
    lead: {
      id: 'lead-won',
      name: 'Ana',
      email: 'ANA@Example.com',
      phone: null,
      source: 'leavo_lp_videodemo',
      tags: [
        { name: 'LP-PRINCIPAL' },
        { name: 'META' },
        { name: '-10K' },
      ],
      contacts: [],
      createdAt: '2026-01-01T10:00:00.000Z',
    },
    stage: { id: STAGE_FECHADO, name: 'Fechado', index: 5, pipeline: { id: PIPE_FUNIL, name: 'Funil de Vendas' } },
  },
  {
    id: 'biz-neg',
    createdAt: '2026-01-02T09:00:00.000Z',
    lastMovedAt: '2026-01-06T08:00:00.000Z',
    statusChangedAt: '2026-01-06T08:00:00.000Z',
    stageId: STAGE_NEGOCIACAO,
    leadId: 'lead-neg',
    total: 2500.5, // -> 250050 cents
    discount: 0,
    status: 'in_process',
    lossReasonId: null,
    externalId: null,
    lead: {
      id: 'lead-neg',
      name: 'Bruno',
      email: null,
      phone: null,
      source: 'homepage',
      tags: [{ name: 'IMPLEMENTAÇÃO' }],
      contacts: [
        { platform: 'WHATSAPP', contactId: '+55 (11) 99999-1234' },
      ],
      createdAt: '2026-01-02T09:00:00.000Z',
    },
    stage: { id: STAGE_NEGOCIACAO, name: 'Negociação', index: 4, pipeline: { id: PIPE_FUNIL, name: 'Funil de Vendas' } },
  },
  {
    id: 'biz-lost',
    createdAt: '2026-01-03T11:00:00.000Z',
    lastMovedAt: '2026-01-07T15:00:00.000Z',
    statusChangedAt: '2026-01-07T15:00:00.000Z',
    stageId: STAGE_PERDIDOS,
    leadId: 'lead-lost',
    total: 500,
    discount: 0,
    status: 'lost',
    lossReasonId: 'reason-1',
    externalId: null,
    lead: {
      id: 'lead-lost',
      name: 'Carla',
      email: 'carla@example.com',
      phone: null,
      source: null,
      tags: [{ name: 'indicação' }],
      contacts: [{ platform: 'EMAIL', contactId: 'carla@example.com' }],
      createdAt: '2026-01-03T11:00:00.000Z',
    },
    stage: { id: STAGE_PERDIDOS, name: 'PERDIDOS', index: 6, pipeline: { id: PIPE_FUNIL, name: 'Funil de Vendas' } },
  },
  {
    id: 'biz-ignore',
    createdAt: '2026-01-04T11:00:00.000Z',
    lastMovedAt: '2026-01-04T11:30:00.000Z',
    statusChangedAt: '2026-01-04T11:30:00.000Z',
    stageId: STAGE_IGNORE,
    leadId: 'lead-ignore',
    total: 0,
    discount: 0,
    status: 'in_process',
    lossReasonId: null,
    externalId: null,
    lead: {
      id: 'lead-ignore',
      name: 'Dudu',
      email: 'dudu@example.com',
      phone: null,
      source: 'Site',
      contacts: [],
      createdAt: '2026-01-04T11:00:00.000Z',
    },
    stage: { id: STAGE_IGNORE, name: 'Pré', index: 0, pipeline: { id: PIPE_FUNIL, name: 'Funil de Vendas' } },
  },
  // Outbound — pipeline fora de escopo (nenhum estágio mapeado)
  {
    id: 'biz-out-lost',
    createdAt: '2026-01-02T11:00:00.000Z',
    lastMovedAt: '2026-01-03T11:30:00.000Z',
    statusChangedAt: '2026-01-03T11:30:00.000Z',
    stageId: STAGE_OUT_NEG,
    leadId: 'lead-out-lost',
    total: 800,
    discount: 0,
    status: 'lost',
    lossReasonId: 'reason-1',
    externalId: null,
    lead: {
      id: 'lead-out-lost',
      name: 'Edu',
      email: 'edu@example.com',
      phone: null,
      source: 'Outbound',
      contacts: [],
      createdAt: '2026-01-02T11:00:00.000Z',
    },
    stage: { id: STAGE_OUT_NEG, name: 'Negociação Outbound', index: 3, pipeline: { id: PIPE_OUTBOUND, name: 'Outbound' } },
  },
  {
    id: 'biz-out-won',
    createdAt: '2026-01-02T12:00:00.000Z',
    lastMovedAt: '2026-01-03T12:30:00.000Z',
    statusChangedAt: '2026-01-03T12:30:00.000Z',
    stageId: STAGE_OUT_FECHADO,
    leadId: 'lead-out-won',
    total: 900,
    discount: 0,
    status: 'won',
    lossReasonId: null,
    externalId: null,
    lead: {
      id: 'lead-out-won',
      name: 'Fabi',
      email: 'fabi@example.com',
      phone: null,
      source: 'Outbound',
      contacts: [],
      createdAt: '2026-01-02T12:00:00.000Z',
    },
    stage: { id: STAGE_OUT_FECHADO, name: 'Fechado Outbound', index: 5, pipeline: { id: PIPE_OUTBOUND, name: 'Outbound' } },
  },
]

function makeFetch(): FetchLike {
  return async (url) => {
    const u = new URL(url)
    const skip = Number(u.searchParams.get('skip') ?? '0')
    const page = skip === 0 ? businesses : []
    return new Response(JSON.stringify({ count: businesses.length, data: page }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

function leadById(leads: NormalizedLead[], externalId: string): NormalizedLead {
  const found = leads.find((l) => l.externalId === externalId)
  if (!found) throw new Error(`lead ${externalId} não encontrado`)
  return found
}

function stagesOf(events: NormalizedStageEvent[], externalId: string): string[] {
  return events.filter((e) => e.leadExternalId === externalId).map((e) => e.stage)
}

describe('datacrazyAdapter', () => {
  it('provider é datacrazy', () => {
    expect(datacrazyAdapter.provider).toBe('datacrazy')
  })

  it('lança erro claro quando falta apiKey', async () => {
    await expect(
      datacrazyAdapter.pull({ credentials: {}, cursor: null, config, fetchImpl: makeFetch() }),
    ).rejects.toThrow(/apiKey/i)
  })

  it('won vira vendas, valor convertido e 6 stage events', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })

    const won = leadById(r.leads, 'biz-won')
    expect(won.currentStage).toBe('vendas')
    expect(won.valueCents).toBe(100000)
    expect(won.lostReason ?? null).toBeNull()
    expect(stagesOf(r.stageEvents, 'biz-won')).toEqual([
      'leads',
      'mql',
      'agendadas',
      'realizadas',
      'negociacoes',
      'vendas',
    ])
  })

  it('in_process em negociação vira negociacoes, 5 stage events, valor convertido', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })

    const neg = leadById(r.leads, 'biz-neg')
    expect(neg.currentStage).toBe('negociacoes')
    expect(neg.valueCents).toBe(250050)
    expect(stagesOf(r.stageEvents, 'biz-neg')).toEqual([
      'leads',
      'mql',
      'agendadas',
      'realizadas',
      'negociacoes',
    ])
  })

  it('lost (no funil) vira lead com lostReason e NENHUM stage event (só donut)', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })

    const lost = leadById(r.leads, 'biz-lost')
    expect(lost.lostReason).toBe('Preço alto')
    expect(lost.currentStage).toBe('negociacoes') // apenas rótulo; não afeta funil
    // perda NÃO entra no funil de etapas → nenhum stage event para esse lead
    expect(stagesOf(r.stageEvents, 'biz-lost')).toEqual([])
    expect(r.stageEvents.some((e) => e.leadExternalId === 'biz-lost')).toBe(false)
  })

  it('identityKey derivado de email e dos contacts (WhatsApp)', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })

    expect(leadById(r.leads, 'biz-won').identityKey).toBe('ana@example.com')
    expect(leadById(r.leads, 'biz-neg').identityKey).toBe('5511999991234')
    expect(leadById(r.leads, 'biz-lost').identityKey).toBe('carla@example.com')
  })

  it('business com stage ignore (in_process) é pulado', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })
    expect(r.leads.find((l) => l.externalId === 'biz-ignore')).toBeUndefined()
    expect(stagesOf(r.stageEvents, 'biz-ignore')).toEqual([])
  })

  it('utmSource = source e channel derivado da tag META (won)', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })
    const won = leadById(r.leads, 'biz-won')
    expect(won.utmSource).toBe('leavo_lp_videodemo')
    expect(won.utmCampaign).toBeUndefined()
    expect(won.channel).toBe('meta')
    expect(r.adMetrics).toEqual([])
  })

  it('tag indicação sem source → channel indica e utmSource undefined (também em lost)', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })
    const lost = leadById(r.leads, 'biz-lost')
    expect(lost.channel).toBe('indica')
    expect(lost.utmSource).toBeUndefined()
  })

  it('source homepage sem tag de canal → channel = homepage (fallback), utmSource = homepage', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })
    const neg = leadById(r.leads, 'biz-neg')
    expect(neg.channel).toBe('homepage')
    expect(neg.utmSource).toBe('homepage')
  })

  it('nextCursor é o maior lastMovedAt visto', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })
    expect(r.nextCursor).toBe('2026-01-07T15:00:00.000Z')
  })

  it('negócios de pipeline fora de escopo (Outbound) são pulados (won e lost)', async () => {
    const r = await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: null,
      config,
      fetchImpl: makeFetch(),
    })
    expect(r.leads.find((l) => l.externalId === 'biz-out-lost')).toBeUndefined()
    expect(r.leads.find((l) => l.externalId === 'biz-out-won')).toBeUndefined()
    expect(stagesOf(r.stageEvents, 'biz-out-lost')).toEqual([])
    expect(stagesOf(r.stageEvents, 'biz-out-won')).toEqual([])
  })

  it('passa filter[lastMovedAfter] quando há cursor', async () => {
    let receivedUrl = ''
    const fetchImpl: FetchLike = async (url) => {
      receivedUrl = url
      return new Response(JSON.stringify({ count: 0, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await datacrazyAdapter.pull({
      credentials: { apiKey: 'k' },
      cursor: '2026-01-01T00:00:00.000Z',
      config,
      fetchImpl,
    })
    const u = new URL(receivedUrl)
    expect(u.searchParams.get('filter[lastMovedAfter]')).toBe('2026-01-01T00:00:00.000Z')
  })
})
