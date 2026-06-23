export type NormalizedLead = { externalId: string; channel?: string; utmSource?: string; utmCampaign?: string; creative?: string | null; currentStage: string; valueCents?: number; lostReason?: string | null; identityKey?: string | null; createdAt: Date; updatedAt: Date }
export type NormalizedStageEvent = { leadExternalId: string; stage: string; occurredAt: Date }
export type NormalizedAdMetric = { date: Date; campaign: string; creative: string; channel?: string; spendCents: number; impressions: number; clicks: number; leads: number; sales: number; revenueCents: number }
export type PullResult = { leads: NormalizedLead[]; stageEvents: NormalizedStageEvent[]; adMetrics: NormalizedAdMetric[]; nextCursor: string | null }
// Contexto do pull. `config` (config da integração, ex.: DataCrazyConfig) e `fetchImpl`
// (fetch injetável p/ testes) são opcionais — cada adaptador refina o que precisa.
export type PullContext = {
  credentials: Record<string, unknown>
  cursor: string | null
  config?: unknown
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}
export interface SourceAdapter {
  provider: string
  pull(ctx: PullContext): Promise<PullResult>
}
