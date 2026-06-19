const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

const brlFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const brl0Fmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const pctFmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * Alguns ambientes usam espaço não-quebrável (U+00A0) ou estreito (U+202F)
 * após "R$". Normalizamos para espaço comum para asserções estáveis.
 */
function normalizeSpaces(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, ' ')
}

/** Inteiro pt-BR com separador de milhar. `1234` -> `'1.234'`. */
export function fmtInt(n: number): string {
  return intFmt.format(n)
}

/** Centavos -> BRL com 2 casas. `240000` -> `'R$ 2.400,00'`. */
export function fmtBRLfromCents(cents: number): string {
  return normalizeSpaces(brlFmt.format(cents / 100))
}

/** Centavos -> BRL sem casas (arredonda). `240000` -> `'R$ 2.400'`. */
export function fmtBRL0fromCents(cents: number): string {
  return normalizeSpaces(brl0Fmt.format(cents / 100))
}

/** Fração (0..1) -> porcentagem com 1 casa. `0.123` -> `'12,3%'`. */
export function pct(x: number): string {
  return `${pctFmt.format(x * 100)}%`
}
