import { describe, it, expect, beforeAll } from 'vitest'
import { sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { handleWebhook } from '@/ingestion/webhook'
import { makeTestDb } from '../db'

type Db = Awaited<ReturnType<typeof makeTestDb>>['db']

let db: Db
let orgA: string
let orgB: string
let integAId: string

beforeAll(async () => {
  ;({ db } = await makeTestDb())
  const [a] = await db.insert(schema.organizations).values({ name: 'A', slug: 'a' }).returning()
  const [b] = await db.insert(schema.organizations).values({ name: 'B', slug: 'b' }).returning()
  orgA = a.id
  orgB = b.id

  const [ia] = await db
    .insert(schema.integrations)
    .values({ organizationId: orgA, provider: 'webhook', status: 'connected', webhookToken: 'tok123' })
    .returning()
  integAId = ia.id

  await db
    .insert(schema.integrations)
    .values({ organizationId: orgB, provider: 'webhook', status: 'connected', webhookToken: 'tokB' })
    .returning()
})

async function rawCount(orgId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.rawEvents)
    .where(sql`${schema.rawEvents.organizationId} = ${orgId}`)
  return r.n
}

describe('handleWebhook', () => {
  it('grava raw_event e seta lastSyncAt quando o token existe', async () => {
    const now = new Date('2026-06-18T12:00:00Z')
    const res = await handleWebhook(db, 'tok123', { a: 1 }, now)
    expect(res).toEqual({ status: 'ok' })

    const rows = await db
      .select()
      .from(schema.rawEvents)
      .where(sql`${schema.rawEvents.organizationId} = ${orgA}`)
    expect(rows).toHaveLength(1)
    expect(rows[0].organizationId).toBe(orgA)
    expect(rows[0].integrationId).toBe(integAId)
    expect(rows[0].provider).toBe('webhook')
    expect(rows[0].payload).toEqual({ a: 1 })
    expect(rows[0].processed).toBe(false)

    const [integ] = await db
      .select({ lastSyncAt: schema.integrations.lastSyncAt })
      .from(schema.integrations)
      .where(sql`${schema.integrations.id} = ${integAId}`)
    expect(integ.lastSyncAt).toEqual(now)
  })

  it('retorna not_found e não grava nada quando o token não existe', async () => {
    const before = await rawCount(orgA)
    const res = await handleWebhook(db, 'inexistente', { x: 9 })
    expect(res).toEqual({ status: 'not_found' })
    const after = await rawCount(orgA)
    expect(after).toBe(before)
  })

  it('não ingere quando a integração webhook está desconectada', async () => {
    const [c] = await db.insert(schema.organizations).values({ name: 'C', slug: 'c' }).returning()
    await db
      .insert(schema.integrations)
      .values({ organizationId: c.id, provider: 'webhook', status: 'disconnected', webhookToken: 'tokC' })
    const res = await handleWebhook(db, 'tokC', { x: 1 })
    expect(res).toEqual({ status: 'not_found' })
    expect(await rawCount(c.id)).toBe(0)
  })

  it('escopa o raw_event à org dona do token (isolamento)', async () => {
    const beforeA = await rawCount(orgA)
    const res = await handleWebhook(db, 'tokB', { from: 'b' })
    expect(res).toEqual({ status: 'ok' })

    expect(await rawCount(orgB)).toBe(1)
    // orgA permanece inalterada
    expect(await rawCount(orgA)).toBe(beforeA)
  })
})
