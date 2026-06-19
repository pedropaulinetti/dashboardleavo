import { describe, it, expect } from 'vitest'
import { fmtInt, fmtBRLfromCents, fmtBRL0fromCents, pct } from '@/dashboard/format'

describe('fmtInt', () => {
  it('formata inteiro pt-BR com separador de milhar', () => {
    expect(fmtInt(1234)).toBe('1.234')
    expect(fmtInt(0)).toBe('0')
    expect(fmtInt(1000000)).toBe('1.000.000')
  })
})

describe('fmtBRLfromCents', () => {
  it('formata centavos como BRL com 2 casas', () => {
    expect(fmtBRLfromCents(240000)).toBe('R$ 2.400,00')
    expect(fmtBRLfromCents(0)).toBe('R$ 0,00')
    expect(fmtBRLfromCents(99)).toBe('R$ 0,99')
  })
})

describe('fmtBRL0fromCents', () => {
  it('formata centavos como BRL sem casas (arredonda)', () => {
    expect(fmtBRL0fromCents(240000)).toBe('R$ 2.400')
    expect(fmtBRL0fromCents(240050)).toBe('R$ 2.401') // 2400.50 -> 2401
  })
})

describe('pct', () => {
  it('formata fração como porcentagem com 1 casa', () => {
    expect(pct(0.123)).toBe('12,3%')
    expect(pct(0)).toBe('0,0%')
    expect(pct(1)).toBe('100,0%')
  })
})
