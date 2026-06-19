import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/env'
import * as schema from './schema'

// prepare:false é obrigatório no Transaction pooler do Supabase (porta 6543)
const client = postgres(env.DATABASE_URL, { prepare: false })
export const db = drizzle(client, { schema })
export { schema }
