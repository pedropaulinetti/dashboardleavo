// Divisão segura: null quando denominador é 0 (evita Infinity/NaN em CPL, ROAS, deltas)
export function safeDiv(num: number, den: number): number | null {
  return den === 0 ? null : num / den
}

// delta relativo vs período anterior; null se anterior é 0 (ou se atual==anterior==0)
export function delta(cur: number, prev: number): number | null {
  return prev === 0 ? null : (cur - prev) / prev
}

// Mediana de uma lista; null se vazia. Par -> média dos dois centrais. Não muta a entrada.
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
