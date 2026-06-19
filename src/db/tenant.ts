import { eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { leads } from './schema'
import type * as schema from './schema'

// Aceita qualquer driver Drizzle (postgres-js em produção, PGlite nos testes).
// Usar genérico evita conflito de tipos entre os HKTs dos drivers.
type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>

export function forOrg<TDb extends Pick<AnyDb, 'select'>>(database: TDb, organizationId: string) {
  return {
    leads: () => database.select().from(leads).where(eq(leads.organizationId, organizationId)),
    // novas leituras escopadas (adMetrics, leadStageEvents...) entram aqui nos próximos planos
  }
}
