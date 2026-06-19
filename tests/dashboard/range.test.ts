import { describe, it, expect } from 'vitest'
import { resolveRange } from '@/dashboard/range'

const d = (s: string) => new Date(s + 'T00:00:00.000Z')

describe('resolveRange', () => {
  it('30d a partir de 2026-06-15', () => {
    const r = resolveRange({ period: '30d' }, d('2026-06-15'))
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-05-17') // 30 dias inclusive: 17/05..15/06
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-06-15')
    expect(r.prevTo.toISOString().slice(0, 10)).toBe('2026-05-16')
    expect(r.prevFrom.toISOString().slice(0, 10)).toBe('2026-04-17')
  })
  it('custom usa as datas e calcula período anterior de mesmo tamanho', () => {
    const r = resolveRange({ period: 'custom', from: '2026-06-01', to: '2026-06-10' }, d('2026-06-15'))
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(r.to.toISOString().slice(0, 10)).toBe('2026-06-10')
    expect(r.prevTo.toISOString().slice(0, 10)).toBe('2026-05-31')
    expect(r.prevFrom.toISOString().slice(0, 10)).toBe('2026-05-22') // 10 dias antes
  })
  it('period inválido cai em 30d', () => {
    const r = resolveRange({ period: 'xyz' }, d('2026-06-15'))
    expect(r.from.toISOString().slice(0, 10)).toBe('2026-05-17')
  })
})
