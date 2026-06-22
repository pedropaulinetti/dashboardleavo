import { and, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { integrations } from '@/db/schema'
import { getProvider } from './providers'
import { getDecryptedCredentials } from './integrations'
import { persist } from './persist'
import { REGISTRY } from './registry'
import type { SourceAdapter } from './types'

// Base comum a postgres-js (prod) e PGlite (testes); difere só no driver/result.
type Db = Pick<PgDatabase<PgQueryResultHKT>, 'select' | 'insert' | 'update'>

export type SyncResult = { provider: string; ok: boolean; error?: string }

// Roda um ciclo de pull para todas as integrações pull conectadas de UMA org.
// `adapters` permite injetar fakes nos testes; default = registry real (stubs).
// `now` é injetável para tornar o teste determinístico.
export async function syncOrg(
  database: Db,
  organizationId: string,
  adapters: Record<string, SourceAdapter> = REGISTRY,
  now: Date = new Date(),
): Promise<SyncResult[]> {
  const rows = await database
    .select()
    .from(integrations)
    .where(
      and(eq(integrations.organizationId, organizationId), eq(integrations.status, 'connected')),
    )

  // Só providers de PULL (kind vem do catálogo, não do banco).
  const pullRows = rows.filter((r) => getProvider(r.provider)?.kind === 'pull')

  const results: SyncResult[] = []

  for (const row of pullRows) {
    const provider = row.provider
    try {
      const adapter = adapters[provider]
      if (!adapter) throw new Error(`AdapterNotFound: '${provider}'`)

      const credentials = getDecryptedCredentials(row) ?? {}
      const result = await adapter.pull({ credentials, cursor: row.cursor, config: row.config })

      await persist(database, organizationId, provider, result)

      await database
        .update(integrations)
        .set({ cursor: result.nextCursor, lastSyncAt: now, lastError: null })
        .where(
          and(
            eq(integrations.organizationId, organizationId),
            eq(integrations.provider, provider),
          ),
        )

      results.push({ provider, ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Erro de um provider não interrompe os demais. Grava lastError e segue.
      await database
        .update(integrations)
        .set({ lastError: message })
        .where(
          and(
            eq(integrations.organizationId, organizationId),
            eq(integrations.provider, provider),
          ),
        )
      results.push({ provider, ok: false, error: message })
    }
  }

  return results
}
