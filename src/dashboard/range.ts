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

/** Normaliza um Date para meia-noite UTC. */
function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
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

  let from: Date
  let to: Date

  if (period === 'custom' && input.from && input.to) {
    from = parseISODate(input.from)
    to = parseISODate(input.to)
  } else {
    const days = PRESET_DAYS[period ?? ''] ?? PRESET_DAYS['30d']
    to = utcMidnight(today)
    from = addDays(to, -(days - 1))
  }

  // Tamanho da janela em dias (inclusive).
  const sizeDays = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1

  const prevTo = addDays(from, -1)
  const prevFrom = addDays(prevTo, -(sizeDays - 1))

  return { from, to, prevFrom, prevTo }
}
