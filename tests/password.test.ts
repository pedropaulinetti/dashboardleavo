import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/password'

describe('password', () => {
  it('verifica senha correta e rejeita incorreta', async () => {
    const hash = await hashPassword('segredo')
    expect(hash).not.toBe('segredo')
    expect(await verifyPassword('segredo', hash)).toBe(true)
    expect(await verifyPassword('errada', hash)).toBe(false)
  })
})
