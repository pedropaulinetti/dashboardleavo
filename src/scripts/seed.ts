import 'dotenv/config'
import { db, schema } from '@/db'
import { hashPassword } from '@/lib/password'

const OWNER_EMAIL = 'pedropaulinettid@gmail.com'
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'LeavoAdmin#2026'

async function main() {
  // Organização (idempotente por slug único)
  await db.insert(schema.organizations).values({ name: 'Leavo', slug: 'leavo' }).onConflictDoNothing()
  const [org] = await db.select().from(schema.organizations).limit(1)
  const organizationId = org.id

  // Branding (PK = organizationId)
  await db.insert(schema.orgBranding).values({ organizationId, productName: 'Leavo' }).onConflictDoNothing()

  // Usuário owner (email único)
  await db.insert(schema.users).values({
    organizationId,
    name: 'Pedro Paulinetti',
    email: OWNER_EMAIL,
    passwordHash: await hashPassword(OWNER_PASSWORD),
    role: 'owner',
  }).onConflictDoNothing()

  // Dados de exemplo (placeholder inspirado no mockup support.js — não precisa bater 1:1)
  // Data normalizada para meia-noite UTC do dia atual: mantém a chave única
  // (organizationId, provider, date, campaign, creative) estável entre execuções.
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  await db.insert(schema.adMetrics).values([
    { organizationId, provider: 'meta_ads', date: now, campaign: 'remarketing-q2', creative: 'Depoimento Cliente — Vídeo 30s', channel: 'meta', spendCents: 980 * 540, impressions: 0, clicks: 0, leads: 540, sales: 31, revenueCents: 14280000 },
    { organizationId, provider: 'meta_ads', date: now, campaign: 'prospec-lookalike', creative: 'Carrossel Antes e Depois', channel: 'meta', spendCents: 1390 * 430, impressions: 0, clicks: 0, leads: 430, sales: 22, revenueCents: 9840000 },
  ]).onConflictDoNothing()

  console.log('Seed concluído. Org:', organizationId, '| owner:', OWNER_EMAIL)
  process.exit(0)
}

main().catch((e) => { console.error('Seed falhou:', e); process.exit(1) })
