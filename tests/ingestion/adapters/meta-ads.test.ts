import { describe, it, expect } from 'vitest'
import { metaAdsAdapter } from '@/ingestion/adapters/meta-ads'
import type { FetchLike } from '@/ingestion/http'
import type { PullContext } from '@/ingestion/types'

// `now` é injetável no adapter (lido via cast interno) mas não faz parte do
// PullContext público; este helper monta o ctx com `now` sem brigar com o tipo.
type MetaPullArgs = PullContext & { now?: Date }
const pull = (args: MetaPullArgs) => metaAdsAdapter.pull(args as PullContext)

// `now` fixo p/ tornar a janela (since/until) e o teste determinísticos.
const NOW = new Date('2026-06-18T12:00:00.000Z')

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
function makeFetch(urls: string[] = [], body1: unknown = page1, body2: unknown = page2): FetchLike {
  return async (url) => {
    urls.push(url)
    const body = url.includes('after=CURSOR2') ? body2 : body1
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

describe('metaAdsAdapter', () => {
  it('provider é meta_ads', () => {
    expect(metaAdsAdapter.provider).toBe('meta_ads')
  })

  it('lança erro claro quando falta credencial (sem vazar token)', async () => {
    await expect(
      metaAdsAdapter.pull({
        credentials: { adAccountId: 'act_123' },
        cursor: null,
        fetchImpl: makeFetch(),
        now: NOW,
      }),
    ).rejects.toThrow(/accessToken|credencial/i)

    await expect(
      metaAdsAdapter.pull({
        credentials: { accessToken: 'super-secret' },
        cursor: null,
        fetchImpl: makeFetch(),
        now: NOW,
      }),
    ).rejects.toThrow(/adAccountId|credencial/i)
  })

  it('pagina via paging.next e normaliza 3 adMetrics', async () => {
    const r = await metaAdsAdapter.pull({
      credentials: { adAccountId: 'act_123', accessToken: 'tkn' },
      cursor: '2026-06-15',
      fetchImpl: makeFetch(),
      now: NOW,
    })

    // 2 da página 1 + 1 da página 2 (chaves distintas, sem agregação)
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

    // nextCursor = maior date_start visto
    expect(r.nextCursor).toBe('2026-06-16')
  })

  it('agrega linhas com a MESMA (date, campaign, ad_name) num único adMetric somando spend/impressions/clicks', async () => {
    // Duas linhas idênticas em (date, campaign, ad_name): devem virar 1 só, somadas.
    const aggPage = {
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
          spend: '5.25',
          impressions: '300',
          clicks: '5',
          campaign_name: 'CP19 - ABRIL',
          ad_name: 'AD06',
          date_start: '2026-06-15',
          date_stop: '2026-06-15',
        },
      ],
      paging: { cursors: { after: 'X' } },
    }

    const r = await metaAdsAdapter.pull({
      credentials: { adAccountId: 'act_123', accessToken: 'tkn' },
      cursor: null,
      // sem paging.next -> uma página só (aggPage serve sempre)
      fetchImpl: makeFetch([], aggPage, aggPage),
      now: NOW,
    })

    expect(r.adMetrics).toHaveLength(1)
    const m = r.adMetrics[0]
    expect(m.creative).toBe('AD06')
    expect(m.campaign).toBe('CP19 - ABRIL')
    expect(m.date.toISOString()).toBe('2026-06-15T00:00:00.000Z')
    expect(m.spendCents).toBe(1575) // 1050 + 525
    expect(m.impressions).toBe(1300) // 1000 + 300
    expect(m.clicks).toBe(25) // 20 + 5
  })

  it('usa act_<id> na URL quando adAccountId vem sem o prefixo act_', async () => {
    const urls: string[] = []
    await metaAdsAdapter.pull({
      credentials: { adAccountId: '123', accessToken: 'tkn' },
      cursor: null,
      fetchImpl: makeFetch(urls),
      now: NOW,
    })
    expect(urls[0]).toContain('/act_123/insights')
    expect(urls[0]).not.toContain('/123/insights')
  })
})
