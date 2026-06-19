import { describe, it, expect, beforeAll } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { decrypt } from '@/lib/crypto'
import { env } from '@/env'
import {
  listIntegrations,
  connectIntegration,
  disconnectIntegration,
} from '@/ingestion/integrations'
import { makeTestDb } from '../db'

type Db = Awaited<ReturnType<typeof makeTestDb>>['db']

let db: Db
let orgA: string
let orgB: string

beforeAll(async () => {
  ;({ db } = await makeTestDb())
  const [a] = await db.insert(schema.organizations).values({ name: 'A', slug: 'a' }).returning()
  const [b] = await db.insert(schema.organizations).values({ name: 'B', slug: 'b' }).returning()
  orgA = a.id
  orgB = b.id
})

async function rawRow(orgId: string, provider: 'leavo' | 'datacrazy' | 'meta_ads' | 'webhook') {
  const [row] = await db
    .select()
    .from(schema.integrations)
    .where(
      and(
        eq(schema.integrations.organizationId, orgId),
        eq(schema.integrations.provider, provider),
      ),
    )
  return row
}

describe('integrations', () => {
  it('connectIntegration criptografa credenciais (não armazena texto puro) e marca connected', async () => {
    await connectIntegration(db, orgA, 'leavo', { apiToken: 'tok_ABCD1234' })

    const [row] = await db
      .select()
      .from(schema.integrations)
      .where(eq(schema.integrations.organizationId, orgA))

    expect(row).toBeDefined()
    expect(row.provider).toBe('leavo')
    expect(row.status).toBe('connected')
    expect(row.credentialsEncrypted).toBeTruthy()
    // O texto puro NÃO pode aparecer no campo cifrado.
    expect(row.credentialsEncrypted!).not.toContain('tok_ABCD1234')
    // decrypt + JSON.parse recupera o segredo.
    const decoded = JSON.parse(decrypt(row.credentialsEncrypted!, env.ENCRYPTION_KEY))
    expect(decoded.apiToken).toBe('tok_ABCD1234')
  })

  it('listIntegrations combina catálogo + estado; leavo connected com tail dos últimos 4 chars', async () => {
    const list = await listIntegrations(db, orgA)
    // Um item por provider do catálogo.
    expect(list.map((i) => i.id).sort()).toEqual(
      ['datacrazy', 'leavo', 'meta_ads', 'webhook'].sort(),
    )

    const leavo = list.find((i) => i.id === 'leavo')!
    expect(leavo.connected).toBe(true)
    expect(leavo.status).toBe('connected')
    expect(leavo.name).toBe('Leavo')
    expect(leavo.fields).toHaveLength(1)
    // tail = últimos 4 chars do primeiro valor de credencial ('tok_ABCD1234' -> '1234')
    expect(leavo.tail).toBe('1234')

    // Providers sem linha -> disconnected, sem tail.
    const meta = list.find((i) => i.id === 'meta_ads')!
    expect(meta.connected).toBe(false)
    expect(meta.status).toBe('disconnected')
    expect(meta.tail).toBeNull()
  })

  it('connectIntegration webhook não exige credenciais e gera webhookToken hex', async () => {
    await connectIntegration(db, orgA, 'webhook', {})
    const row = await rawRow(orgA, 'webhook')
    expect(row).toBeDefined()
    expect(row!.status).toBe('connected')
    expect(row!.webhookToken).toMatch(/^[0-9a-f]{48}$/)
    expect(row!.credentialsEncrypted).toBeNull()

    const list = await listIntegrations(db, orgA)
    const webhook = list.find((i) => i.id === 'webhook')!
    expect(webhook.connected).toBe(true)
    expect(webhook.webhookToken).toBe(row!.webhookToken)
  })

  it('connectIntegration webhook preserva o token existente em reconexão', async () => {
    const before = await rawRow(orgA, 'webhook')
    await connectIntegration(db, orgA, 'webhook', {})
    const after = await rawRow(orgA, 'webhook')
    expect(after!.webhookToken).toBe(before!.webhookToken)
  })

  it('connectIntegration rejeita provider desconhecido', async () => {
    await expect(connectIntegration(db, orgA, 'nope', {})).rejects.toThrow()
  })

  it('disconnectIntegration zera credenciais e marca disconnected', async () => {
    await disconnectIntegration(db, orgA, 'leavo')
    const row = await rawRow(orgA, 'leavo')
    expect(row!.status).toBe('disconnected')
    expect(row!.credentialsEncrypted).toBeNull()

    const list = await listIntegrations(db, orgA)
    const leavo = list.find((i) => i.id === 'leavo')!
    expect(leavo.connected).toBe(false)
    expect(leavo.status).toBe('disconnected')
    expect(leavo.tail).toBeNull()
  })

  it('isolamento: conectar na org A não vaza para a org B', async () => {
    const listB = await listIntegrations(db, orgB)
    // org B nunca conectou nada -> tudo disconnected.
    expect(listB.every((i) => i.connected === false)).toBe(true)
    expect(listB.every((i) => i.status === 'disconnected')).toBe(true)
    expect(listB.every((i) => i.tail === null)).toBe(true)
    expect(listB.every((i) => i.webhookToken === null)).toBe(true)
  })
})
