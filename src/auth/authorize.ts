import { eq } from 'drizzle-orm'
import { db as defaultDb, schema } from '@/db'
import { verifyPassword } from '@/lib/password'

// `database` aceita o driver de produção (postgres-js) ou o de teste (PGlite).
// Usar genérico evita conflito de tipos entre os HKTs dos drivers (igual a src/db/tenant.ts).
export async function authorizeUser<TDb extends Pick<typeof defaultDb, 'select'>>(
  email: string,
  password: string,
  database: TDb = defaultDb as unknown as TDb,
) {
  const [u] = await database.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  if (!u) return null
  if (!(await verifyPassword(password, u.passwordHash))) return null
  return { id: u.id, name: u.name, email: u.email, organizationId: u.organizationId, role: u.role }
}
