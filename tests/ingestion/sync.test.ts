import { describe, it, expect, beforeAll } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { connectIntegration } from '@/ingestion/integrations'
import { syncOrg } from '@/ingestion/sync'
import type { SourceAdapter } from '@/ingestion/types'
import { makeTestDb } from '../db'

type Db = Awaited<ReturnType<typeof makeTestDb>>['db']

let db: Db
let orgA: string
let orgB: string

const FIXED_CREATED = new Date('2025-01-01T10:00:00.000Z')
const FIXED_UPDATED = new Date('2025-01-02T10:00:00.000Z')
const FIXED_OCCURRED = new Date('2025-01-01T11:00:00.000Z')
const FIXED_NOW = new Date('2026-06-18T00:00:00.000Z')

// Captura o último ctx.config recebido pelo fake leavo (para asserção de repasse).
let lastLeavoConfig: unknown

// fake leavo: 1 lead + 1 stage event + cursor 'cur1' (datas fixas).
// Lê ctx.config e o registra para verificarmos que o sync repassou o config.
const fakeLeavo: SourceAdapter = {
  provider: 'leavo',
  async pull(ctx) {
    lastLeavoConfig = ctx.config
    return {
      leads: [
        {
          externalId: 'lead-1',
          channel: 'paid',
          currentStage: 'leads',
          valueCents: 1000,
          createdAt: FIXED_CREATED,
          updatedAt: FIXED_UPDATED,
        },
      ],
      stageEvents: [{ leadExternalId: 'lead-1', stage: 'leads', occurredAt: FIXED_OCCURRED }],
      adMetrics: [],
      nextCursor: 'cur1',
    }
  },
}

// fake datacrazy: lança Error('boom')
const fakeDatacrazy: SourceAdapter = {
  provider: 'datacrazy',
  async pull() {
    throw new Error('boom')
  },
}

const adapters: Record<string, SourceAdapter> = {
  leavo: fakeLeavo,
  datacrazy: fakeDatacrazy,
}

async function intRow(orgId: string, provider: 'leavo' | 'datacrazy' | 'meta_ads' | 'webhook') {
  const [row] = await db
    .select()
    .from(schema.integrations)
    .where(
      and(eq(schema.integrations.organizationId, orgId), eq(schema.integrations.provider, provider)),
    )
  return row
}

describe('syncOrg', () => {
  beforeAll(async () => {
    ;({ db } = await makeTestDb())
    const [a] = await db.insert(schema.organizations).values({ name: 'A', slug: 'a' }).returning()
    const [b] = await db.insert(schema.organizations).values({ name: 'B', slug: 'b' }).returning()
    orgA = a.id
    orgB = b.id

    // Org A: 2 integrações pull conectadas + 1 webhook (push) conectado.
    await connectIntegration(db, orgA, 'leavo', { apiToken: 'tok_leavo' })
    // Grava um config (mapeamento) na linha do leavo p/ checar repasse ao pull.
    await db
      .update(schema.integrations)
      .set({ config: { mappedFunnel: true } })
      .where(
        and(eq(schema.integrations.organizationId, orgA), eq(schema.integrations.provider, 'leavo')),
      )
    await connectIntegration(db, orgA, 'datacrazy', { apiKey: 'tok_dc' })
    await connectIntegration(db, orgA, 'webhook', {})
    // meta_ads conectado porém será desconectado para checar que disconnected não roda.
    await connectIntegration(db, orgA, 'meta_ads', { adAccountId: '1', accessToken: 'x' })
    await db
      .update(schema.integrations)
      .set({ status: 'disconnected' })
      .where(
        and(
          eq(schema.integrations.organizationId, orgA),
          eq(schema.integrations.provider, 'meta_ads'),
        ),
      )

    // Org B: leavo conectado também, para checar isolamento.
    await connectIntegration(db, orgB, 'leavo', { apiToken: 'tok_b' })
  })

  it('persiste o resultado do provider ok e atualiza cursor/lastSyncAt/lastError', async () => {
    const results = await syncOrg(db, orgA, adapters, FIXED_NOW)

    // 1 lead do leavo persistido na org A.
    const leadRows = await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, orgA), eq(schema.leads.provider, 'leavo')))
    expect(leadRows).toHaveLength(1)
    expect(leadRows[0].externalId).toBe('lead-1')

    // 1 stage event persistido.
    const eventRows = await db
      .select()
      .from(schema.leadStageEvents)
      .where(eq(schema.leadStageEvents.organizationId, orgA))
    expect(eventRows).toHaveLength(1)

    // linha do leavo atualizada.
    const leavo = await intRow(orgA, 'leavo')
    expect(leavo.cursor).toBe('cur1')
    expect(leavo.lastSyncAt).toEqual(FIXED_NOW)
    expect(leavo.lastError).toBeNull()

    // resultado coerente para leavo.
    const leavoRes = results.find((r) => r.provider === 'leavo')
    expect(leavoRes).toEqual({ provider: 'leavo', ok: true })
  })

  it('repassa o config da integração ao pull do adapter', async () => {
    lastLeavoConfig = undefined
    await syncOrg(db, orgA, adapters, FIXED_NOW)
    expect(lastLeavoConfig).toEqual({ mappedFunnel: true })
  })

  it('captura erro de um provider sem bloquear os demais (datacrazy lança boom)', async () => {
    const results = await syncOrg(db, orgA, adapters, FIXED_NOW)

    const dc = await intRow(orgA, 'datacrazy')
    expect(dc.lastError).toContain('boom')

    const dcRes = results.find((r) => r.provider === 'datacrazy')
    expect(dcRes?.ok).toBe(false)
    expect(dcRes?.error).toContain('boom')

    // O leavo continuou funcionando apesar do erro do datacrazy.
    const leavoRes = results.find((r) => r.provider === 'leavo')
    expect(leavoRes?.ok).toBe(true)
  })

  it('não processa integrações disconnected nem push (webhook)', async () => {
    const results = await syncOrg(db, orgA, adapters, FIXED_NOW)
    const providers = results.map((r) => r.provider).sort()
    // Apenas pull + connected: leavo e datacrazy. webhook (push) e meta_ads (disconnected) fora.
    expect(providers).toEqual(['datacrazy', 'leavo'])
  })

  it('isolamento: sincronizar org A não afeta a org B', async () => {
    await syncOrg(db, orgA, adapters, FIXED_NOW)

    const leadsB = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.organizationId, orgB))
    expect(leadsB).toHaveLength(0)

    const leavoB = await intRow(orgB, 'leavo')
    expect(leavoB.cursor).toBeNull()
    expect(leavoB.lastSyncAt).toBeNull()
  })
})
