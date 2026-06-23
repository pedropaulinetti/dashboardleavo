import { datacrazyAdapter } from './adapters/datacrazy'
import { metaAdsAdapter } from './adapters/meta-ads'
import type { SourceAdapter } from './types'

// Adaptadores STUB (Plano 3). Retornam vazio e preservam o cursor recebido.
// O Plano 4 substitui por implementações reais que falam com cada provider.
function stubAdapter(provider: string): SourceAdapter {
  return {
    provider,
    async pull(ctx) {
      return { leads: [], stageEvents: [], adMetrics: [], nextCursor: ctx.cursor }
    },
  }
}

// Mapa de adaptadores de PULL. Webhook é push -> não tem adapter aqui.
const REGISTRY: Record<string, SourceAdapter> = {
  leavo: stubAdapter('leavo'),
  datacrazy: datacrazyAdapter,
  meta_ads: metaAdsAdapter,
}

export function getAdapter(provider: string): SourceAdapter | undefined {
  return REGISTRY[provider]
}

export { REGISTRY }
