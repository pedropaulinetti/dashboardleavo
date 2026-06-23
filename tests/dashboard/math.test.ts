import { describe, it, expect } from 'vitest'
import { safeDiv, delta, median } from '@/dashboard/math'

describe('safeDiv', () => {
  it('retorna null quando denominador é 0', () => {
    expect(safeDiv(10, 0)).toBeNull()
  })
  it('divide normalmente quando denominador != 0', () => {
    expect(safeDiv(10, 2)).toBe(5)
  })
})

describe('delta', () => {
  it('calcula delta relativo vs período anterior', () => {
    expect(delta(110, 100)).toBeCloseTo(0.1, 10)
  })
  it('retorna null quando anterior é 0', () => {
    expect(delta(5, 0)).toBeNull()
  })
})

describe('median', () => {
  it('retorna null para lista vazia', () => {
    expect(median([])).toBeNull()
  })
  it('valor central para nº ímpar de elementos', () => {
    expect(median([3, 1, 2])).toBe(2)
  })
  it('média dos dois centrais para nº par de elementos', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('não muta o array de entrada', () => {
    const xs = [3, 1, 2]
    median(xs)
    expect(xs).toEqual([3, 1, 2])
  })
})
