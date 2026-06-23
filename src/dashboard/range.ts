export type Period = 'all' | 'month' | '7d' | '30d' | '90d' | '12m' | 'custom'

/** Granularidade do gráfico de evolução; mesmo tipo de `queries.ts`. */
type Granularity = 'day' | 'month' | 'year'

/**
 * Deriva a granularidade do gráfico de evolução a partir do tamanho do range,
 * evitando um seletor manual: até ~3 meses → dia, até ~2 anos → mês, acima → ano.
 */
export function granularityForRange(from: Date, to: Date): Granularity {
  const days = Math.round((to.getTime() - from.getTime()) / 86400000)
  if (days <= 92) return 'day' // até ~3 meses → por dia
  if (days <= 750) return 'month' // até ~2 anos → por mês
  return 'year' // acima → por ano
}

export interface RangeInput {
  period?: string
  from?: string
  to?: string
}

export interface ResolvedRange {
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
}

const PRESET_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Normaliza um Date para meia-noite UTC (início do dia). */
function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

/** Normaliza um Date para o fim do dia UTC (23:59:59.999). */
function utcEndOfDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  )
}

/** Faz parse de uma string ISO `YYYY-MM-DD` para meia-noite UTC. */
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Soma (ou subtrai) dias em UTC. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/**
 * Resolve um período (preset ou custom) em janelas atual e anterior.
 * Trabalha sempre em UTC, normalizado para meia-noite.
 */
export function resolveRange(input: RangeInput, today: Date): ResolvedRange {
  const period = input.period

  // `all`: todo o histórico. `from` bem no passado (ano 2000) e `to` no fim do
  // dia de hoje. O período anterior é uma janela de tamanho ~zero ANTES de
  // `from`, de modo que as contagens do período anterior deem 0 e os deltas
  // (delta(cur, prev) com prev===0 → null) fiquem "—".
  if (period === 'all') {
    const allFrom = new Date(Date.UTC(2000, 0, 1))
    const prevPoint = new Date(allFrom.getTime() - 1)
    return {
      from: allFrom,
      to: utcEndOfDay(utcMidnight(today)),
      prevFrom: prevPoint,
      prevTo: prevPoint,
    }
  }

  // `month`: mês corrente de `today`. `from` no primeiro dia do mês (meia-noite
  // UTC) e `to` no fim do dia de hoje. Período anterior = mês anterior completo:
  // `prevFrom` no primeiro dia do mês anterior e `prevTo` no fim do último dia do
  // mês anterior (1ms antes de `from`).
  if (period === 'month') {
    const monthFrom = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    )
    const prevTo = new Date(monthFrom.getTime() - 1)
    const prevFrom = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
    )
    return {
      from: monthFrom,
      to: utcEndOfDay(utcMidnight(today)),
      prevFrom,
      prevTo,
    }
  }

  // `from` e `toStart` são sempre o INÍCIO do dia (meia-noite UTC). O limite
  // superior efetivo (`to`) usa o FIM do dia para incluir o dia atual completo.
  let from: Date
  let toStart: Date

  if (period === 'custom' && input.from && input.to) {
    from = parseISODate(input.from)
    toStart = parseISODate(input.to)
  } else {
    const days = PRESET_DAYS[period ?? ''] ?? PRESET_DAYS['30d']
    toStart = utcMidnight(today)
    from = addDays(toStart, -(days - 1))
  }

  // Tamanho da janela em dias (inclusive), calculado sobre os inícios de dia.
  const sizeDays = Math.round((toStart.getTime() - from.getTime()) / DAY_MS) + 1

  // Período anterior: mesmo tamanho, imediatamente antes de `from`.
  const prevToStart = addDays(from, -1)
  const prevFrom = addDays(prevToStart, -(sizeDays - 1))

  return {
    from,
    to: utcEndOfDay(toStart),
    prevFrom,
    prevTo: utcEndOfDay(prevToStart),
  }
}
