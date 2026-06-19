import { describe, it, expect } from 'vitest'
import { safeDiv, delta } from '@/dashboard/math'

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
