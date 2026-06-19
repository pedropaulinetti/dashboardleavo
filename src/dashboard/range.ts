export type Period = '7d' | '30d' | '90d' | '12m' | 'custom'

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
