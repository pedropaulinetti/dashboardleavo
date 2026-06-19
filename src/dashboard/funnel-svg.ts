export interface FunnelPath {
  id: number
  d: string
  fill: string
  op: number
}

// Camadas empilhadas do funil (opacidade + multiplicador de altura).
const LAYERS = [
  { op: 0.16, m: 0.94 },
  { op: 0.46, m: 0.78 },
  { op: 0.85, m: 0.62 },
]

/**
 * Gera os 18 paths SVG do funil (6 segmentos x 3 camadas).
 * Porta EXATA da matemática do `compute()` do mockup (~496-516).
 */
export function buildFunnelPaths(counts: number[]): FunnelPath[] {
  const H = 256
  const gap = 8
  const n = 6
  const W = 1200
  const segW = (W - gap * (n - 1)) / n

  const maxV = counts[0] || 1
  const norm = counts.map((v) => v / maxV)

  const paths: FunnelPath[] = []
  for (let i = 0; i < n; i++) {
    const x0 = i * (segW + gap)
    const x1 = x0 + segW
    const vL = norm[i]
    const vR = i < n - 1 ? norm[i + 1] : norm[i]
    const cx1 = x0 + segW * 0.55
    const cx2 = x0 + segW * 0.45

    LAYERS.forEach((Ly, li) => {
      const hL = vL * Ly.m * H
      const hR = vR * Ly.m * H
      const tL = (H - hL) / 2
      const bL = (H + hL) / 2
      const tR = (H - hR) / 2
      const bR = (H + hR) / 2
      const d = `M ${x0.toFixed(1)} ${tL.toFixed(1)} C ${cx1.toFixed(1)} ${tL.toFixed(1)}, ${cx2.toFixed(1)} ${tR.toFixed(1)}, ${x1.toFixed(1)} ${tR.toFixed(1)} L ${x1.toFixed(1)} ${bR.toFixed(1)} C ${cx2.toFixed(1)} ${bR.toFixed(1)}, ${cx1.toFixed(1)} ${bL.toFixed(1)}, ${x0.toFixed(1)} ${bL.toFixed(1)} Z`
      paths.push({ id: i * 3 + li, d, fill: `hsl(var(--chart-${i + 1}))`, op: Ly.op })
    })
  }
  return paths
}
