import { describe, it, expect, beforeAll } from 'vitest'
import * as schema from '@/db/schema'
import { hashPassword } from '@/lib/password'
import { authorizeUser } from '@/auth/authorize'
import { makeTestDb } from './db'

let db: Awaited<ReturnType<typeof makeTestDb>>['db']

beforeAll(async () => {
  ;({ db } = await makeTestDb())
  const [org] = await db.insert(schema.organizations).values({ name: 'A', slug: 'a' }).returning()
  await db.insert(schema.users).values({
    organizationId: org.id, name: 'Dono', email: 'dono@x.com',
    passwordHash: await hashPassword('senha123'), role: 'owner',
  })
})

describe('authorizeUser', () => {
  it('aceita credenciais válidas e devolve org+role', async () => {
    const u = await authorizeUser('dono@x.com', 'senha123', db)
    expect(u?.role).toBe('owner')
    expect(u?.organizationId).toBeTruthy()
  })
  it('rejeita senha errada', async () => {
    expect(await authorizeUser('dono@x.com', 'errada', db)).toBeNull()
  })
  it('rejeita usuário inexistente', async () => {
    expect(await authorizeUser('naoexiste@x.com', 'x', db)).toBeNull()
  })
})
