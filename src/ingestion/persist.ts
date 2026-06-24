import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { leads, leadStageEvents, adMetrics } from '@/db/schema'
import type { PullResult } from './types'

// Base comum a postgres-js (prod) e PGlite (testes); difere só no driver/result.
type Db = Pick<PgDatabase<PgQueryResultHKT>, 'select' | 'insert'>

// O `provider` é um pgEnum; o tipo das colunas é a união do enum.
type Provider = (typeof leads.$inferInsert)['provider']

export async function persist(
  database: Db,
  organizationId: string,
  provider: string,
  data: PullResult,
): Promise<void> {
  const prov = provider as Provider

  // 1) Leads: upsert idempotente por (organizationId, provider, externalId).
  if (data.leads.length > 0) {
    await database
      .insert(leads)
      .values(
        data.leads.map((l) => ({
          organizationId,
          provider: prov,
          externalId: l.externalId,
          name: l.name ?? null,
          channel: l.channel ?? null,
          utmSource: l.utmSource ?? null,
          utmCampaign: l.utmCampaign ?? null,
          creative: l.creative ?? null,
          currentStage: l.currentStage,
          valueCents: l.valueCents ?? 0,
          lostReason: l.lostReason ?? null,
          identityKey: l.identityKey ?? null,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [leads.organizationId, leads.provider, leads.externalId],
        set: {
          name: sql`excluded.name`,
          channel: sql`excluded.channel`,
          utmSource: sql`excluded.utm_source`,
          utmCampaign: sql`excluded.utm_campaign`,
          creative: sql`excluded.creative`,
          currentStage: sql`excluded.current_stage`,
          valueCents: sql`excluded.value_cents`,
          lostReason: sql`excluded.lost_reason`,
          identityKey: sql`excluded.identity_key`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  // 2) Stage events: resolver externalId -> leadId (escopado por org+provider).
  if (data.stageEvents.length > 0) {
    const orgLeads = await database
      .select({ id: leads.id, externalId: leads.externalId })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), eq(leads.provider, prov)))

    const idByExternal = new Map(orgLeads.map((r) => [r.externalId, r.id]))

    const eventRows = data.stageEvents
      .map((ev) => {
        const leadId = idByExternal.get(ev.leadExternalId)
        if (!leadId) return null
        return { organizationId, leadId, stage: ev.stage, occurredAt: ev.occurredAt }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (eventRows.length > 0) {
      // Eventos são imutáveis -> DoNothing em conflito.
      await database
        .insert(leadStageEvents)
        .values(eventRows)
        .onConflictDoNothing({
          target: [
            leadStageEvents.organizationId,
            leadStageEvents.leadId,
            leadStageEvents.stage,
            leadStageEvents.occurredAt,
          ],
        })
    }
  }

  // 3) Ad metrics: upsert por (organizationId, provider, date, campaign, creative).
  if (data.adMetrics.length > 0) {
    await database
      .insert(adMetrics)
      .values(
        data.adMetrics.map((m) => ({
          organizationId,
          provider: prov,
          date: m.date,
          campaign: m.campaign,
          creative: m.creative,
          channel: m.channel ?? null,
          spendCents: m.spendCents,
          impressions: m.impressions,
          clicks: m.clicks,
          leads: m.leads,
          sales: m.sales,
          revenueCents: m.revenueCents,
        })),
      )
      .onConflictDoUpdate({
        target: [adMetrics.organizationId, adMetrics.provider, adMetrics.date, adMetrics.campaign, adMetrics.creative],
        set: {
          channel: sql`excluded.channel`,
          spendCents: sql`excluded.spend_cents`,
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          leads: sql`excluded.leads`,
          sales: sql`excluded.sales`,
          revenueCents: sql`excluded.revenue_cents`,
        },
      })
  }
}
