import { describe, it, expect } from 'vitest'
import { buildFunnelPaths } from '@/dashboard/funnel-svg'
import { buildDonutArcs } from '@/dashboard/donut'

describe('buildFunnelPaths', () => {
  const counts = [1240, 520, 310, 240, 130, 58]

  it('gera 18 paths (6 segmentos x 3 camadas)', () => {
    const paths = buildFunnelPaths(counts)
    expect(paths.length).toBe(18)
  })

  it('o primeiro path usa --chart-1, op 0.16 e começa em M 0.0', () => {
    const paths = buildFunnelPaths(counts)
    const first = paths[0]
    expect(first.fill).toBe('hsl(var(--chart-1))')
    expect(first.op).toBe(0.16)
    expect(first.d.startsWith('M 0.0')).toBe(true)
  })

  it('ids sequenciais 0..17 e fills por segmento', () => {
    const paths = buildFunnelPaths(counts)
    expect(paths.map((p) => p.id)).toEqual(
      Array.from({ length: 18 }, (_, i) => i),
    )
    // segmento i (3 camadas) -> --chart-(i+1)
    for (let i = 0; i < 6; i++) {
      for (let li = 0; li < 3; li++) {
        expect(paths[i * 3 + li].fill).toBe(`hsl(var(--chart-${i + 1}))`)
      }
    }
    // as ops por camada
    expect(paths.slice(0, 3).map((p) => p.op)).toEqual([0.16, 0.46, 0.85])
  })
})

describe('buildDonutArcs', () => {
  const counts = [36, 26, 18, 12, 8]
  const Cc = 2 * Math.PI * 64

  it('retorna um arco por contagem', () => {
    const arcs = buildDonutArcs(counts)
    expect(arcs.length).toBe(5)
  })

  it('a soma dos comprimentos (antes do gap) aproxima a circunferência', () => {
    const arcs = buildDonutArcs(counts)
    // seg = len - 3; soma(seg) ≈ Cc - 3*n
    const sumSeg = arcs.reduce((acc, a) => acc + parseFloat(a.dash.split(' ')[0]), 0)
    expect(sumSeg).toBeCloseTo(Cc - 3 * counts.length, 1)
  })

  it('offsets acumulam negativamente', () => {
    const arcs = buildDonutArcs(counts)
    const offsets = arcs.map((a) => parseFloat(a.offset))
    expect(offsets[0]).toBe(0) // primeiro arco começa em 0 (cum=0)
    // monotonicamente não-crescente (cada vez mais negativo)
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeLessThan(offsets[i - 1])
    }
  })
})
