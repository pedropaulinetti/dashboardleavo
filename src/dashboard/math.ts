// Divisão segura: null quando denominador é 0 (evita Infinity/NaN em CPL, ROAS, deltas)
export function safeDiv(num: number, den: number): number | null {
  return den === 0 ? null : num / den
}

// delta relativo vs período anterior; null se anterior é 0 (ou se atual==anterior==0)
export function delta(cur: number, prev: number): number | null {
  return prev === 0 ? null : (cur - prev) / prev
}
