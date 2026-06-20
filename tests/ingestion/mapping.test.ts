import { describe, it, expect } from 'vitest'
import { normalizeIdentity, mapStage, type StageMapping } from '@/ingestion/mapping'

describe('normalizeIdentity', () => {
  it('usa email em minúsculas (email vence telefone)', () => {
    expect(normalizeIdentity('Foo@Bar.com', '+55 (11) 99999-0000')).toBe('foo@bar.com')
  })

  it('trima e minuscula o email', () => {
    expect(normalizeIdentity('  ALICE@EXAMPLE.COM  ', null)).toBe('alice@example.com')
  })

  it('sem email, usa telefone só com dígitos', () => {
    expect(normalizeIdentity(null, '+55 (11) 98765-4321')).toBe('5511987654321')
  })

  it('sem email, telefone vazio depois de limpar dígitos -> null', () => {
    expect(normalizeIdentity('', '() - ')).toBeNull()
  })

  it('ambos vazios/nulos -> null', () => {
    expect(normalizeIdentity(null, null)).toBeNull()
    expect(normalizeIdentity('', '')).toBeNull()
    expect(normalizeIdentity(undefined, undefined)).toBeNull()
  })
})

describe('mapStage', () => {
  const map: StageMapping = {
    novo: 'leads',
    qualificado: 'mql',
    perdido: 'ignore',
  }

  it('mapeia a chave para a etapa do funil', () => {
    expect(mapStage(map, 'novo')).toBe('leads')
    expect(mapStage(map, 'qualificado')).toBe('mql')
  })

  it("retorna null quando o valor mapeado é 'ignore'", () => {
    expect(mapStage(map, 'perdido')).toBeNull()
  })

  it('retorna null quando a chave está ausente no mapa', () => {
    expect(mapStage(map, 'inexistente')).toBeNull()
  })

  it('retorna null quando a chave é nula/vazia/undefined', () => {
    expect(mapStage(map, null)).toBeNull()
    expect(mapStage(map, undefined)).toBeNull()
    expect(mapStage(map, '')).toBeNull()
  })
})
