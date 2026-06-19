import { and, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { integrations, rawEvents } from '@/db/schema'

// Base comum a postgres-js (prod) e PGlite (testes); difere só no driver/result.
type Db = Pick<PgDatabase<PgQueryResultHKT>, 'select' | 'insert' | 'update'>

export async function handleWebhook(
  database: Db,
  token: string,
  payload: unknown,
  now: Date = new Date(),
): Promise<{ status: 'ok' | 'not_found' }> {
  const [row] = await database
    .select({
      id: integrations.id,
      organizationId: integrations.organizationId,
      provider: integrations.provider,
    })
    .from(integrations)
    // Só ingere se a integração estiver conectada: desconectar pausa a ingestão
    // (o token é preservado, então reconectar mantém a mesma URL de webhook).
    .where(and(eq(integrations.webhookToken, token), eq(integrations.status, 'connected')))
    .limit(1)

  if (!row) {
    return { status: 'not_found' }
  }

  await database.insert(rawEvents).values({
    organizationId: row.organizationId,
    integrationId: row.id,
    provider: row.provider,
    payload,
    processed: false,
  })

  await database.update(integrations).set({ lastSyncAt: now }).where(eq(integrations.id, row.id))

  return { status: 'ok' }
}
