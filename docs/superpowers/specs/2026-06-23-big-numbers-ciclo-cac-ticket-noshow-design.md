# Big numbers: Ciclo de vendas, Ticket médio, CAC e Taxa de no-show

Data: 2026-06-23

## Objetivo

Adicionar 4 novos cards de destaque ("big numbers") ao dashboard de funil:

1. **Ticket médio** — receita por venda.
2. **CAC** (Custo de Aquisição de Cliente) — investimento em mídia por venda.
3. **Ciclo de vendas** — tempo (mediana, em dias) entre a geração do lead e o fechamento.
4. **Taxa de no-show** — proporção de reuniões agendadas que não se realizaram.

## Definições

Escopo de todas as métricas: org + coorte por `leads.createdAt` no range + canal (mesmo `Filters`
das demais queries). Todas com delta vs. período anterior.

| Métrica        | Cálculo                                                     | Fonte                                  | Direção         |
|----------------|-------------------------------------------------------------|----------------------------------------|-----------------|
| Ticket médio   | `receitaCents / vendas`                                     | `receitaCents`, `funnelCounts[5]`      | maior é melhor  |
| CAC            | `investCents / vendas`                                      | `adAgg.investCents`, `funnelCounts[5]` | menor é melhor  |
| No-show        | `(agendadas − realizadas) / agendadas`                      | `funnelCounts[2]`, `funnelCounts[3]`   | menor é melhor  |
| Ciclo de vendas| mediana dos dias `(min(occurredAt stage='vendas') − createdAt)` | nova query                         | menor é melhor  |

- **Ticket, CAC, No-show** são *assembly puro* a partir de primitivos já computados em
  `getDashboardData`/`getHighlights` — não exigem novas queries.
- **Ciclo de vendas** exige uma nova query (`salesCycleDaysList`) que retorna, por lead que
  atingiu `vendas` na coorte, a duração em dias entre `leads.createdAt` e o **primeiro** evento
  `vendas` (`min(occurredAt)`). A **mediana é calculada em JS** (robusta a outliers; evita
  dependência de `percentile_cont` entre Postgres/PGlite; nº de vendas é pequeno).

## Tratamento de vazios

Divisor zero ou ausência de vendas/agendamentos → valor `null` → UI exibe `—` sem delta
(mesmo padrão do ROAS atual). Mediana de lista vazia → `null`.

Deltas seguem `delta()` existente: anterior == 0 → `null`.

## Mudanças

### `src/dashboard/queries.ts`
- Nova função `salesCycleDaysList(db, orgId, filters): Promise<number[]>` — durações em dias.
- Nova função pura `median(xs: number[]): number | null` (em `math.ts`).
- Estende `interface Highlights` com:
  `ticketMedioCents`, `cacCents` (`number | null`), `noShowRate` (`number | null`),
  `cicloVendasDias` (`number | null`), e os 4 deltas em `deltas`.
- `assembleHighlights` recebe também as durações de ciclo (atual e anterior) e calcula os
  4 novos valores + deltas (`deltaOrNull`).
- `getHighlights` e `getDashboardData` passam a buscar `salesCycleDaysList` (atual e anterior)
  em paralelo com os demais primitivos.

### `src/dashboard/math.ts`
- `median(xs: number[]): number | null` — ordena cópia; média dos dois centrais se par.

### `src/app/components/HighlightCards.tsx`
- Grid passa de 4 para 8 cards (2 linhas de 4). Ordem:
  `Receita | Vendas | Investimento | ROAS` / `Ticket médio | CAC | Ciclo vendas | No-show`.
- `deltaColor` ganha flag `lowerIsBetter` que inverte verde/vermelho. Aplicada a CAC,
  No-show e Ciclo de vendas. Ticket médio e os 4 existentes mantêm "maior é melhor".
- Formatos: Ticket/CAC via `fmtBRL0fromCents`; No-show via `pct`; Ciclo via `"{n} dias"`
  (arredondado); `null` → `—`.
- Novos ícones SVG inline no estilo dos existentes.

## Testes (`tests/dashboard/queries.test.ts`)
- Ciclo: mediana com nº ímpar e par de vendas; sem vendas → `null`; respeita coorte/canal/org.
- Ticket médio: receita/vendas; sem vendas → `null`.
- CAC: invest/vendas; sem vendas → `null`.
- No-show: `(agendadas−realizadas)/agendadas`; agendadas 0 → `null`.
- Deltas das 4: vs. anterior e `null` quando anterior vazio.
- `median()` puro em `math.test.ts` (par, ímpar, vazio).
```
