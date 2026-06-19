import { randomBytes } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { integrations } from '@/db/schema'
import { encrypt, decrypt } from '@/lib/crypto'
import { env } from '@/env'
import { PROVIDERS, getProvider } from './providers'

// Base comum a postgres-js (prod) e PGlite (testes); difere só no driver/result.
type Db = Pick<PgDatabase<PgQueryResultHKT>, 'select' | 'insert' | 'update'>

type IntegrationRow = typeof integrations.$inferSelect
type Provider = IntegrationRow['provider']

export type IntegrationView = {
  id: string
  name: string
  category: string
  kind: 'pull' | 'push'
  description: string
  logo: string
  fields: { label: string; name: string; type: 'text' | 'password' }[]
  status: IntegrationRow['status']
  connected: boolean
  tail: string | null
  webhookToken: string | null
  lastSyncAt: Date | null
  lastError: string | null
}

// Decripta + JSON.parse das credenciais de uma linha. Usado para o `tail` e (Plano 4)
// pelo sync. Retorna null se não houver credencial. Nunca loga o conteúdo.
export function getDecryptedCredentials(row: IntegrationRow): Record<string, unknown> | null {
  if (!row.credentialsEncrypted) return null
  try {
    const parsed = JSON.parse(decrypt(row.credentialsEncrypted, env.ENCRYPTION_KEY))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// `tail` = últimos 4 chars do valor (em texto) do PRIMEIRO campo de credencial.
// Permite exibir ••••{tail} sem revelar o segredo. null se não houver credencial.
function credentialTail(row: IntegrationRow): string | null {
  const creds = getDecryptedCredentials(row)
  if (!creds) return null
  const first = Object.values(creds).find((v) => v != null && v !== '')
  if (first == null) return null
  const str = String(first)
  return str.length <= 4 ? str : str.slice(-4)
}

export async function listIntegrations(
  database: Db,
  organizationId: string,
): Promise<IntegrationView[]> {
  const rows = await database
    .select()
    .from(integrations)
    .where(eq(integrations.organizationId, organizationId))

  const byProvider = new Map<string, IntegrationRow>(rows.map((r) => [r.provider, r]))

  return PROVIDERS.map((def) => {
    const row = byProvider.get(def.id)
    const status = row?.status ?? 'disconnected'
    return {
      id: def.id,
      name: def.name,
      category: def.category,
      kind: def.kind,
      description: def.description,
      logo: def.logo,
      fields: def.fields,
      status,
      connected: status === 'connected',
      tail: row ? credentialTail(row) : null,
      webhookToken: row?.webhookToken ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastError: row?.lastError ?? null,
    }
  })
}

export async function connectIntegration(
  database: Db,
  organizationId: string,
  provider: string,
  credentials: Record<string, unknown>,
): Promise<IntegrationRow> {
  if (!getProvider(provider)) {
    throw new Error(`UnknownProvider: '${provider}' não existe no catálogo`)
  }
  const prov = provider as Provider

  if (prov === 'webhook') {
    // Webhook é push: não exige credenciais. Gera token só se ainda não houver.
    const [existing] = await database
      .select()
      .from(integrations)
      .where(and(eq(integrations.organizationId, organizationId), eq(integrations.provider, prov)))

    const webhookToken = existing?.webhookToken ?? randomBytes(24).toString('hex')

    const [row] = await database
      .insert(integrations)
      .values({ organizationId, provider: prov, status: 'connected', webhookToken, lastError: null })
      .onConflictDoUpdate({
        target: [integrations.organizationId, integrations.provider],
        set: {
          status: 'connected',
          webhookToken: sql`coalesce(${integrations.webhookToken}, excluded.webhook_token)`,
          lastError: null,
        },
      })
      .returning()
    return row
  }

  const credentialsEncrypted = encrypt(JSON.stringify(credentials), env.ENCRYPTION_KEY)

  const [row] = await database
    .insert(integrations)
    .values({ organizationId, provider: prov, status: 'connected', credentialsEncrypted, lastError: null })
    .onConflictDoUpdate({
      target: [integrations.organizationId, integrations.provider],
      set: {
        status: 'connected',
        credentialsEncrypted: sql`excluded.credentials_encrypted`,
        lastError: null,
      },
    })
    .returning()
  return row
}

export async function disconnectIntegration(
  database: Db,
  organizationId: string,
  provider: string,
): Promise<IntegrationRow | undefined> {
  const prov = provider as Provider
  const [row] = await database
    .update(integrations)
    .set({ status: 'disconnected', credentialsEncrypted: null, cursor: null })
    .where(and(eq(integrations.organizationId, organizationId), eq(integrations.provider, prov)))
    .returning()
  return row
}
