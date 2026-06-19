export interface DonutArc {
  dash: string
  offset: string
}

/**
 * Gera os arcos (stroke-dasharray / stroke-dashoffset) do donut de motivos de perda.
 * Porta EXATA da matemática do `compute()` do mockup (raio 64, gap visual 3).
 */
export function buildDonutArcs(counts: number[]): DonutArc[] {
  const Cc = 2 * Math.PI * 64
  const total = counts.reduce((a, b) => a + b, 0) || 1
  let cum = 0
  return counts.map((c) => {
    const len = (c / total) * Cc
    const seg = Math.max(len - 3, 0)
    const arc: DonutArc = {
      dash: `${seg.toFixed(2)} ${(Cc - seg).toFixed(2)}`,
      offset: (-cum).toFixed(2),
    }
    cum += len
    return arc
  })
}
