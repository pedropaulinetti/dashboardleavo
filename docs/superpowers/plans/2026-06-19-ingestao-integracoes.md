# Ingestão + Integrações — Implementation Plan (Plano 3 de 4)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a **página de Integrações** (conectar/desconectar fontes com credenciais criptografadas) e a **estrutura de ingestão** (interface de adaptador, camada de upsert idempotente, rota de Cron de sincronização e rota de webhook) — toda a "encanação" para os dados reais fluírem. Os **adaptadores reais** das APIs (Leavo/DataCrazy/Meta) ficam no Plano 4.

**Architecture:** Catálogo de provedores (`src/ingestion/providers.ts`) define os 4 provedores do v1. Um serviço (`src/ingestion/integrations.ts`) gerencia as linhas de `integrations` por org (criptografando credenciais via `src/lib/crypto.ts`). A página `(app)/integracoes` (server) lista provedores e usa **server actions** (owner-only) para conectar/desconectar. A ingestão por **pull** roda numa rota de Cron (`/api/cron/sync`) que itera integrações conectadas, chama o adaptador registrado (stub no Plano 3), normaliza e faz **upsert idempotente** escopado por org. A ingestão por **push** entra por `/api/webhooks/[token]`, que valida o token e grava em `raw_events`.

**Tech Stack:** Next.js 16 (App Router, server actions, route handlers), Drizzle, Postgres, Vitest + PGlite, `crypto.ts` (AES-256-GCM já pronto). Vercel Cron via `vercel.json`.

**Plano da série:** Plano **3 de 4**. Depende de 1 (Fundação) e 2 (Dashboard), ambos concluídos. O **Plano 4** pluga os adaptadores reais (precisa das docs/chaves das APIs). Este plano deixa tudo pronto para isso: ao fim, dá pra **conectar** as contas na UI e o webhook já recebe dados; os pulls usam adaptadores stub (retornam vazio) até o Plano 4.

---

## Contexto e referência

- Mockup `Funil de Vendas.dc.html` seção **Integrações** (linhas ~284-350): categorias → cards com logo, nome, status (dot+label), descrição, e três estados: botão **Conectar**, **formulário** (campos + Salvar/Cancelar), e **conectado** (chave mascarada `••••{tail}` + Desconectar). Porte esses visuais.
- Tabela `integrations` (Plano 1): `organizationId, provider, status (connected/disconnected/error), credentialsEncrypted (text), config (jsonb), cursor, webhookToken, lastSyncAt, lastError`. Unique `(organizationId, provider)`.
- `raw_events`: `organizationId, integrationId, provider, payload (jsonb), processed, receivedAt`.
- `src/lib/crypto.ts`: `encrypt(plain, keyHex)` / `decrypt(payload, keyHex)`. Chave em `env.ENCRYPTION_KEY`.
- Auth: `auth()` → `session.user.organizationId`, `session.user.role` (`owner`/`member`). Gerência de integrações é **owner-only**.

### Provedores do v1 (catálogo)
| id | nome | categoria | tipo | campos de credencial |
|---|---|---|---|---|
| `leavo` | Leavo | Fontes de dados | pull | API Token |
| `datacrazy` | DataCrazy | Fontes de dados | pull | API Key |
| `meta_ads` | Meta Ads | Anúncios | pull | ID da conta (`act_…`), Token de acesso |
| `webhook` | Webhook | Webhooks | push | (nenhum — gera uma URL com token para copiar) |

---

## Estrutura de arquivos (deste plano)

```
src/
  ingestion/
    providers.ts        # catálogo dos 4 provedores (id, nome, categoria, tipo, campos, logo)
    types.ts            # SourceAdapter interface + tipos normalizados (NormalizedLead, etc.)
    registry.ts         # mapa provider→adaptador; adaptadores STUB no Plano 3
    integrations.ts     # serviço: list/connect/disconnect (criptografa credenciais), por org
    persist.ts          # upsert idempotente de {leads, stageEvents, adMetrics} por org
    sync.ts             # orquestra um ciclo de sync de uma org (itera integrações pull)
  app/
    (app)/integracoes/
      page.tsx          # server: lista provedores + status (porta o mockup)
      actions.ts        # server actions owner-only: connect/disconnect
      IntegrationCard.tsx, ConnectForm.tsx   # client p/ formulário/estado
    api/
      cron/sync/route.ts        # GET protegido por CRON_SECRET → roda sync de todas as orgs
      webhooks/[token]/route.ts # POST → valida token, grava raw_events
vercel.json             # agenda o cron (a cada 15 min)
tests/ingestion/*.test.ts
```

---

## Task 1: Catálogo de provedores + tipos de adaptador

**Files:** `src/ingestion/providers.ts`, `src/ingestion/types.ts`

- [ ] **Step 1:** `providers.ts` — array `PROVIDERS` com os 4 do catálogo acima: `{ id, name, category, kind: 'pull'|'push', fields: {label,name,type}[], logo, description }`. (Logos: use `public/leavo/logos/meta.svg` para meta; para os demais, um placeholder/ícone genérico já existente ou string vazia.)
- [ ] **Step 2:** `types.ts` — tipos normalizados e a interface do adaptador:
```ts
export type NormalizedLead = { externalId: string; channel?: string; utmSource?: string; utmCampaign?: string; currentStage: string; valueCents?: number; lostReason?: string | null; createdAt: Date; updatedAt: Date }
export type NormalizedStageEvent = { leadExternalId: string; stage: string; occurredAt: Date }
export type NormalizedAdMetric = { date: Date; campaign: string; creative: string; channel?: string; spendCents: number; impressions: number; clicks: number; leads: number; sales: number; revenueCents: number }
export type PullResult = { leads: NormalizedLead[]; stageEvents: NormalizedStageEvent[]; adMetrics: NormalizedAdMetric[]; nextCursor: string | null }
export interface SourceAdapter { provider: string; pull(ctx: { credentials: Record<string,unknown>; cursor: string | null }): Promise<PullResult> }
```
- [ ] **Step 3: Commit** — `git commit -m "feat: catálogo de provedores + interface de adaptador de ingestão"`

---

## Task 2: Camada de upsert idempotente (persist.ts) — TDD

**Files:** `src/ingestion/persist.ts`, `tests/ingestion/persist.test.ts`

- [ ] **Step 1 (teste que falha):** `persist(db, orgId, provider, pullResult)` insere/atualiza `leads` (upsert), `lead_stage_events` (upsert, resolvendo `leadExternalId`→`leadId`) e `ad_metrics` (upsert). Teste: rodar `persist` 2x com os mesmos dados NÃO duplica (contagens estáveis) e atualiza campos mutáveis (ex.: `currentStage`).
  - ⚠️ O fixture/fake do teste DEVE usar `createdAt`/`updatedAt` (obrigatórios, sem default no schema) e `occurredAt` **determinísticos** (vindos do "payload", não `new Date()`), senão a unique de `lead_stage_events` `(org, leadId, stage, occurredAt)` nunca casa e o teste de idempotência falha por design.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar com `onConflictDoUpdate` do Drizzle, escopando por org. Use os **targets de conflito compostos exatos** das uniques: `leads` → `(organizationId, provider, externalId)`; `lead_stage_events` → `(organizationId, leadId, stage, occurredAt)`; `ad_metrics` → `(organizationId, provider, date, campaign, creative)` (target só por `externalId` NÃO casa a constraint). Resolver `leadExternalId`→`leadId` (buscar os leads da org/provider após o upsert de leads). No `set` do update, inclua `organizationId`/`provider` implícitos via filtro, e atualize `updatedAt`.
- [ ] **Step 4:** Rodar e ver passar (com PGlite).
- [ ] **Step 5: Commit** — `git commit -m "feat: upsert idempotente de dados de ingestão (persist)"`

---

## Task 3: Serviço de integrações (connect/disconnect/list) — TDD

**Files:** `src/ingestion/integrations.ts`, `tests/ingestion/integrations.test.ts`

- [ ] **Step 1 (teste que falha):**
  - `listIntegrations(db, orgId)` → junta o catálogo `PROVIDERS` com as linhas de `integrations` da org, devolvendo status/`tail` (últimos 4 chars da credencial, para o "••••{tail}") e `webhookToken`/URL quando aplicável.
  - `connectIntegration(db, orgId, provider, credentials)` → criptografa `credentials` (JSON) com `crypto.encrypt` usando `env.ENCRYPTION_KEY`, faz upsert da linha `integrations` com `status='connected'`; para `provider='webhook'`, gera um `webhookToken` aleatório (não exige credenciais).
  - `disconnectIntegration(db, orgId, provider)` → `status='disconnected'`, limpa `credentialsEncrypted`.
  - Teste: connect grava credencial **criptografada** (não em texto puro), `decrypt` recupera; disconnect zera; list reflete status. Escopo por org (org A não vê integração de org B).
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar (Drizzle upsert por `(organizationId, provider)`; token via `crypto.randomBytes`).
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Commit** — `git commit -m "feat: serviço de integrações (connect/disconnect/list) com credenciais criptografadas"`

---

## Task 4: Server actions (owner-only) + página Integrações

**Files:** `src/app/(app)/integracoes/{page.tsx,actions.ts,IntegrationCard.tsx,ConnectForm.tsx}`

- [ ] **Step 1:** `actions.ts` (`'use server'`): `connectAction(provider, formData)` e `disconnectAction(provider)`. Cada uma: `auth()`; verificar `session.user.role==='owner'` (senão lançar/retornar erro); chamar o serviço; `revalidatePath('/integracoes')`.
  - ⚠️ **Binding do provider (Next 16):** uma server action passada a `<form action={...}>` recebe **só** o `FormData`. Para passar o `provider`, use `connectAction.bind(null, provider)` no server component (ou um `<input type="hidden" name="provider">` lido do FormData). A assinatura `(provider, formData)` funciona com `.bind(null, provider)`. Idem para `disconnectAction`.
- [ ] **Step 2:** `page.tsx` (server): `auth()` → org; `listIntegrations(db, orgId)`; renderizar por categoria (porta o mockup ~284-350) usando `IntegrationCard`. Mostrar status (dot+label), descrição, e: se desconectado → `ConnectForm` (campos do provider) ou botão Conectar; se conectado → chave mascarada `••••{tail}` + Desconectar. Para `webhook` conectado, mostrar a **URL do webhook** (`/api/webhooks/{token}`) para copiar.
- [ ] **Step 3:** `IntegrationCard.tsx`/`ConnectForm.tsx` (client conforme necessário): o formulário envia para `connectAction`; o botão Desconectar chama `disconnectAction`. Estado de loading.
- [ ] **Step 4:** Verificar: `npm run build`; `npm run dev`, logar, abrir `/integracoes`, conectar um provedor (ex.: Leavo com um token fake) → status vira Conectado e mostra `••••`; desconectar volta. (Owner-only: como o seed cria owner, ok.)
- [ ] **Step 5: Commit** — `git commit -m "feat: página de Integrações + server actions owner-only"`

---

## Task 5: Registry de adaptadores (stubs) + orquestração de sync — TDD

**Files:** `src/ingestion/registry.ts`, `src/ingestion/sync.ts`, `tests/ingestion/sync.test.ts`

- [ ] **Step 1:** `registry.ts` — mapa `provider→SourceAdapter`. No Plano 3, adaptadores **stub** para `leavo`/`datacrazy`/`meta_ads` que retornam `PullResult` vazio (`{leads:[],stageEvents:[],adMetrics:[],nextCursor:cursor}`). (Plano 4 substitui pelos reais.)
- [ ] **Step 2 (teste que falha):** `syncOrg(db, orgId, adapters?)` — itera as `integrations` da org com `status='connected'` e `kind='pull'`; para cada uma: decripta credenciais, chama `adapter.pull({credentials, cursor})`, `persist(...)`, atualiza `cursor`, `lastSyncAt`, limpa `lastError`. Em erro de um provider, grava `lastError` e segue os demais (não interrompe). Teste com um **adaptador fake** que retorna dados conhecidos → confirma persistência e atualização de cursor; e um fake que lança → confirma `lastError` setado e que os outros rodaram.
- [ ] **Step 3:** Rodar e ver falhar; implementar; ver passar (PGlite).
- [ ] **Step 4: Commit** — `git commit -m "feat: registry de adaptadores (stub) + orquestração de sync por org"`

---

## Task 6: Rota de Cron de sincronização

**Files:** `src/app/api/cron/sync/route.ts`, `vercel.json`, `.env` + `.env.example` (+`CRON_SECRET`)

- [ ] **Step 1:** Gerar um `CRON_SECRET` e adicioná-lo ao `.env` local e ao `.env.example`. **NÃO** adicionar ao `src/env.ts` (que faz `schema.parse` no import — torná-lo obrigatório lá quebraria build/testes de quem não tem a var). A rota lê `process.env.CRON_SECRET` direto e checa.
- [ ] **Step 2:** `route.ts` (GET): mecanismo ÚNICO de auth = header `Authorization: Bearer ${process.env.CRON_SECRET}`. Isso é exatamente o que o **Vercel Cron envia automaticamente** quando a env var `CRON_SECRET` existe no projeto Vercel (não há "header próprio" separado). Se `CRON_SECRET` não estiver configurado no ambiente → 500 (mau-configurado); se o header não casar → 401. Se ok: iterar todas as `organizations`, chamar `syncOrg(db, orgId)` para cada; retornar JSON com resumo (orgs processadas, erros). `export const dynamic = 'force-dynamic'`.
- [ ] **Step 3:** `vercel.json`: `{ "crons": [{ "path": "/api/cron/sync", "schedule": "*/15 * * * *" }] }`.
- [ ] **Step 4:** ⚠️ **Configurar `CRON_SECRET` nas Environment Variables do projeto na Vercel** (no deploy) — sem isso o cron agendado chama a rota SEM `Authorization` e toma 401 (ingestão silenciosamente quebrada). Deixe isso anotado como passo de deploy (não dá pra fazer localmente agora; registrar no README/nota do plano).
- [ ] **Step 5:** Verificar localmente: `curl -H "Authorization: Bearer <secret-do-.env>" http://localhost:PORT/api/cron/sync` → 200 com resumo; sem secret → 401. (Com adaptadores stub, não muda dados — só exercita o caminho.)
- [ ] **Step 5: Commit** — `git commit -m "feat: rota de Cron de sincronização (protegida) + vercel.json"`

---

## Task 7: Rota de webhook (push) — TDD onde aplicável

**Files:** `src/app/api/webhooks/[token]/route.ts`, `tests/ingestion/webhook.test.ts` (lógica de mapeamento testável)

- [ ] **Step 1 (teste que falha):** extrair a lógica testável: `handleWebhook(db, token, payload)` → busca a `integration` com aquele `webhookToken` (qualquer org); se não achar → resultado "not found"; se achar → grava `raw_events` (organizationId/integrationId/provider/payload, `processed=false`) e atualiza `lastSyncAt`. Teste: token válido grava `raw_events`; token inválido não grava e sinaliza not-found; escopo de org correto.
- [ ] **Step 2:** Rodar e ver falhar; implementar `handleWebhook`; ver passar (PGlite).
- [ ] **Step 3:** `route.ts` (POST `[token]`): lê o body com `JSON.parse` **seguro** (try/catch → body inválido retorna **400**, não 500), chama `handleWebhook`; 404 se token inválido, 200 se ok. `handleWebhook` grava `raw_events.provider` a partir da **row da integração encontrada** (campo é notNull). (Mapeamento `raw_events`→normalizado fica no Plano 4, junto do formato real de cada fonte.)
- [ ] **Step 4:** Verificar: `curl -X POST http://localhost:PORT/api/webhooks/<token-de-uma-integração-webhook> -d '{"teste":1}'` → 200 e linha em `raw_events`; token aleatório → 404.
- [ ] **Step 5: Commit** — `git commit -m "feat: rota de webhook (grava raw_events idempotente por token)"`

---

## Critério de pronto (Plano 3)

- [ ] `npx vitest run` verde (persist, integrations, sync, webhook).
- [ ] `npm run build` OK; `/integracoes` lista os 4 provedores e permite **conectar/desconectar** (credenciais criptografadas no banco; chave mascarada na UI).
- [ ] Webhook recebe POST e grava `raw_events`; cron protegido roda `syncOrg` para todas as orgs (stubs).
- [ ] Owner-only nas ações de integração; tudo escopado por `organization_id`.

**Próximo:** Plano 4 — adaptadores reais (Leavo, DataCrazy, Meta Ads) + mapeamento dos `raw_events` do webhook, substituindo os stubs. **Requer as docs/chaves das APIs.** Aí os números do dashboard passam a ser os seus dados reais.
