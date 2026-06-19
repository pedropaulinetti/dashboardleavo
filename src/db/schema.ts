import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, pgEnum, unique } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['owner', 'member'])
export const providerEnum = pgEnum('provider', ['leavo', 'datacrazy', 'meta_ads', 'webhook'])
export const integrationStatusEnum = pgEnum('integration_status', ['connected', 'disconnected', 'error'])

// Etapas fixas do funil
export const FUNNEL_STAGES = ['leads', 'mql', 'agendadas', 'realizadas', 'negociacoes', 'vendas'] as const

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const orgBranding = pgTable('org_branding', {
  organizationId: uuid('organization_id').notNull().references(() => organizations.id).primaryKey(),
  productName: text('product_name').notNull().default('Leavo'),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color').notNull().default('359 99% 57%'),
  domain: text('domain'),
})

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ uqOrgEmail: unique().on(t.organizationId, t.email) }))

export const integrations = pgTable('integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  provider: providerEnum('provider').notNull(),
  status: integrationStatusEnum('status').notNull().default('disconnected'),
  credentialsEncrypted: text('credentials_encrypted'),
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  cursor: text('cursor'),
  webhookToken: text('webhook_token'),
  lastSyncAt: timestamp('last_sync_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ uqProvider: unique().on(t.organizationId, t.provider) }))

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  provider: providerEnum('provider').notNull(),
  externalId: text('external_id').notNull(),
  channel: text('channel'),
  utmSource: text('utm_source'),
  utmCampaign: text('utm_campaign'),
  currentStage: text('current_stage').notNull().default('leads'),
  lostReason: text('lost_reason'),
  valueCents: integer('value_cents').notNull().default(0),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}, (t) => ({ uqExternal: unique().on(t.organizationId, t.provider, t.externalId) }))

export const leadStageEvents = pgTable('lead_stage_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  leadId: uuid('lead_id').notNull().references(() => leads.id),
  stage: text('stage').notNull(),
  occurredAt: timestamp('occurred_at').notNull(),
}, (t) => ({ uqEvent: unique().on(t.organizationId, t.leadId, t.stage, t.occurredAt) }))

export const adMetrics = pgTable('ad_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  provider: providerEnum('provider').notNull(),
  date: timestamp('date', { mode: 'date' }).notNull(),
  campaign: text('campaign').notNull().default(''),
  creative: text('creative').notNull().default(''),
  channel: text('channel'),
  spendCents: integer('spend_cents').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  leads: integer('leads').notNull().default(0),
  sales: integer('sales').notNull().default(0),
  revenueCents: integer('revenue_cents').notNull().default(0),
}, (t) => ({ uqMetric: unique().on(t.organizationId, t.provider, t.date, t.campaign, t.creative) }))

export const rawEvents = pgTable('raw_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  integrationId: uuid('integration_id').references(() => integrations.id),
  provider: providerEnum('provider').notNull(),
  payload: jsonb('payload').notNull(),
  processed: boolean('processed').notNull().default(false),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
})
