import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto'

const KEY = 'a'.repeat(64) // 32 bytes em hex

describe('crypto', () => {
  it('round-trip: decrypt(encrypt(x)) === x', () => {
    const plain = JSON.stringify({ token: 'segredo-123' })
    const enc = encrypt(plain, KEY)
    expect(enc).not.toContain('segredo-123')
    expect(decrypt(enc, KEY)).toBe(plain)
  })

  it('texto cifrado difere a cada chamada (IV aleatório)', () => {
    expect(encrypt('x', KEY)).not.toBe(encrypt('x', KEY))
  })

  it('decrypt lança erro nomeado em payload malformado', () => {
    expect(() => decrypt('xxx', 'a'.repeat(64))).toThrow(/InvalidCiphertext/)
  })
})
