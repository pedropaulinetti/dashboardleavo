import { describe, it, expect } from 'vitest'
import { fetchJson, paginate, type FetchLike } from '@/ingestion/http'

const noopSleep = async (_ms: number) => {}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('fetchJson', () => {
  it('sucesso: retorna o JSON e envia Authorization: Bearer correto', async () => {
    let receivedUrl = ''
    let receivedInit: RequestInit | undefined
    const fakeFetch: FetchLike = async (url, init) => {
      receivedUrl = url
      receivedInit = init
      return jsonResponse({ ok: true, n: 42 })
    }

    const out = await fetchJson<{ ok: boolean; n: number }>('https://api.test/x', {
      token: 'secret-token',
      fetchImpl: fakeFetch,
      sleep: noopSleep,
    })

    expect(out).toEqual({ ok: true, n: 42 })
    expect(receivedUrl).toBe('https://api.test/x')
    const headers = new Headers(receivedInit?.headers)
    expect(headers.get('Authorization')).toBe('Bearer secret-token')
  })

  it('envia Content-Type e serializa o body como JSON', async () => {
    let receivedInit: RequestInit | undefined
    const fakeFetch: FetchLike = async (_url, init) => {
      receivedInit = init
      return jsonResponse({ ok: true })
    }

    await fetchJson('https://api.test/x', {
      method: 'POST',
      body: { a: 1, b: 'two' },
      headers: { 'X-Custom': 'yes' },
      fetchImpl: fakeFetch,
      sleep: noopSleep,
    })

    const headers = new Headers(receivedInit?.headers)
    expect(receivedInit?.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Custom')).toBe('yes')
    expect(receivedInit?.body).toBe(JSON.stringify({ a: 1, b: 'two' }))
  })

  it('429 com Retry-After: 0 na 1a, 200 na 2a -> retorna ok apos 1 retry', async () => {
    let calls = 0
    const fakeFetch: FetchLike = async () => {
      calls++
      if (calls === 1) {
        return jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '0' })
      }
      return jsonResponse({ ok: true })
    }

    const out = await fetchJson<{ ok: boolean }>('https://api.test/x', {
      fetchImpl: fakeFetch,
      sleep: noopSleep,
    })

    expect(out).toEqual({ ok: true })
    expect(calls).toBe(2)
  })

  it('500 nas primeiras e 200 depois -> retry ate sucesso', async () => {
    let calls = 0
    const fakeFetch: FetchLike = async () => {
      calls++
      if (calls < 3) {
        return jsonResponse({ error: 'boom' }, 500)
      }
      return jsonResponse({ ok: true })
    }

    const out = await fetchJson<{ ok: boolean }>('https://api.test/x', {
      fetchImpl: fakeFetch,
      sleep: noopSleep,
    })

    expect(out).toEqual({ ok: true })
    expect(calls).toBe(3)
  })

  it('400 -> lanca imediatamente, sem retry', async () => {
    let calls = 0
    const fakeFetch: FetchLike = async () => {
      calls++
      return jsonResponse({ error: 'bad request' }, 400)
    }

    await expect(
      fetchJson('https://api.test/x', { fetchImpl: fakeFetch, sleep: noopSleep }),
    ).rejects.toThrow(/400/)
    expect(calls).toBe(1)
  })

  it('estoura maxRetries em 429 -> lanca', async () => {
    let calls = 0
    const fakeFetch: FetchLike = async () => {
      calls++
      return jsonResponse({ error: 'still limited' }, 429, { 'Retry-After': '0' })
    }

    await expect(
      fetchJson('https://api.test/x', {
        fetchImpl: fakeFetch,
        sleep: noopSleep,
        maxRetries: 2,
      }),
    ).rejects.toThrow(/429/)
    // 1 tentativa inicial + 2 retries = 3 chamadas
    expect(calls).toBe(3)
  })

  it('nao vaza credenciais na mensagem de erro', async () => {
    const fakeFetch: FetchLike = async () => jsonResponse({ error: 'nope' }, 403)
    let msg = ''
    try {
      await fetchJson('https://api.test/x', {
        token: 'super-secret-token',
        fetchImpl: fakeFetch,
        sleep: noopSleep,
      })
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toMatch(/403/)
    expect(msg).not.toContain('super-secret-token')
  })
})

describe('paginate', () => {
  it('acumula itens de varias paginas ate vazio', async () => {
    const pages = [
      { items: [1, 2], nextCursor: 'c1' },
      { items: [3, 4], nextCursor: 'c2' },
      { items: [] as number[], nextCursor: null },
    ]
    let idx = 0
    const fetchPage = async (_cursor: string | null) => {
      const p = pages[idx]
      idx++
      return p
    }

    const all = await paginate<number, string>(fetchPage)
    expect(all).toEqual([1, 2, 3, 4])
    expect(idx).toBe(3)
  })

  it('para quando nextCursor e nulo mesmo com itens', async () => {
    const pages = [
      { items: [1, 2], nextCursor: 'c1' },
      { items: [3, 4], nextCursor: null },
    ]
    let idx = 0
    const fetchPage = async (_cursor: string | null) => pages[idx++]

    const all = await paginate<number, string>(fetchPage)
    expect(all).toEqual([1, 2, 3, 4])
    expect(idx).toBe(2)
  })

  it('respeita maxPages', async () => {
    let idx = 0
    const fetchPage = async (_cursor: number | null) => {
      idx++
      return { items: [idx], nextCursor: idx }
    }

    const all = await paginate<number, number>(fetchPage, null, 3)
    expect(all).toEqual([1, 2, 3])
    expect(idx).toBe(3)
  })
})
