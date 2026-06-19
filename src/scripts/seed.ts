import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { FUNNEL_STAGES } from '@/db/schema'
import { hashPassword } from '@/lib/password'

const OWNER_EMAIL = 'pedropaulinettid@gmail.com'
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? 'LeavoAdmin#2026'

// ──────────────────────────────────────────────────────────────────────────
// PRNG determinístico (mulberry32) — semente fixa ⇒ mesmos totais a cada run.
// ──────────────────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260618)
const randInt = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]

// ──────────────────────────────────────────────────────────────────────────
// Configuração de geração (coerente com o mockup "Funil de Vendas.dc.html").
// ──────────────────────────────────────────────────────────────────────────
const DAYS = 120
const TOTAL_LEADS = 700
const TICKET_CENTS = 240000 // R$ 2.400 de referência

// UTMs por canal (espelha utmsBase do mockup).
const utmsBase = [
  { source: 'meta_ads', campaign: 'remarketing-q2', ch: 'meta' },
  { source: 'google_ads', campaign: 'search-marca', ch: 'google' },
  { source: 'whatsapp', campaign: 'bio-organico', ch: 'whats' },
  { source: 'indicacao', campaign: 'programa-member', ch: 'indica' },
  { source: 'meta_ads', campaign: 'prospec-lookalike', ch: 'meta' },
  { source: 'google_ads', campaign: 'pmax-geral', ch: 'google' },
] as const

// Criativos (espelha creativesBase) — usados nas ad_metrics dos canais pagos.
const creativesBase = [
  { name: 'Depoimento Cliente — Vídeo 30s', plat: 'Meta', ch: 'meta' },
  { name: 'Carrossel Antes e Depois', plat: 'Meta', ch: 'meta' },
  { name: 'Demo do Produto — Reels', plat: 'Meta', ch: 'meta' },
  { name: 'Search — Palavra-chave Marca', plat: 'Google', ch: 'google' },
  { name: 'Banner Promo Aniversário', plat: 'Google', ch: 'google' },
] as const

// Motivos de perda (espelha lossDefs) com pesos para distribuição proporcional.
const lossDefs = [
  { reason: 'Preço / orçamento', w: 0.36 },
  { reason: 'Sumiu / sem retorno', w: 0.255 },
  { reason: 'Escolheu concorrente', w: 0.185 },
  { reason: 'Sem fit / não qualificado', w: 0.122 },
  { reason: 'Timing / adiou decisão', w: 0.078 },
] as const

// Mix de canais (peso na distribuição dos leads). Coerente com volumes do mockup.
const channelMix = [
  { ch: 'meta', w: 0.38 },
  { ch: 'google', w: 0.27 },
  { ch: 'whats', w: 0.21 },
  { ch: 'indica', w: 0.14 },
] as const
const PAID_CHANNELS = new Set(['meta', 'google'])

// Distribuição da "etapa máxima atingida" (índices 0..5). Decrescente: muitos no
// topo, ~6% chegam a vendas. Soma = 1.
const reachedWeights = [0.3, 0.24, 0.17, 0.12, 0.11, 0.06]

function weightedIndex(weights: number[], r: number): number {
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]
    if (r < acc) return i
  }
  return weights.length - 1
}

function pickWeighted<T extends { w: number }>(items: readonly T[], r: number): T {
  let acc = 0
  for (const it of items) {
    acc += it.w
    if (r < acc) return it
  }
  return items[items.length - 1]
}

const DAY_MS = 24 * 60 * 60 * 1000

async function main() {
  // ── Org / branding / owner (idempotente — preservado do seed original) ──
  await db.insert(schema.organizations).values({ name: 'Leavo', slug: 'leavo' }).onConflictDoNothing()
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, 'leavo')).limit(1)
  const organizationId = org.id

  await db.insert(schema.orgBranding).values({ organizationId, productName: 'Leavo' }).onConflictDoNothing()

  await db
    .insert(schema.users)
    .values({
      organizationId,
      name: 'Pedro Paulinetti',
      email: OWNER_EMAIL,
      passwordHash: await hashPassword(OWNER_PASSWORD),
      role: 'owner',
    })
    .onConflictDoNothing()

  // ── Idempotência: limpa dados de demonstração da org (ordem de FK) ──
  await db.delete(schema.leadStageEvents).where(eq(schema.leadStageEvents.organizationId, organizationId))
  await db.delete(schema.leads).where(eq(schema.leads.organizationId, organizationId))
  await db.delete(schema.adMetrics).where(eq(schema.adMetrics.organizationId, organizationId))

  // "hoje" normalizado para meia-noite UTC.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const windowStartMs = todayMs - (DAYS - 1) * DAY_MS

  // ── Geração de leads + eventos de etapa ──
  type LeadRow = typeof schema.leads.$inferInsert
  type EventRow = typeof schema.leadStageEvents.$inferInsert
  const leadRows: LeadRow[] = []
  const leadMeta: { externalId: string; reachedStage: number; createdMs: number }[] = []

  // Distribui os motivos de perda entre os leads reachedStage === 4, em ordem,
  // por contagem proporcional aos pesos.
  let lostCount = 0

  for (let i = 0; i < TOTAL_LEADS; i++) {
    const channel = pickWeighted(channelMix, rnd()).ch
    // UTM coerente com o canal escolhido.
    const utmCandidates = utmsBase.filter((u) => u.ch === channel)
    const utm = utmCandidates.length ? pick(utmCandidates) : pick(utmsBase)

    const reachedStage = weightedIndex(reachedWeights, rnd())

    // createdAt distribuído nos últimos DAYS dias; deixa folga p/ eventos caberem.
    const dayOffset = randInt(0, DAYS - 1)
    const createdMs = windowStartMs + dayOffset * DAY_MS + randInt(0, 86399) * 1000
    const updatedMs = Math.min(createdMs + randInt(1, 10) * DAY_MS, todayMs + 86399000)

    let valueCents = 0
    if (reachedStage === 5) {
      // ticket ~R$2.400 com variação (1800–3200 reais).
      valueCents = randInt(1800, 3200) * 100
    }

    let lostReason: string | null = null
    if (reachedStage === 4) {
      lostReason = pickWeighted(lossDefs, rnd()).reason
      lostCount++
    }

    const externalId = `seed-lead-${i}`
    leadRows.push({
      organizationId,
      provider: 'leavo',
      externalId,
      channel,
      utmSource: utm.source,
      utmCampaign: utm.campaign,
      currentStage: FUNNEL_STAGES[reachedStage],
      lostReason,
      valueCents,
      createdAt: new Date(createdMs),
      updatedAt: new Date(updatedMs),
    })
    leadMeta.push({ externalId, reachedStage, createdMs })
  }

  // Insere leads em lotes e recupera ids (mapeados por externalId).
  const insertedLeads: { id: string; externalId: string }[] = []
  const CHUNK = 200
  for (let i = 0; i < leadRows.length; i += CHUNK) {
    const batch = leadRows.slice(i, i + CHUNK)
    const res = await db
      .insert(schema.leads)
      .values(batch)
      .returning({ id: schema.leads.id, externalId: schema.leads.externalId })
    insertedLeads.push(...res)
  }
  const idByExternal = new Map(insertedLeads.map((l) => [l.externalId, l.id]))

  // Eventos: para cada lead, uma ocorrência por etapa 0..reachedStage, crescente.
  const eventRows: EventRow[] = []
  for (const meta of leadMeta) {
    const leadId = idByExternal.get(meta.externalId)!
    // Distribui as etapas no tempo a partir de createdAt sem ultrapassar "hoje".
    const span = Math.max(todayMs + 86399000 - meta.createdMs, DAY_MS)
    const stepMs = Math.floor(span / (meta.reachedStage + 2))
    for (let s = 0; s <= meta.reachedStage; s++) {
      const occurredMs = meta.createdMs + s * stepMs + randInt(0, Math.max(stepMs - 1, 0))
      eventRows.push({
        organizationId,
        leadId,
        stage: FUNNEL_STAGES[s],
        occurredAt: new Date(Math.min(occurredMs, todayMs + 86399000)),
      })
    }
  }
  for (let i = 0; i < eventRows.length; i += CHUNK) {
    await db.insert(schema.leadStageEvents).values(eventRows.slice(i, i + CHUNK)).onConflictDoNothing()
  }

  // ── ad_metrics: linhas diárias para canais pagos (meta, google) ──
  // Para manter volume razoável, geramos métricas a cada 4 dias por (campaign,
  // creative). Garantimos impressions/clicks > 0.
  type MetricRow = typeof schema.adMetrics.$inferInsert
  const metricRows: MetricRow[] = []
  const paidUtms = utmsBase.filter((u) => PAID_CHANNELS.has(u.ch))

  for (let d = 0; d < DAYS; d += 4) {
    const date = new Date(windowStartMs + d * DAY_MS)
    for (const utm of paidUtms) {
      const creatives = creativesBase.filter((c) => c.ch === utm.ch)
      const creative = creatives.length ? pick(creatives) : creativesBase[0]
      const impressions = randInt(2000, 12000)
      const clicks = randInt(40, Math.max(60, Math.floor(impressions * 0.05)))
      const leadsCount = randInt(3, Math.max(4, Math.floor(clicks * 0.25)))
      const sales = randInt(0, Math.max(1, Math.floor(leadsCount * 0.2)))
      const cpcCents = randInt(80, 220)
      metricRows.push({
        organizationId,
        provider: 'meta_ads',
        date,
        campaign: utm.campaign,
        creative: creative.name,
        channel: utm.ch,
        spendCents: clicks * cpcCents,
        impressions,
        clicks,
        leads: leadsCount,
        sales,
        revenueCents: sales * TICKET_CENTS,
      })
    }
  }
  for (let i = 0; i < metricRows.length; i += CHUNK) {
    await db.insert(schema.adMetrics).values(metricRows.slice(i, i + CHUNK)).onConflictDoNothing()
  }

  console.log(
    `Seed concluído. Org: ${organizationId} | owner: ${OWNER_EMAIL} | leads: ${leadRows.length} | eventos: ${eventRows.length} | ad_metrics: ${metricRows.length} | perdas(negociacoes): ${lostCount}`,
  )
  process.exit(0)
}

main().catch((e) => {
  console.error('Seed falhou:', e)
  process.exit(1)
})
