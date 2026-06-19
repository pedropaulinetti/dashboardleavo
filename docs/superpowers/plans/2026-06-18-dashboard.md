# Dashboard (Funil) — Implementation Plan (Plano 2 de 4)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a página **Dashboard de Funil** real — shell (header/nav/tema claro-escuro), filtros de período e canal, e todos os widgets do mockup (cards de destaque, cards de custo, funil, ranking de UTMs, donut de perdas, ranking de criativos) lendo **agregações reais** do Postgres (dados de seed por enquanto).

**Architecture:** Página server-component que resolve a org da sessão, lê filtros de período/canal dos search params da URL, chama uma camada de agregação (`src/dashboard/`) que roda queries Drizzle escopadas por `organization_id`, e renderiza componentes que reproduzem fielmente o mockup `Funil de Vendas.dc.html`. Interatividade (dropdowns de filtro, toggle de tema) em client components que atualizam a URL/cookie. Os cálculos do `compute()` do mockup viram funções de agregação testadas com PGlite.

**Tech Stack:** Next.js 16 (App Router, RSC), Drizzle, Postgres, Vitest + PGlite. Sem libs de chart (SVG portado do mockup). Tokens de design (CSS vars) do mockup em `globals.css`.

**Plano da série:** Plano **2 de 4**. Depende do Plano 1 (Fundação, concluído). O Plano 3 (Ingestão + página Integrações) e o 4 (Adaptadores reais) vêm depois. A página **Integrações NÃO faz parte deste plano** — a aba existe no nav mas aponta para um placeholder até o Plano 3.

---

## Contexto e referência

- **Mockup de referência** (permanece no repo): `Funil de Vendas.dc.html`. Contém o template (HTML/estilos inline) e, no `<script data-dc-script>`, o `compute()`/`renderVals()` com toda a lógica de cálculo e os estilos exatos. **Porte os visuais e os cálculos a partir desse arquivo.**
- Etapas do funil (fixas, já em `schema.ts` como `FUNNEL_STAGES`): `leads, mql, agendadas, realizadas, negociacoes, vendas`.
- Tabelas relevantes (Plano 1): `leads` (channel, utmSource, utmCampaign, currentStage, valueCents, createdAt), `lead_stage_events` (leadId, stage, occurredAt), `ad_metrics` (date, campaign, creative, channel, spendCents, impressions, clicks, leads, sales, revenueCents). Helper de escopo: `src/db/tenant.ts`.
- Valores monetários em **centavos**; formatar em BRL (pt-BR) só na borda de exibição.

### Mapeamento mockup → dados reais
| Widget do mockup | Origem real |
|---|---|
| Funil (contagem por etapa) | **`lead_stage_events`: nº de leads DISTINTOS que ATINGIRAM cada etapa** (têm evento daquela etapa) dentro do range/canal. Isso dá a curva **monotônica decrescente** do mockup (`[1240,520,310,…]`). **NÃO** usar `currentStage` (que conta quem está parado e quebra os cálculos abaixo). |
| Conversão geral | vendas / leads = funnel[5]/funnel[0] (com a contagem "atingiu a etapa" acima) |
| Card Receita | soma de `leads.valueCents` em estágio `vendas` (receita vem do DataCrazy → gravada em `valueCents`) |
| Card Vendas | contagem de leads em `vendas` |
| Card Investimento | soma de `ad_metrics.spendCents` |
| Card ROAS | receita / investimento |
| Cards de custo (CPL/CPMQL/CPM/CPC) | investimento ÷ (leads / mql / impressões×1000 / cliques) |
| Deltas "vs período anterior" | mesma métrica no período imediatamente anterior de mesmo tamanho |
| Ranking UTMs | `leads` agrupado por `(utmSource, utmCampaign)` + CPL via `ad_metrics` por campanha |
| Ranking criativos | `ad_metrics` agrupado por `creative`, ordenado por `revenueCents` |
| Donut "Motivos da perda" | `leads` com `lostReason` preenchido, agrupado por motivo |

### Decisões assumidas (registradas; flag para revisão humana)
1. **Filtro de período = range de datas** sobre `leads.createdAt` e `ad_metrics.date`. Presets 7d/30d/90d/12m + custom, como no mockup, mas calculados sobre datas reais (não fator de escala).
2. **Filtro de canal** = `leads.channel` / `ad_metrics.channel` (`all` ou um canal). Canais do seed: `meta`, `google`, `whats`, `indica`.
3. **Deltas reais** comparando com o período anterior de mesmo tamanho (substitui os deltas fixos do mockup).
4. **Motivos de perda** exigem um campo novo: adicionar `lostReason text` em `leads` (Task 1). Um lead é "perdido" se `lostReason` não é nulo.
5. Estado dos filtros vive na **URL** (`?period=&channel=&from=&to=`) → server component re-renderiza. Tema via **cookie** + classe `theme-dark` (igual mockup), com toggle client.

### Invariantes (consistência entre widgets) — OBRIGATÓRIO
- **Funil monotônico:** todo lead emite eventos (`lead_stage_events`) de TODAS as etapas anteriores até sua etapa atual. Logo `funnel[i] ≥ funnel[i+1]`.
- **Perdas casam com o funil:** `lostReason` só é preenchido em leads que **atingiram `negociacoes` e NÃO chegaram a `vendas`**. Assim `#perdidos(lostReason) ≤ funnel[negociacoes] − funnel[vendas]` e o donut não contradiz o funil.
- **Divisão por zero:** uma única helper `safeDiv(num, den)` retorna `null` quando `den===0`. Vale para custos (CPL/CPM/…) E para deltas (`(atual−anterior)/anterior` com `anterior===0` → delta `null`, exibido como `'—'`/"novo"). Não duplicar a regra.
- **NÃO** portar os pesos fixos do mockup (`lossDefs.w`, fator `f`): motivos de perda, conversões, `barW` e `convLabel` são **recalculados a partir dos dados reais**.

---

## Estrutura de arquivos (deste plano)

```
src/
  db/schema.ts                 # + coluna leads.lostReason (Task 1)
  scripts/seed.ts              # seed expandido (Task 2)
  dashboard/
    range.ts                   # resolve período (preset/custom) → {from,to,prevFrom,prevTo}  (Task 3)
    queries.ts                 # funções de agregação escopadas por org (Tasks 4-8)
    format.ts                  # fmtBRL, fmtInt, pct (porta do mockup)
    funnel-svg.ts              # gera os paths do funil (porta de compute())
    donut.ts                   # gera arcos do donut (porta de compute())
  app/
    globals.css                # tokens de design (CSS vars claro/escuro) do mockup
    (app)/layout.tsx           # shell autenticado: header + nav + tema
    (app)/page.tsx             # Dashboard (server component) — lê searchParams, chama queries, renderiza
    (app)/integracoes/page.tsx # placeholder "em breve" (real no Plano 3)
    components/
      Shell.tsx, ThemeToggle.tsx, NavTabs.tsx
      PeriodFilter.tsx, ChannelFilter.tsx           # client, atualizam a URL
      HighlightCards.tsx, CostCards.tsx, Funnel.tsx,
      UtmRanking.tsx, LossDonut.tsx, Creatives.tsx  # apresentação (server-friendly)
tests/
  dashboard/range.test.ts
  dashboard/queries.test.ts    # com PGlite + fixtures
  dashboard/format.test.ts
```

> Usa um route group `(app)` para o shell autenticado, mantendo `/login` fora dele. A home `/` passa a viver em `(app)/page.tsx`.

---

## Task 1: Coluna `lostReason` em `leads` (+ migração)

**Files:** `src/db/schema.ts`, `drizzle/` (migração gerada)

- [ ] **Step 1:** Em `src/db/schema.ts`, na tabela `leads`, adicionar coluna `lostReason: text('lost_reason')` (nullable).
- [ ] **Step 2:** Gerar e aplicar a migração:
  - `npx drizzle-kit generate`
  - `npx drizzle-kit migrate` (usa `MIGRATION_DATABASE_URL`, porta 5432).
- [ ] **Step 3:** Verificar a coluna no Supabase (script `.mjs` temporário via `DATABASE_URL` + `{prepare:false}`, apagar depois; não imprimir segredos).
- [ ] **Step 4: Commit** — `git add src/db/schema.ts drizzle/ && git commit -m "feat: coluna lostReason em leads (motivos de perda)"`

---

## Task 2: Seed expandido (dados realistas para o dashboard)

**Files:** `src/scripts/seed.ts`

Objetivo: gerar dados suficientes para todos os widgets terem números plausíveis, distribuídos por **canal**, **campanha/UTM**, **criativo** e ao longo de **datas** (para os filtros de período funcionarem). Mantém idempotência.

- [ ] **Step 1:** Reescrever o seed para, além de org/branding/owner, inserir (de forma idempotente — limpar e reinserir dados de demonstração da org, ou usar chaves estáveis):
  - **leads**: ~600–1000 leads distribuídos nos últimos 120 dias, com `channel` ∈ {meta,google,whats,indica}, `utmSource`/`utmCampaign` coerentes (espelhar `utmsBase` do mockup), `currentStage` distribuído pelo funil (mais no topo, afunilando), `valueCents` para os que estão em `vendas` (ticket ~ R$2.400 ±), e `lostReason` preenchido para parte dos que pararam em `negociacoes` (motivos do mockup: Preço/orçamento, Sumiu/sem retorno, Escolheu concorrente, Sem fit, Timing).
  - **lead_stage_events**: para cada lead, eventos das etapas por onde passou (até a `currentStage`), com `occurredAt` dentro do range.
  - **ad_metrics**: linhas diárias por canal pago (meta, google) × campanha × criativo (espelhar `creativesBase`/`utmsBase`), com `spendCents`, `impressions`, `clicks`, `sales`, `revenueCents` plausíveis, distribuídas nas datas.
  - Use uma **seed determinística** (sem `Math.random` puro — use um PRNG simples com semente fixa, ou distribua por índice) para o seed ser reprodutível.
  - **Respeitar as invariantes** da seção acima: emitir eventos de todas as etapas anteriores (funil monotônico); `lostReason` só em leads que atingiram `negociacoes` e não chegaram a `vendas`; `impressions` e `clicks` > 0 nos canais pagos (senão CPM/CPC ficam sempre "—").
- [ ] **Step 2:** `npm run seed` e verificar: leads com eventos por etapa formando funil **decrescente**; ad_metrics com **impressões e cliques > 0** nos canais pagos; alguns leads com `lostReason` (todos com evento `negociacoes` e sem `vendas`). Rodar 2x para confirmar idempotência (sem duplicar).
- [ ] **Step 3: Commit** — `git add src/scripts/seed.ts && git commit -m "feat: seed expandido com leads, eventos e métricas para o dashboard"`

---

## Task 3: Resolver período (range.ts) — TDD

**Files:** `src/dashboard/range.ts`, `tests/dashboard/range.test.ts`

- [ ] **Step 1 (teste que falha):** `resolveRange({ period, from, to }, today)` retorna `{ from, to, prevFrom, prevTo }` (datas). Casos:
  - `period='30d'` com `today=2026-06-15` → `from=2026-05-16`, `to=2026-06-15`, e `prev` = os 30 dias anteriores (`2026-04-16`..`2026-05-15`).
  - `period='custom'` com `from`/`to` → usa-os; `prev` = mesmo tamanho imediatamente antes.
  - `period` inválido → cai em `30d`.
  (Passar `today` como parâmetro — não usar `new Date()` direto, para o teste ser determinístico.)
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar `resolveRange` (presets 7d/30d/90d/12m em dias: 7/30/90/365; custom por datas).
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Commit** — `git add src/dashboard/range.ts tests/dashboard/range.test.ts && git commit -m "feat: resolução de período do dashboard"`

---

## Task 4: Formatação (format.ts) — TDD

**Files:** `src/dashboard/format.ts`, `tests/dashboard/format.test.ts`

- [ ] **Step 1 (teste que falha):** `fmtInt(1234)→'1.234'`, `fmtBRL(2400_00 centavos)→'R$ 2.400,00'` (recebe centavos), `fmtBRL0`, `pct(0.123)→'12,3%'`. (Espelhar `nf0/nf2/fmtBRL/pct` do mockup, mas recebendo **centavos** onde for dinheiro.)
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar com `Intl.NumberFormat('pt-BR')`.
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Commit** — `git commit -m "feat: helpers de formatação pt-BR (centavos→BRL)"`

---

## Task 5: Agregações do funil e destaques — TDD

**Files:** `src/dashboard/queries.ts`, `tests/dashboard/queries.test.ts`

Cada função recebe `(db, organizationId, { from, to, channel })`. Escopar SEMPRE por `organization_id`. Usar SQL/Drizzle (agregações com `count`, `sum`, `group by`). Testar com PGlite (`makeTestDb`) inserindo fixtures pequenas e determinísticas e conferindo números exatos.

- [ ] **Step 1 (teste que falha):** Fixtures: inserir org + leads conhecidos (ex.: 10 leads, distribuídos: 10 em 'leads', 6 'mql', ... 2 'vendas' com valueCents) + ad_metrics. Testar:
  - `getFunnel` → contagem por etapa via `lead_stage_events` (leads distintos que atingiram a etapa), **monotônica**; `convGeral` = funnel[vendas]/funnel[leads]. Testar também o caso de período anterior vazio.
  - `getHighlights` → receita (soma valueCents de vendas), vendas (count), investimento (soma spend), ROAS = receita/invest; deltas vs período anterior usando `safeDiv` (anterior=0 → delta `null`). Inserir fixtures no período anterior também e testar o caso anterior=0.
  - Implementar primeiro a helper `safeDiv(num, den)` (retorna `null` se `den===0`) e usá-la aqui e na Task 6.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar `getFunnel` e `getHighlights` (com a query do período anterior para deltas; delta = (atual-anterior)/anterior).
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Commit** — `git commit -m "feat: agregações de funil e cards de destaque"`

---

## Task 6: Agregações de custo, UTM e criativos — TDD

**Files:** `src/dashboard/queries.ts`, `tests/dashboard/queries.test.ts`

- [ ] **Step 1 (teste que falha):**
  - `getCostCards` → CPL=invest/leads, CPMQL=invest/mql, CPM=invest/impr×1000, CPC=invest/cliques (com deltas; tratar divisão por zero → null/'—').
  - `getUtmRanking` → agrupa leads por (utmSource, utmCampaign), soma leads/vendas, conversão=vendas/leads, CPL via spend da campanha; ordena por vendas desc, top 5.
  - `getCreatives` → agrupa ad_metrics por creative, soma sales/revenue, ordena por revenue desc, top 5; `barW` relativo ao máximo.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar as três.
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Commit** — `git commit -m "feat: agregações de custo, ranking de UTMs e criativos"`

---

## Task 7: Donut de perdas + orquestrador — TDD

**Files:** `src/dashboard/queries.ts`, `src/dashboard/donut.ts`, `src/dashboard/funnel-svg.ts`, `tests/dashboard/queries.test.ts`

- [ ] **Step 1 (teste que falha):**
  - `getLossReasons` → agrupa `leads` com `lostReason` não nulo por motivo, conta, calcula pct; total.
  - `buildDonutArcs(counts)` → porta a matemática do mockup (`compute()`: circunferência 2π·64, dash/offset por fatia). Conferir que a soma dos comprimentos ≈ circunferência.
  - `buildFunnelPaths(funnelCounts)` → porta a geração dos 18 paths SVG (6 segmentos × 3 camadas) do mockup. Conferir que retorna 18 paths com `d`/`fill`/`op`.
  - `getDashboardData(db, orgId, filters, today)` → orquestra todas as funções acima e devolve um objeto único pronto para a UI.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Commit** — `git commit -m "feat: motivos de perda, donut/funnel SVG e orquestrador do dashboard"`

---

## Task 8: Tokens de design + shell autenticado

**Files:** `src/app/globals.css`, `src/app/(app)/layout.tsx`, `src/app/components/{Shell,ThemeToggle,NavTabs}.tsx`, mover `src/app/page.tsx`→`src/app/(app)/page.tsx`

- [ ] **Step 1:** Portar os tokens CSS do mockup (bloco `:root` e `.theme-dark` do `<style>` em `Funil de Vendas.dc.html`, linhas ~15-43) para `globals.css`, incluindo fonte Inter e `--chart-*`.
- [ ] **Step 2:** Criar o route group `(app)` com `layout.tsx` que: chama `auth()`; se sem sessão, redireciona `/login`; renderiza o **header** (logo Leavo + "OWNER" do papel, nav Dashboard/Integração, toggle de tema) reproduzindo o header do mockup (linhas ~49-74). Tema via cookie `theme` + classe `theme-dark`.
- [ ] **Step 3:** `ThemeToggle` (client) alterna o cookie e a classe; `NavTabs` (client ou links) navega entre `/` e `/integracoes`.
- [ ] **Step 4:** Mover a home para `(app)/page.tsx` (placeholder por enquanto renderizando "Dashboard"). Criar `(app)/integracoes/page.tsx` com um placeholder "Em breve (Plano 3)".
- [ ] **Step 5:** `npm run build` deve passar; `npm run dev` e conferir login → header aparece, toggle de tema funciona, nav troca de rota.
- [ ] **Step 6: Commit** — `git commit -m "feat: tokens de design + shell autenticado (header/nav/tema)"`

---

## Task 9: Filtros (período + canal) na URL

**Files:** `src/app/components/{PeriodFilter,ChannelFilter}.tsx`

- [ ] **Step 1:** `PeriodFilter` (client) reproduz o dropdown do mockup (linhas ~89-119): presets + custom (inputs de data). Ao escolher, faz `router.push` atualizando `?period=` (e `?from=&to=` no custom).
- [ ] **Step 2:** `ChannelFilter` (client) reproduz o dropdown de canais (linhas ~120-134), atualiza `?channel=`.
- [ ] **Step 3:** Conferir visual (claro/escuro) e que mudar o filtro re-renderiza a página (Task 10 consome os params).
- [ ] **Step 4: Commit** — `git commit -m "feat: filtros de período e canal via URL"`

---

## Task 10: Página Dashboard + widgets (integração final)

**Files:** `src/app/(app)/page.tsx`, `src/app/components/{HighlightCards,CostCards,Funnel,UtmRanking,LossDonut,Creatives}.tsx`

- [ ] **Step 1:** `(app)/page.tsx` (server component): resolve org da sessão, lê `searchParams` (period/channel/from/to), chama `getDashboardData(db, orgId, filters, new Date())`, passa os dados aos componentes. (Aqui `new Date()` é aceitável — é runtime de request, não teste.)
  - ⚠️ **Next 16:** `searchParams` (e `cookies()`/`headers()`) são **assíncronos** — `const sp = await searchParams` antes de ler `sp.period` etc. O tipo da prop é `Promise<{...}>`.
- [ ] **Step 2:** Implementar cada componente de apresentação portando **fielmente** o respectivo bloco do mockup (mesmos estilos inline / estrutura):
  - `HighlightCards` (mockup ~137-151), `CostCards` (~153-163)
  - `Funnel` (~165-194: cabeçalho + 6 etapas + `<svg>` com os paths de `buildFunnelPaths`)
  - `UtmRanking` (~196-221), `LossDonut` (~223-250: `<svg>` com arcos de `buildDonutArcs` + legenda), `Creatives` (~252-279, incluindo estado vazio "Sem criativos pagos")
- [ ] **Step 3:** `npm run build` + `npm run dev`: logar, conferir que o Dashboard renderiza com os dados do seed, que **mudar período/canal** altera os números, e que **claro/escuro** mantém a aparência do mockup. Conferir visualmente contra `Funil de Vendas.dc.html` aberto no navegador.
- [ ] **Step 4:** Rodar `npx vitest run` (tudo verde) e `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat: página Dashboard com todos os widgets lendo dados reais"`

---

## Critério de pronto (Plano 2)

- [ ] `npx vitest run` verde (range, format, todas as agregações com fixtures determinísticas).
- [ ] `npm run build` e `npm run dev` OK; login → Dashboard renderiza com dados do seed.
- [ ] Filtros de período e canal alteram os números; tema claro/escuro fiel ao mockup.
- [ ] Todos os widgets do mockup presentes e visualmente fiéis (cards, funil, UTMs, donut, criativos).
- [ ] Nenhuma query lê dados sem escopar por `organization_id`.

**Próximo:** Plano 3 — página de Integrações + camada de ingestão (adaptadores, Vercel Cron, webhook).
