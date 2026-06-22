import { describe, it, expect } from 'vitest'
import { fetchProviderStages, type ProviderStage } from '@/ingestion/catalog'

type FetchLike = typeof fetch

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('fetchProviderStages - datacrazy', () => {
  it('junta os estagios de todos os pipelines, com group=pipeline.name, ordenado por index', async () => {
    const urls: string[] = []
    const fakeFetch: FetchLike = async (input) => {
      const url = String(input)
      urls.push(url)
      if (url.endsWith('/pipelines')) {
        return jsonResponse({
          data: [{ id: 'p1', name: 'Funil de Vendas', group: 'g', stagesCount: 3 }],
        })
      }
      if (url.includes('/pipelines/p1/stages')) {
        // de proposito fora de ordem, para provar a ordenacao por index
        return jsonResponse({
          count: 3,
          data: [
            { id: 's2', name: 'Negociação', color: '#fff', index: 9 },
            { id: 's3', name: 'Fechado', color: '#fff', index: 10 },
            { id: 's1', name: 'Base', color: '#fff', index: 0 },
          ],
        })
      }
      throw new Error(`URL inesperada: ${url}`)
    }

    const out = await fetchProviderStages('datacrazy', { apiKey: 'x' }, fakeFetch)

    expect(out).toEqual<ProviderStage[]>([
      { id: 's1', name: 'Base', group: 'Funil de Vendas', index: 0 },
      { id: 's2', name: 'Negociação', group: 'Funil de Vendas', index: 9 },
      { id: 's3', name: 'Fechado', group: 'Funil de Vendas', index: 10 },
    ])
    // chamou /pipelines e depois os /stages do pipeline
    expect(urls.some((u) => u.endsWith('/pipelines'))).toBe(true)
    expect(urls.some((u) => u.includes('/pipelines/p1/stages'))).toBe(true)
  })

  it('lanca erro claro quando apiKey ausente (sem vazar credencial)', async () => {
    await expect(
      fetchProviderStages('datacrazy', {}, async () => jsonResponse({})),
    ).rejects.toThrow(/apiKey/i)
  })
})

describe('fetchProviderStages - leavo', () => {
  it('aceita resposta array-nu de /status e retorna {id,name}[]', async () => {
    const fakeFetch: FetchLike = async (input) => {
      const url = String(input)
      if (url.endsWith('/status')) {
        return jsonResponse([
          { id: 's1', name: 'Novo', color: '#000', default: true },
          { id: 's2', name: 'Qualificado', color: '#111', default: false },
        ])
      }
      throw new Error(`URL inesperada: ${url}`)
    }

    const out = await fetchProviderStages('leavo', { apiToken: 't' }, fakeFetch)
    expect(out).toEqual<ProviderStage[]>([
      { id: 's1', name: 'Novo' },
      { id: 's2', name: 'Qualificado' },
    ])
  })

  it('aceita resposta no formato {data:[...]} de /status', async () => {
    const fakeFetch: FetchLike = async () =>
      jsonResponse({
        data: [
          { id: 's1', name: 'Novo' },
          { id: 's2', name: 'Qualificado' },
        ],
      })

    const out = await fetchProviderStages('leavo', { apiToken: 't' }, fakeFetch)
    expect(out).toEqual<ProviderStage[]>([
      { id: 's1', name: 'Novo' },
      { id: 's2', name: 'Qualificado' },
    ])
  })

  it('lanca erro claro quando apiToken ausente (sem vazar credencial)', async () => {
    await expect(
      fetchProviderStages('leavo', {}, async () => jsonResponse([])),
    ).rejects.toThrow(/apiToken/i)
  })
})
