# Adaptadores Reais + Mapeamento — Implementation Plan (Plano 4 de 4)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os adaptadores STUB pelos **reais** (Leavo, DataCrazy, Meta Ads), com uma camada de **mapeamento por integração** (etapas reais do cliente → as 6 etapas fixas do funil; campos de origem/valor) e **junção por identidade** (email/telefone) entre Leavo e DataCrazy — para o dashboard mostrar os **dados reais** do cliente.

**Architecture:** Cada integração guarda em `integrations.config` (jsonb) um **mapeamento**: status/stage do cliente → etapa do funil, e quais campos carregam origem/UTM/valor. Os adaptadores chamam as APIs reais (paginando, respeitando rate limits), enriquecem com custom fields quando preciso, e normalizam usando o mapeamento. Como Leavo e DataCrazy podem ter o mesmo cliente, cada `lead` ganha um `identityKey` (email/telefone normalizado); as agregações do funil passam a contar **clientes distintos por identidade**, tomando a **etapa mais avançada** atingida em qualquer sistema. Receita/perda vêm do DataCrazy; gasto/criativos do Meta. Uma **tela de mapeamento** na página de Integrações puxa as etapas/campos reais da conta conectada e deixa o owner mapear.

**Tech Stack:** Next.js 16, Drizzle, Postgres, Vitest + PGlite, `fetch` para as APIs. Sem SDKs (chamadas REST diretas). Mocks de HTTP nos testes; verificação contra API real nos passos marcados **[LIVE]** (precisam das chaves).

**Plano da série:** Plano **4 de 4** (final). Depende de 1-3 (todos concluídos). Substitui os stubs de `src/ingestion/registry.ts`.

---

## Fonte da verdade por widget (decidido com o cliente)
- **Funil (etapas):** Leavo (topo: leads/captação) **+** DataCrazy (pipeline: agendada→ganho), unidos por identidade. Etapa = a **mais avançada** atingida, via mapeamento de cada sistema.
- **Receita + Motivo de perda:** DataCrazy (`business.total`, `lossReasonId`).
- **Origem/UTM:** campo personalizado que o cliente apontar (Leavo custom field ou DataCrazy `source`/additionalField).
- **Gasto/Impressões/Cliques/Campanha/Criativo (cards de custo + criativos):** Meta Ads.

## Verdades das APIs (dos briefings — ver `docs/.../specs` e os briefings de pesquisa)
- **Leavo:** base `https://api.leavo.ai/backend`; `Authorization: Bearer`. `GET /leads` (offset/limit, **sem** filtro incremental). Status atual em `status_id`/`status.name`; lista de status em `GET /status`. Custom fields por lead via `GET /lead-fields/{lead_id}` (1 req/lead). **Sem histórico de etapas** → histórico só via webhook `status_changed` (payload a confirmar **[LIVE]**). Rate limit 100/min.
- **DataCrazy:** base `https://api.g1.datacrazy.io/api/v1`; `Authorization: Bearer`. `GET /businesses` (`skip`/`take`, filtros `lastMovedAfter`, `createdAtGreaterOrEqual`; campos `total`, `status` won/in_process/lost, `stageId`, `leadId`, `lossReasonId`, `lastMovedAt`, `externalId`). `GET /leads` (campos `email`, `rawPhone`, `source`, `sourceReferral`, `additionalFields`; só `createdAt`). `GET /pipelines/{id}/stages`, motivos de perda. **Unidade de `total` a confirmar [LIVE]** (centavos vs reais). Rate limit 60/min por rota.
- **Meta Ads:** Graph API `https://graph.facebook.com/v21.0/act_{id}/insights` com `fields=spend,impressions,clicks,actions,campaign_name,ad_name` e `level=ad`, `time_increment=1`; token de acesso. Valores em reais (string) → converter p/ centavos.

---

## Task 1: `identityKey` em leads + tipos de mapeamento (+ migração)

**Files:** `src/db/schema.ts`, `src/ingestion/mapping.ts`, `drizzle/`

- [ ] **Step 1:** Adicionar `identityKey text` (nullable) em `leads` (email normalizado, ou telefone só-dígitos como fallback). Índice em `(organizationId, identityKey)`.
- [ ] **Step 2:** `src/ingestion/mapping.ts` — tipos do `integrations.config`:
```ts
export type FunnelStage = 'leads'|'mql'|'agendadas'|'realizadas'|'negociacoes'|'vendas'
export type StageMapping = Record<string, FunnelStage | 'ignore'>   // chave = status_id/stage_id do cliente
export type FieldMapping = { value?: string; utmSource?: string; utmCampaign?: string; channel?: string; lostReason?: string }
export type LeavoConfig = { statusMap: StageMapping; fields?: FieldMapping }
export type DataCrazyConfig = { stageMap: StageMapping; valueUnit: 'cents'|'reais'; sourceField?: string; lossReasonMap?: Record<string,string> }
export type MetaConfig = { adAccountId: string }
export function normalizeIdentity(email?: string|null, phone?: string|null): string|null  // lower(email) || dígitos(phone)
```
- [ ] **Step 3:** Migração (`drizzle-kit generate` + `migrate`); verificar coluna **[LIVE-DB]** (precisa do banco acessível).
- [ ] **Step 4: Commit.**

## Task 2: Junção por identidade nas agregações — TDD

**Files:** `src/dashboard/queries.ts`, `tests/dashboard/queries.test.ts`

- [ ] **Step 1 (teste):** Ajustar `getFunnelCounts` para contar **clientes distintos por `identityKey`** (fallback `id` quando identityKey nulo) que atingiram cada etapa, tomando a etapa mais avançada entre providers. Fixtures: o mesmo identityKey com eventos em providers diferentes conta **uma vez**, na etapa mais avançada.
- [ ] **Step 2-4:** Implementar (group/dedupe por identityKey), ver verde. Garantir que os testes existentes (1 provider) seguem passando.
- [ ] **Step 5: Commit.**

## Task 3: HTTP client com paginação + rate limit — TDD

**Files:** `src/ingestion/http.ts`, `tests/ingestion/http.test.ts`

- [ ] **Step 1 (teste):** `fetchJson(url, opts)` com: header de auth, retry com backoff em 429/5xx respeitando `Retry-After`, e um helper `paginate()` genérico. Mockar `fetch` (injeção) — sem rede no teste.
- [ ] **Step 2-4:** Implementar; testar 429→retry, paginação até esvaziar.
- [ ] **Step 5: Commit.**

## Task 4: Adaptador Leavo — TDD (mock) + verificação [LIVE]

**Files:** `src/ingestion/adapters/leavo.ts`, `tests/ingestion/adapters/leavo.test.ts`

- [ ] **Step 1 (teste, mock HTTP):** `leavoAdapter.pull({credentials, cursor, config})`:
  - Pagina `GET /backend/leads` (offset/limit) até o fim.
  - Para cada lead: `currentStage` = `config.statusMap[status_id]` (ou `status.name`); ignora se `'ignore'`.
  - Enriquecimento de custom fields (`GET /lead-fields/{id}`) **só** se `config.fields` apontar value/utm/etc. (1 req/lead — respeitar rate limit).
  - `identityKey` = `normalizeIdentity(email, phone)`.
  - Gera 1 `NormalizedStageEvent` (stage atual, occurredAt=updated_at) como aproximação inicial (sem histórico).
  - Aceita o envelope array-nu OU `{data,...}` (inconsistência documentada).
  - Testar com respostas mockadas conhecidas → normalização correta conforme um `statusMap` de teste.
- [ ] **Step 2-4:** Implementar; ver verde.
- [ ] **Step 5 [LIVE]:** Com a chave real (quando disponível): rodar um script de probe que lista status (`GET /status`), 1 página de leads e os custom fields de 1 lead; **confirmar nomes de campos, valores de status e a unidade do campo de valor**; ajustar o adapter se preciso.
- [ ] **Step 6: Commit.**

## Task 5: Adaptador DataCrazy — TDD (mock) + verificação [LIVE]

**Files:** `src/ingestion/adapters/datacrazy.ts`, `tests/ingestion/adapters/datacrazy.test.ts`

- [ ] **Step 1 (teste, mock HTTP):** `datacrazyAdapter.pull`:
  - `GET /businesses` paginando (`skip`/`take`), filtro incremental `lastMovedAfter = cursor`.
  - Resolver `stageId` → etapa via `config.stageMap`; `status` won→`vendas`, lost→marca `lostReason` (via `lossReasonId`→texto), in_process→etapa do stage.
  - `valueCents` = `business.total` convertido conforme `config.valueUnit` (cents direto, ou reais×100).
  - Casar `business.leadId`→`GET /leads/{id}` (ou lista de leads) p/ pegar `email`/`rawPhone`→`identityKey`, e `source`/additionalField→canal/UTM conforme `config.sourceField`.
  - `nextCursor` = maior `lastMovedAt` visto.
  - Testar com mocks → `vendas`/receita/perda/identityKey corretos.
- [ ] **Step 2-4:** Implementar; ver verde.
- [ ] **Step 5 [LIVE]:** Com a chave real: listar pipelines/stages e 1 página de businesses; **confirmar a unidade de `total`** (comparar com o valor no CRM) e os ids de stage/lossReason; ajustar.
- [ ] **Step 6: Commit.**

## Task 6: Adaptador Meta Ads — TDD (mock) + verificação [LIVE]

**Files:** `src/ingestion/adapters/meta.ts`, `tests/ingestion/adapters/meta.test.ts`

- [ ] **Step 1 (teste, mock HTTP):** `metaAdapter.pull`:
  - `GET /v21.0/act_{id}/insights?level=ad&time_increment=1&fields=spend,impressions,clicks,actions,campaign_name,ad_name&time_range=...` paginando (cursor `paging.next`).
  - Normaliza p/ `NormalizedAdMetric` por dia×campanha×criativo: `spendCents`=spend×100, impressions, clicks, `sales`/`leads` a partir de `actions` (action_type `offsite_conversion`/`lead`), `revenueCents` a partir de `action_values` se houver. `channel='meta'`.
  - Testar com payload mockado do Meta → métricas corretas.
- [ ] **Step 2-4:** Implementar; ver verde.
- [ ] **Step 5 [LIVE]:** Com act_id+token reais: 1 chamada de insights de 7 dias; confirmar os campos/`actions`; ajustar.
- [ ] **Step 6: Commit.**

## Task 7: Registrar adaptadores reais + passar config ao sync

**Files:** `src/ingestion/registry.ts`, `src/ingestion/sync.ts`, `src/ingestion/types.ts`, testes

- [ ] **Step 1:** Estender `SourceAdapter.pull` para receber também `config` (o jsonb da integração). Atualizar `syncOrg` para passar `integration.config`.
- [ ] **Step 2:** Trocar os stubs do `registry` pelos adaptadores reais (leavo/datacrazy/meta_ads).
- [ ] **Step 3:** Ajustar `sync.test.ts` (os fakes recebem config). Ver verde.
- [ ] **Step 4: Commit.**

## Task 8: Tela de mapeamento na página de Integrações

**Files:** `src/app/(app)/integracoes/*`, `src/ingestion/integrations.ts`, rotas auxiliares

- [ ] **Step 1:** Endpoint/server-action que, dada uma integração **conectada**, busca as **etapas/campos reais** da conta: Leavo `GET /status` + custom field definitions; DataCrazy `GET /pipelines/stages` + loss reasons. (Precisa da chave conectada — **[LIVE]**.)
- [ ] **Step 2:** UI de mapeamento (após conectar): lista as etapas reais com um `<select>` por etapa apontando para uma das 6 (ou "não usar"); selects para apontar os campos de valor/UTM/canal; para DataCrazy, escolher a unidade de valor. Salva em `integrations.config` (owner-only).
- [ ] **Step 3:** Validar build + (com chave) o fluxo conectar→mapear→salvar.
- [ ] **Step 4: Commit.**

## Task 9: Webhook Leavo `status_changed` → stage event — TDD + [LIVE]

**Files:** `src/ingestion/webhook.ts` (mapeamento), `tests/...`

- [ ] **Step 1 [LIVE]:** Confirmar o payload real do `status_changed` (criar webhook de teste na Leavo apontando para a rota `/api/webhooks/{token}` e inspecionar `raw_events`).
- [ ] **Step 2 (teste):** Função que processa um `raw_events` da Leavo `status_changed` → grava um `NormalizedStageEvent` (lead, novo stage via statusMap, occurredAt=timestamp). Idempotente.
- [ ] **Step 3-4:** Implementar; ver verde.
- [ ] **Step 5: Commit.**

---

## Critério de pronto (Plano 4)
- [ ] `npx vitest run` verde (http, 3 adaptadores com mocks, junção por identidade, webhook mapping).
- [ ] Adaptadores reais registrados; `syncOrg` usa o `config` de mapeamento.
- [ ] Tela de mapeamento funciona: conectar → puxar etapas reais → mapear → salvar.
- [ ] **[LIVE]** Com as chaves: probes confirmaram nomes de campos, valores de status/stage e a **unidade monetária**; um sync real popula o dashboard com dados reais; webhook `status_changed` grava histórico de etapa.
- [ ] Nenhuma credencial/segredo em log; tudo escopado por org.

**Observações:** os passos **[LIVE]** exigem as chaves (Leavo/DataCrazy/Meta) e — para o `[LIVE-DB]` da migração e o sync real — uma rede que alcance o Supabase (o hotspot bloqueia a porta 6543; usar rede normal ou rodar via o ambiente da Vercel).
