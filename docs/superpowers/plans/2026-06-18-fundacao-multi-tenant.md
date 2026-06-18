# Fundação Multi-Tenant — Implementation Plan (Plano 1 de 4)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold do app Next.js + Postgres com schema multi-tenant, autenticação de equipe (owner/member), criptografia de credenciais e seed da organização do usuário — base sobre a qual o dashboard e as integrações serão construídos.

**Architecture:** App Next.js (App Router, TypeScript) com Postgres via Drizzle ORM. Todo dado é escopado por `organization_id`; um helper de query força esse escopo. Auth.js (NextAuth v5) com credenciais email/senha, sessão contendo `organizationId` e `role`. Credenciais de integração são guardadas criptografadas (AES-256-GCM).

**Tech Stack:** Next.js 15 (App Router), TypeScript, Postgres, Drizzle ORM + drizzle-kit, Auth.js v5, bcrypt, Zod, Vitest, Node `crypto`.

**Plano da série:** Este é o **Plano 1 de 4** (Fundação). Seguem: 2-Dashboard, 3-Ingestão base, 4-Adaptadores reais. Cada plano entrega software funcional e testável.

---

## Pré-requisitos

- Node 20+ e um Postgres acessível (local via Docker ou Neon/Supabase). Para testes, um banco Postgres dedicado.
- O mockup `Funil de Vendas.dc.html` e `support.js` permanecem na raiz como referência visual (serão portados no Plano 2).

## Estrutura de arquivos (criada neste plano)

```
package.json, tsconfig.json, next.config.ts, .env.example
drizzle.config.ts
src/
  env.ts                      # validação de variáveis de ambiente (Zod)
  db/
    index.ts                  # client Drizzle (pool Postgres)
    schema.ts                 # todas as tabelas multi-tenant
    tenant.ts                 # helper de escopo por organization_id
  lib/
    crypto.ts                 # encrypt/decrypt AES-256-GCM
    password.ts               # hash/verify de senha (bcrypt)
  auth/
    config.ts                 # Auth.js v5 (credentials provider, callbacks de sessão)
  scripts/
    seed.ts                   # cria org + branding + usuário owner + dados de exemplo
tests/
  crypto.test.ts
  tenant.test.ts
  password.test.ts
  auth.test.ts
drizzle/                      # migrações geradas
vitest.config.ts
```

> **Nota de estilo:** o mockup usa variáveis CSS (design tokens). O Plano 2 porta esses tokens para `globals.css`. Este plano não cria UI além do mínimo de auth necessário para testar a sessão.

---

## Task 1: Scaffold do projeto Next.js + TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore` (já existe — confirmar), `.env.example`
- Create: `vitest.config.ts`

- [ ] **Step 1: Inicializar o projeto**

Run:
```bash
npx create-next-app@latest . --typescript --app --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --eslint
```
Quando perguntar sobre sobrescrever arquivos existentes (HTML do mockup, docs/), responda **No** para não apagar o mockup e os docs. Se o create-next-app recusar a pasta não-vazia, gere em `./app-tmp` e mova os arquivos gerados para a raiz preservando `Funil de Vendas.dc.html`, `support.js`, `leavo/`, `shots/`, `docs/`.

- [ ] **Step 2: Mover código para `src/`**

Reorganize para `src/app/` (App Router) e ajuste `tsconfig.json` `paths` para `"@/*": ["./src/*"]`.

- [ ] **Step 3: Instalar dependências do plano**

Run:
```bash
npm install drizzle-orm postgres zod next-auth@beta bcryptjs
npm install -D drizzle-kit vitest @types/bcryptjs tsx dotenv
```

- [ ] **Step 4: Configurar Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'], // carrega .env para os testes (DATABASE_URL/TEST_DATABASE_URL)
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
```

Create `tests/setup.ts`:
```ts
import 'dotenv/config'
```
⚠️ Os testes que tocam o banco (`tenant.test.ts`, `auth.test.ts`) usam `TEST_DATABASE_URL` — garanta que ele está no `.env` e aponta para um banco **separado** do de desenvolvimento (os testes dão TRUNCATE).

- [ ] **Step 5: Criar `.env.example`**

```
DATABASE_URL=postgres://user:pass@localhost:5432/leavo_dash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/leavo_dash_test
AUTH_SECRET=change-me-32-bytes
ENCRYPTION_KEY=64-hex-chars-(32-bytes)-for-aes-256-gcm
```

- [ ] **Step 6: Validar ambiente com Zod**

Create `src/env.ts`:
```ts
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes em hex
})

export const env = schema.parse(process.env)
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TS + deps da fundação"
```

---

## Task 2: Criptografia de credenciais (AES-256-GCM)

**Files:**
- Create: `src/lib/crypto.ts`
- Test: `tests/crypto.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`tests/crypto.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto'

const KEY = 'a'.repeat(64) // 32 bytes em hex

describe('crypto', () => {
  it('round-trip: decrypt(encrypt(x)) === x', () => {
    const plain = JSON.stringify({ token: 'segredo-123' })
    const enc = encrypt(plain, KEY)
    expect(enc).not.toContain('segredo-123')
    expect(decrypt(enc, KEY)).toBe(plain)
  })

  it('texto cifrado difere a cada chamada (IV aleatório)', () => {
    expect(encrypt('x', KEY)).not.toBe(encrypt('x', KEY))
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/crypto.test.ts`
Expected: FAIL ("Cannot find module '@/lib/crypto'").

- [ ] **Step 3: Implementar**

`src/lib/crypto.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Formato armazenado: iv(hex):authTag(hex):cipher(hex)
export function encrypt(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decrypt(payload: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const [ivHex, tagHex, dataHex] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/crypto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto.ts tests/crypto.test.ts
git commit -m "feat: criptografia AES-256-GCM para credenciais"
```

---

## Task 3: Hash de senha

**Files:**
- Create: `src/lib/password.ts`
- Test: `tests/password.test.ts`

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/password'

describe('password', () => {
  it('verifica senha correta e rejeita incorreta', async () => {
    const hash = await hashPassword('segredo')
    expect(hash).not.toBe('segredo')
    expect(await verifyPassword('segredo', hash)).toBe(true)
    expect(await verifyPassword('errada', hash)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/password.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/lib/password.ts`:
```ts
import bcrypt from 'bcryptjs'
export const hashPassword = (p: string) => bcrypt.hash(p, 10)
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash)
```

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/password.ts tests/password.test.ts
git commit -m "feat: hash/verify de senha com bcrypt"
```

---

## Task 4: Schema multi-tenant (Drizzle)

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`
- Migração gerada em `drizzle/`

- [ ] **Step 1: Definir o schema**

`src/db/schema.ts` — todas as tabelas da Seção 4 da spec. Constantes de etapa fixas mais um enum.
```ts
import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, pgEnum, unique } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['owner', 'member'])
export const providerEnum = pgEnum('provider', ['leavo', 'datacrazy', 'meta_ads', 'webhook'])
export const integrationStatusEnum = pgEnum('integration_status', ['connected', 'disconnected', 'error'])

// Etapas fixas do funil (Seção "Etapas do funil" da spec)
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
  domain: text('domain'), // futuro white-label; não usado no v1
})

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const integrations = pgTable('integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  provider: providerEnum('provider').notNull(),
  status: integrationStatusEnum('status').notNull().default('disconnected'),
  credentialsEncrypted: text('credentials_encrypted'), // string "iv:tag:cipher" do crypto.ts — text de propósito (spec menciona jsonb, mas a saída cifrada é string)
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
})

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
```

- [ ] **Step 2: Client Drizzle**

`src/db/index.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/env'
import * as schema from './schema'

const client = postgres(env.DATABASE_URL)
export const db = drizzle(client, { schema })
export { schema }
```

- [ ] **Step 3: Config drizzle-kit**

`drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 4: Gerar e aplicar migração**

Run:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```
Expected: pasta `drizzle/` com SQL; tabelas criadas no Postgres.

- [ ] **Step 5: Commit**

```bash
git add src/db/ drizzle.config.ts drizzle/
git commit -m "feat: schema multi-tenant com Drizzle"
```

---

## Task 5: Helper de escopo por tenant + teste de isolamento

**Files:**
- Create: `src/db/tenant.ts`
- Test: `tests/tenant.test.ts`

Objetivo: garantir que toda leitura de dados passe por `organization_id`, e provar que org A não enxerga dados de org B.

- [ ] **Step 1: Teste de isolamento (que falha)**

`tests/tenant.test.ts` (usa `TEST_DATABASE_URL`; cria 2 orgs, insere 1 lead em cada, consulta via helper):
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import { forOrg } from '@/db/tenant'

const sql = postgres(process.env.TEST_DATABASE_URL!)
const tdb = drizzle(sql, { schema })

let orgA: string, orgB: string

beforeAll(async () => {
  await sql`TRUNCATE leads, organizations RESTART IDENTITY CASCADE`
  const [a] = await tdb.insert(schema.organizations).values({ name: 'A', slug: 'a' }).returning()
  const [b] = await tdb.insert(schema.organizations).values({ name: 'B', slug: 'b' }).returning()
  orgA = a.id; orgB = b.id
  const now = new Date()
  await tdb.insert(schema.leads).values([
    { organizationId: orgA, provider: 'leavo', externalId: '1', currentStage: 'leads', createdAt: now, updatedAt: now },
    { organizationId: orgB, provider: 'leavo', externalId: '1', currentStage: 'leads', createdAt: now, updatedAt: now },
  ])
})

describe('tenant scoping', () => {
  it('forOrg(A).leads() retorna só leads da org A', async () => {
    const rows = await forOrg(tdb, orgA).leads()
    expect(rows).toHaveLength(1)
    expect(rows[0].organizationId).toBe(orgA)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/tenant.test.ts` → FAIL ("Cannot find module '@/db/tenant'").

- [ ] **Step 3: Implementar helper**

`src/db/tenant.ts`:
```ts
import { eq } from 'drizzle-orm'
import type { db as DB } from './index'
import { leads } from './schema'

export function forOrg(database: typeof DB, organizationId: string) {
  return {
    leads: () => database.select().from(leads).where(eq(leads.organizationId, organizationId)),
    // novas leituras escopadas entram aqui (adMetrics, leadStageEvents...) nos planos seguintes
  }
}
```

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/tenant.ts tests/tenant.test.ts
git commit -m "feat: helper de escopo por tenant + teste de isolamento"
```

---

## Task 6: Autenticação (Auth.js v5) com org e papel na sessão

**Files:**
- Create: `src/auth/config.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- Test: `tests/auth.test.ts` (testa a função `authorize` isoladamente)

- [ ] **Step 1: Teste da função authorize (que falha)**

`tests/auth.test.ts` — valida que credenciais corretas retornam usuário com `organizationId`/`role`, e incorretas retornam null. Extrair a lógica em `authorizeUser(email, password)` testável (consulta o banco de teste).
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import { hashPassword } from '@/lib/password'
import { authorizeUser } from '@/auth/config'

const sql = postgres(process.env.TEST_DATABASE_URL!)
const tdb = drizzle(sql, { schema })

beforeAll(async () => {
  await sql`TRUNCATE users, organizations RESTART IDENTITY CASCADE`
  const [org] = await tdb.insert(schema.organizations).values({ name: 'A', slug: 'a' }).returning()
  await tdb.insert(schema.users).values({
    organizationId: org.id, name: 'Dono', email: 'dono@x.com',
    passwordHash: await hashPassword('senha123'), role: 'owner',
  })
})

describe('authorizeUser', () => {
  it('aceita credenciais válidas e devolve org+role', async () => {
    const u = await authorizeUser('dono@x.com', 'senha123', tdb)
    expect(u?.role).toBe('owner')
    expect(u?.organizationId).toBeTruthy()
  })
  it('rejeita senha errada', async () => {
    expect(await authorizeUser('dono@x.com', 'errada', tdb)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.

- [ ] **Step 3: Implementar `authorizeUser` + config Auth.js**

`src/auth/config.ts`:
```ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { eq } from 'drizzle-orm'
import { db as defaultDb, schema } from '@/db'
import { verifyPassword } from '@/lib/password'

export async function authorizeUser(email: string, password: string, database = defaultDb) {
  const [u] = await database.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)
  if (!u) return null
  if (!(await verifyPassword(password, u.passwordHash))) return null
  return { id: u.id, name: u.name, email: u.email, organizationId: u.organizationId, role: u.role }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c) => authorizeUser(String(c?.email), String(c?.password)),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) { token.organizationId = (user as any).organizationId; token.role = (user as any).role }
      return token
    },
    session({ session, token }) {
      ;(session.user as any).organizationId = token.organizationId
      ;(session.user as any).role = token.role
      return session
    },
  },
})
```

`src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from '@/auth/config'
export const { GET, POST } = handlers
```

- [ ] **Step 4: Rodar e ver passar** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/ src/app/api/auth tests/auth.test.ts
git commit -m "feat: auth com credenciais, org e papel na sessão"
```

---

## Task 7: Seed da organização + dados de exemplo

**Files:**
- Create: `src/scripts/seed.ts`
- Modify: `package.json` (script `"seed": "tsx src/scripts/seed.ts"`)

Cria a org do usuário, branding Leavo, um usuário **owner**, e dados de exemplo (leads, stage events, ad_metrics) espelhando os valores do mockup `support.js` — para o Plano 2 ter o que renderizar.

- [ ] **Step 1: Escrever o seed**

`src/scripts/seed.ts`:
```ts
import 'dotenv/config'
import { db, schema } from '@/db'
import { hashPassword } from '@/lib/password'

async function main() {
  const [org] = await db.insert(schema.organizations)
    .values({ name: 'Leavo', slug: 'leavo' }).onConflictDoNothing().returning()
  const organizationId = org?.id ?? (await db.select().from(schema.organizations).limit(1))[0].id

  await db.insert(schema.orgBranding).values({ organizationId, productName: 'Leavo' }).onConflictDoNothing()

  await db.insert(schema.users).values({
    organizationId, name: 'Pedro Paulinetti', email: 'pedropaulinettid@gmail.com',
    passwordHash: await hashPassword('trocar-essa-senha'), role: 'owner',
  }).onConflictDoNothing()

  // Dados de exemplo (valores aproximados/placeholder inspirados no support.js — não precisam bater 1:1 com o mockup)
  const now = new Date()
  await db.insert(schema.adMetrics).values([
    { organizationId, provider: 'meta_ads', date: now, campaign: 'remarketing-q2', creative: 'Depoimento Cliente — Vídeo 30s', channel: 'meta', spendCents: 980 * 540, leads: 540, sales: 31, revenueCents: 14280000 },
    { organizationId, provider: 'meta_ads', date: now, campaign: 'prospec-lookalike', creative: 'Carrossel Antes e Depois', channel: 'meta', spendCents: 1390 * 430, leads: 430, sales: 22, revenueCents: 9840000 },
  ]).onConflictDoNothing()

  console.log('Seed concluído. Org:', organizationId)
  process.exit(0)
}
main()
```

- [ ] **Step 2: Adicionar script no package.json**

`"seed": "tsx src/scripts/seed.ts"`

- [ ] **Step 3: Rodar o seed**

Run: `npm run seed`
Expected: "Seed concluído. Org: <uuid>" e linhas criadas no banco.

- [ ] **Step 4: Verificar no banco**

Run: `psql "$DATABASE_URL" -c "select email, role from users; select count(*) from ad_metrics;"`
Expected: usuário owner presente; ad_metrics > 0.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/seed.ts package.json
git commit -m "feat: seed da org Leavo + usuário owner + dados de exemplo"
```

---

## Task 8: Smoke test — app sobe e auth está cabeada

**Files:**
- Create: `src/app/login/page.tsx` (mínimo, será estilizado no Plano 2)
- Create: `src/middleware.ts` (protege rotas autenticadas)

- [ ] **Step 1: Página de login mínima**

`src/app/login/page.tsx` — form que chama `signIn('credentials', ...)`. Sem estilo elaborado ainda.

- [ ] **Step 2: Middleware de proteção (config edge-safe)**

⚠️ **Armadilha conhecida (Auth.js v5 + middleware no edge runtime):** o middleware roda no edge e **não pode** importar nada que puxe `postgres`/`src/env.ts`. Por isso, divida a config:

`src/auth/edge.ts` (sem banco — só providers vazios e callbacks `authorized`):
```ts
import NextAuth from 'next-auth'
export const { auth: middlewareAuth } = NextAuth({
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const logged = !!auth?.user
      const onLogin = request.nextUrl.pathname.startsWith('/login')
      if (!logged && !onLogin) return false   // redireciona p/ /login
      return true
    },
  },
})
```

`src/middleware.ts`:
```ts
export { middlewareAuth as default } from '@/auth/edge'
export const config = { matcher: ['/', '/integracoes/:path*'] }
```

O `src/auth/config.ts` (com Drizzle/bcrypt) continua sendo usado só nas rotas/server (Node runtime), não no middleware.

- [ ] **Step 3: Subir o app**

Run: `npm run dev`
Expected: app em `http://localhost:3000`; acessar `/` sem login redireciona para `/login`.

- [ ] **Step 4: Login manual com o usuário do seed**

Logar com `pedropaulinettid@gmail.com` / `trocar-essa-senha`; após login, `/` carrega (mesmo que vazio).

- [ ] **Step 5: Rodar toda a suíte**

Run: `npx vitest run`
Expected: todos os testes (crypto, password, tenant, auth) PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/login src/middleware.ts
git commit -m "feat: login mínimo + middleware de proteção (smoke test da fundação)"
```

---

## Critério de pronto (Plano 1)

- [ ] `npx vitest run` verde (criptografia, senha, **isolamento multi-tenant**, auth).
- [ ] Migrações aplicadas; schema multi-tenant no Postgres.
- [ ] `npm run seed` cria a org Leavo, usuário owner e dados de exemplo.
- [ ] App sobe, protege rotas e permite login da equipe com papel na sessão.

**Próximo:** Plano 2 — portar o mockup e construir as queries de agregação que leem esses dados.
