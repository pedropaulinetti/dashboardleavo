import { describe, it, expect } from 'vitest'
import { metaAdapter } from '@/ingestion/adapters/meta'
import type { FetchLike } from '@/ingestion/http'

// Insights por ad/dia. 1ª página: 2 linhas + paging.next; 2ª página: 1 linha, sem next.
const page1 = {
  data: [
    {
      spend: '10.50',
      impressions: '1000',
      clicks: '20',
      campaign_name: 'CP19 - ABRIL',
      ad_name: 'AD06',
      date_start: '2026-06-15',
      date_stop: '2026-06-15',
    },
    {
      spend: '0',
      impressions: '0',
      clicks: '0',
      campaign_name: 'CP19 - ABRIL',
      ad_name: 'AD07',
      date_start: '2026-06-15',
      date_stop: '2026-06-15',
    },
  ],
  paging: {
    next: 'https://graph.facebook.com/v21.0/act_123/insights?after=CURSOR2&access_token=TOKEN',
    cursors: { before: 'b', after: 'CURSOR2' },
  },
}

const page2 = {
  data: [
    {
      spend: '3.33',
      impressions: '500',
      clicks: '7',
      campaign_name: 'CP20 - MAIO',
      ad_name: 'AD08',
      date_start: '2026-06-16',
      date_stop: '2026-06-16',
    },
  ],
  paging: { cursors: { before: 'b2', after: 'CURSOR3' } },
}

// Captura as URLs chamadas e serve page1 -> page2 conforme presença de `after=CURSOR2`.
function makeFetch(urls: string[] = []): FetchLike {
  return async (url) => {
    urls.push(url)
    const body = url.includes('after=CURSOR2') ? page2 : page1
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

describe('metaAdapter', () => {
  it('provider é meta_ads', () => {
    expect(metaAdapter.provider).toBe('meta_ads')
  })

  it('lança erro claro quando falta credencial (sem vazar token)', async () => {
    await expect(
      metaAdapter.pull({
        credentials: { adAccountId: 'act_123' },
        cursor: null,
        fetchImpl: makeFetch(),
      }),
    ).rejects.toThrow(/accessToken|credencial/i)

    await expect(
      metaAdapter.pull({
        credentials: { accessToken: 'super-secret' },
        cursor: null,
        fetchImpl: makeFetch(),
      }),
    ).rejects.toThrow(/adAccountId|credencial/i)
  })

  it('pagina via paging.next e normaliza 3 adMetrics', async () => {
    const r = await metaAdapter.pull({
      credentials: { adAccountId: 'act_123', accessToken: 'tkn' },
      cursor: '2026-06-15',
      fetchImpl: makeFetch(),
    })

    // 2 da página 1 + 1 da página 2
    expect(r.adMetrics).toHaveLength(3)
    expect(r.leads).toEqual([])
    expect(r.stageEvents).toEqual([])

    const ad06 = r.adMetrics.find((m) => m.creative === 'AD06')!
    expect(ad06).toBeDefined()
    expect(ad06.spendCents).toBe(1050)
    expect(ad06.impressions).toBe(1000)
    expect(ad06.clicks).toBe(20)
    expect(ad06.campaign).toBe('CP19 - ABRIL')
    expect(ad06.channel).toBe('meta')
    expect(typeof ad06.impressions).toBe('number')
    expect(typeof ad06.clicks).toBe('number')
    expect(ad06.date.toISOString()).toBe('2026-06-15T00:00:00.000Z')
    expect(ad06.leads).toBe(0)
    expect(ad06.sales).toBe(0)
    expect(ad06.revenueCents).toBe(0)

    // linha de gasto 0
    const ad07 = r.adMetrics.find((m) => m.creative === 'AD07')!
    expect(ad07.spendCents).toBe(0)
    expect(ad07.impressions).toBe(0)

    // linha da 2ª página
    const ad08 = r.adMetrics.find((m) => m.creative === 'AD08')!
    expect(ad08.spendCents).toBe(333)
    expect(ad08.date.toISOString()).toBe('2026-06-16T00:00:00.000Z')
  })

  it('normaliza adAccountId sem prefixo act_ na URL de insights', async () => {
    const urls: string[] = []
    await metaAdapter.pull({
      credentials: { adAccountId: '123', accessToken: 'tkn' },
      cursor: null,
      fetchImpl: makeFetch(urls),
    })
    expect(urls[0]).toContain('/act_123/insights')
    expect(urls[0]).not.toContain('/123/insights')
  })

  it('nextCursor é a data de hoje (UTC, YYYY-MM-DD)', async () => {
    const r = await metaAdapter.pull({
      credentials: { adAccountId: 'act_123', accessToken: 'tkn' },
      cursor: null,
      fetchImpl: makeFetch(),
    })
    const today = new Date().toISOString().slice(0, 10)
    expect(r.nextCursor).toBe(today)
  })

  it('monta a URL inicial com level=ad, time_increment=1, fields, time_range e access_token', async () => {
    const urls: string[] = []
    await metaAdapter.pull({
      credentials: { adAccountId: 'act_123', accessToken: 'tkn' },
      cursor: '2026-06-10',
      fetchImpl: makeFetch(urls),
    })
    const u = new URL(urls[0])
    expect(u.searchParams.get('level')).toBe('ad')
    expect(u.searchParams.get('time_increment')).toBe('1')
    expect(u.searchParams.get('limit')).toBe('500')
    expect(u.searchParams.get('access_token')).toBe('tkn')
    const fields = u.searchParams.get('fields') ?? ''
    expect(fields).toContain('spend')
    expect(fields).toContain('impressions')
    expect(fields).toContain('clicks')
    expect(fields).toContain('campaign_name')
    expect(fields).toContain('ad_name')
    const range = JSON.parse(u.searchParams.get('time_range') ?? '{}')
    expect(range.since).toBe('2026-06-10')
    expect(range.until).toBe(new Date().toISOString().slice(0, 10))
  })
})
