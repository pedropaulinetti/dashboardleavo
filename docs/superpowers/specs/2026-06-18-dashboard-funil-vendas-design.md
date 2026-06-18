# Design — Dashboard de Funil de Vendas (Leavo) com integrações

**Data:** 2026-06-18
**Autor:** Pedro Paulinetti (dono da Leavo) + Claude
**Status:** Aprovado para virar plano de implementação

---

## 1. Contexto e objetivo

Existe hoje um **mockup visual estático** do dashboard de funil de vendas em formato DesignContext
(`Funil de Vendas.dc.html` + `support.js`), com dados fictícios embutidos. O objetivo é transformá-lo
num **aplicativo real e funcional**: banco de dados, autenticação de equipe e integrações com fontes de
dados externas, mantendo fielmente o visual já desenhado.

O produto é o dashboard da **Leavo** (software do próprio usuário), mas foi decidido construir desde o
início com **fundação multi-tenant** para no futuro virar um produto **white-label** usado por outras
empresas. No v1, opera apenas a organização do usuário (sem cadastro público).

### Telas do mockup (que o app precisa reproduzir com dados reais)
- **Funil de Vendas**: volume por etapa + taxa de passagem entre estágios.
- **Ranking de UTMs**: origem/campanha por leads, vendas, conversão e CPL.
- **Ranking de criativos**: por vendas e receita.
- **Cards de custo / CPL geral / donut por canal.**
- **Negociações perdidas** (deals que não viraram venda).
- **Página de Integrações**: conectar/desconectar fontes, status, último sync, erros.

### Etapas do funil (fixas no v1)
`Leads → MQL → Agendadas → Realizadas → Negociações → Vendas`
(Modeladas como constante, mas a estrutura permite virar configurável por organização depois.)

---

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Stack | **Next.js (App Router, React) + Postgres** |
| Hospedagem | **Vercel** (app) + Postgres gerenciado (**Neon** ou **Supabase**) |
| Sincronização | **Vercel Cron** a cada ~15 min + sync **incremental** (abordagem A) |
| Tenancy | **Multi-tenant desde o v1** (organization_id em tudo); opera só 1 org no v1 |
| White-label | Camada de branding por org (logo/cores via CSS vars); sem signup público no v1 |
| Usuários | Multi-usuário com papéis **owner** e **member** |
| Etapas do funil | Fixas no v1 |
| Receita/valor | Vem do **DataCrazy** no v1 (outros CRMs depois) |
| Credenciais das APIs | **Tenho todas agora** → integrações reais no v1 |

### Fontes de dados do v1 e seus papéis
- **Leavo API** (pull) → leads e movimentação pelas etapas do funil.
- **DataCrazy API** (pull) → receita/valor das vendas + atribuição (UTM/origem).
- **Meta Ads API** (pull) → gasto, impressões, cliques, campanhas e criativos (→ CPL, custos, ranking de criativos).
- **Webhook genérico** (push) → fontes futuras.

---

## 3. Arquitetura geral

```
FONTES                      INGESTÃO (Next.js)            ARMAZENAMENTO        APRESENTAÇÃO
┌────────────┐   pull       ┌──────────────────┐
│ Leavo API  │─────────────▶│ Adaptador Leavo  │\
├────────────┤   pull       ├──────────────────┤ \   normaliza
│ DataCrazy  │─────────────▶│ Adaptador DataCr.│  ─────────────▶ ┌──────────┐    ┌──────────────┐
├────────────┤   pull       ├──────────────────┤ /   p/ formato  │ Postgres │───▶│ Dashboard    │
│ Meta Ads   │─────────────▶│ Adaptador Meta   │/    único       │          │    │ (funil, UTM, │
├────────────┤   push       ├──────────────────┤                 │          │    │ criativos…)  │
│ Webhook X  │─────────────▶│ Rota /webhooks   │                 └──────────┘    └──────────────┘
└────────────┘              └──────────────────┘                      ▲                  ▲
                            Vercel Cron a cada ~15min ────────────────┘        queries de agregação
```

**Princípio central:** cada fonte tem um **adaptador** que conhece aquela API e traduz para um **formato
único** (leads, eventos de etapa, métricas de anúncio). O dashboard nunca fala com APIs externas — só lê
do Postgres normalizado. Adicionar uma fonte nova = escrever mais um adaptador.

- **Pull** (Leavo, DataCrazy, Meta): Vercel Cron dispara a cada ~15 min e roda sync incremental por
  organização, usando um **cursor** por integração.
- **Push** (webhook): rota `/api/webhooks/[token]` recebe POST de qualquer ferramenta, grava o payload
  cru em `raw_events` e mapeia para o formato único.

---

## 4. Modelo de dados (Postgres)

Todas as tabelas de dados carregam `organization_id` (FK) e todas as queries são escopadas por ele.

| Tabela | Propósito | Campos principais |
|---|---|---|
| `organizations` | tenant (empresa) | id, nome, slug, criado_em |
| `org_branding` | white-label por org | organization_id, nome_produto, logo_url, cor_primária, cores extras, (futuro: domínio) |
| `users` | login da equipe | id, organization_id, nome, email (único), senha_hash, **papel** (owner/member) |
| `integrations` | cada fonte conectada | id, organization_id, provider (leavo/datacrazy/meta_ads/webhook), status (connected/disconnected/error), **credenciais (criptografadas, jsonb)**, config (jsonb), cursor, último_sync_em, último_erro, webhook_token |
| `leads` | cada lead/negócio | id, organization_id, provider, external_id, canal, utm_source, utm_campaign, **etapa_atual**, valor_centavos, criado_em, atualizado_em — único `(organization_id, provider, external_id)` |
| `lead_stage_events` | passagem pelo funil | id, organization_id, lead_id, etapa, ocorrido_em |
| `ad_metrics` | performance diária de anúncios | id, organization_id, provider, data, campanha, criativo, canal, gasto_centavos, impressões, cliques, leads, vendas, receita_centavos — único `(organization_id, provider, data, campanha, criativo)` |
| `raw_events` | auditoria/replay | id, organization_id, integration_id, provider, payload (jsonb), recebido_em, processado |

Notas:
- Valores monetários em **centavos (inteiro)** para evitar erros de float.
- `lead_stage_events` permite calcular volume por etapa e taxa de passagem ao longo do tempo;
  `leads.etapa_atual` dá o estado atual.
- Deduplicação garantida pelas unique constraints com `organization_id`.

---

## 5. Camada de ingestão (adaptadores)

Interface comum (conceitual):

```ts
interface SourceAdapter {
  provider: 'leavo' | 'datacrazy' | 'meta_ads'
  pull(org: Organization, integration: Integration):
    Promise<{ leads: NormalizedLead[]; stageEvents: NormalizedStageEvent[]; adMetrics: NormalizedAdMetric[]; nextCursor: string }>
}
```

Pontos-chave:
- **Sync incremental** com cursor por integração (ex.: `updated_since`) — não reprocessa tudo, cabe no
  tempo das funções serverless.
- **Idempotência**: tudo é **upsert** por chave única; rodar o sync 2x não duplica nada.
- **Webhook**: grava payload cru em `raw_events` **antes** de processar; reprocessável se o mapeamento mudar.
- **Resiliência**: falha em uma fonte grava `último_erro` na integração e **não** interrompe as outras; o
  cron tenta de novo no próximo ciclo.
- **Validação** de payloads com **Zod** na entrada de cada adaptador e do webhook.

### Orquestração (Vercel Cron)
- Uma rota protegida (ex.: `/api/cron/sync`) é chamada pelo Vercel Cron a cada ~15 min.
- Itera as organizações e suas integrações ativas, chama `pull` de cada adaptador, faz upsert e avança o cursor.

---

## 6. Camada de agregação (leitura do dashboard)

Endpoints de leitura que recebem `{ período (de/até), canal }` e devolvem dados **já agregados**, sempre
escopados por `organization_id`. Um endpoint por bloco da tela:

- **Funil por etapa** + taxa de passagem → `leads` / `lead_stage_events`.
- **Ranking de UTMs** (leads, vendas, conversão, CPL) → `leads` + gasto de `ad_metrics`.
- **Ranking de criativos** (vendas, receita) → `ad_metrics`.
- **Cards de custo / CPL geral / donut por canal** → `ad_metrics` + `leads`.
- **Negociações perdidas** → `leads` com etapa de perda.

### Chave de atribuição (decisão a resolver no início do plano)
Lead vem da **Leavo**, receita/UTM vem do **DataCrazy** e gasto/criativo vem do **Meta Ads**. É preciso
definir **como casar** essas três fontes num mesmo lead/venda. Candidatos: correspondência por `external_id`,
por e-mail/telefone do lead, ou por UTM (source/campaign). Essa decisão precisa ser tomada com as docs das
APIs em mãos, logo no começo da implementação, pois define o cálculo de conversão, CPL e receita por criativo.

---

## 7. Autenticação e papéis

- Login email/senha (**Auth.js / NextAuth**) + sessão; cada usuário pertence a uma `organization`.
- **owner**: gerencia integrações e credenciais, convida usuários, vê tudo.
- **member**: vê o dashboard; **não** gerencia integrações.
- Toda requisição resolve a organização do usuário logado e escopa as queries por ela
  (org A nunca enxerga dados da org B).
- Credenciais das APIs **criptografadas em repouso**; chave de criptografia em variável de ambiente.
- **Webhook**: a rota `/api/webhooks/[token]` valida o `webhook_token` da integração antes de aceitar o
  POST; token gerado na criação da integração e regenerável pelo owner.

---

## 8. Frontend

- Reconstrução **fiel** do mockup `Funil de Vendas.dc.html` como componentes React (Next.js App Router),
  trocando dados fake pelas queries reais. Tema claro/escuro já presente no mockup é preservado.
- Telas: **Login**, **Dashboard (Funil)**, **Integrações** (conectar/desconectar, status, último sync, erros).
- **Branding por org** via variáveis CSS (logo + cores) — base do white-label; no v1 usa a marca Leavo.
- Filtros de **período** e **canal** no topo do dashboard, aplicados às queries de agregação.

---

## 9. Erros, segredos e testes

- **Validação**: Zod nos payloads de adaptadores e webhook.
- **Segredos**: variáveis de ambiente; credenciais de integração criptografadas no banco.
- **Testes**:
  - Unitários dos adaptadores (normalização source → formato único).
  - Unitários das agregações (com dados de exemplo) conferindo funil, CPL, rankings.
  - **Isolamento multi-tenant**: garantir que org A nunca recebe dado de org B.
  - Idempotência: rodar sync 2x não duplica leads/métricas.

---

## 10. Fora de escopo no v1 (YAGNI)

- Cadastro público / onboarding de novas empresas.
- Billing / planos / cobrança.
- Domínio próprio por cliente (campo previsto em `org_branding`, mas não ativado).
- Etapas de funil configuráveis por org (estrutura permite, não implementado).
- Outros CRMs além de Leavo/DataCrazy/Meta Ads (webhook genérico cobre o "encaixe" futuro).

---

## 11. Caminho para white-label futuro (sem reescrita)

Como o banco já é multi-tenant e há camada de branding, virar SaaS depois é essencialmente:
1. Ligar fluxo de **signup/criação de organização**.
2. Tela de **branding** por org (logo/cores/nome) — campos já existem.
3. (Opcional) **domínio próprio** por org.
4. (Opcional) **billing**.

Nenhum desses exige mexer no modelo de dados central nem nas queries — só adicionar superfícies novas.
