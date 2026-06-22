// Busca os estagios/status REAIS de uma integracao conectada, para alimentar a
// tela de mapeamento (onde o usuario liga cada estagio dele a uma das 6 etapas do funil).
//
// - DataCrazy: junta os estagios de TODOS os pipelines (group = nome do pipeline).
// - Leavo: lista os status configuraveis do tenant.
//
// fetch e injetavel para testes sem rede. NUNCA loga/expoe credenciais.

import { fetchJson, type FetchLike } from '@/ingestion/http'

export type ProviderStage = { id: string; name: string; group?: string; index?: number }

const DATACRAZY_BASE = 'https://api.g1.datacrazy.io/api/v1'
const LEAVO_BASE = 'https://api.leavo.ai/backend'

type DataCrazyPipeline = { id: string; name: string; group?: string; stagesCount?: number }
type DataCrazyStage = { id: string; name: string; color?: string; index?: number }
type LeavoStatus = { id: string; name: string; color?: string; default?: boolean }

// Extrai uma credencial obrigatoria; lanca Error claro sem incluir o valor.
function requireCredential(credentials: Record<string, unknown>, key: string): string {
  const value = credentials[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`fetchProviderStages: credencial obrigatoria ausente: ${key}`)
  }
  return value
}

async function fetchDataCrazyStages(
  apiKey: string,
  fetchImpl?: FetchLike,
): Promise<ProviderStage[]> {
  const pipelinesRes = await fetchJson<{ data: DataCrazyPipeline[] }>(`${DATACRAZY_BASE}/pipelines`, {
    token: apiKey,
    fetchImpl,
  })
  const pipelines = pipelinesRes.data ?? []

  const out: ProviderStage[] = []
  for (const pipeline of pipelines) {
    const stagesRes = await fetchJson<{ count?: number; data: DataCrazyStage[] }>(
      `${DATACRAZY_BASE}/pipelines/${pipeline.id}/stages`,
      { token: apiKey, fetchImpl },
    )
    const stages = (stagesRes.data ?? [])
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    for (const stage of stages) {
      out.push({ id: stage.id, name: stage.name, group: pipeline.name, index: stage.index })
    }
  }
  return out
}

async function fetchLeavoStages(
  apiToken: string,
  fetchImpl?: FetchLike,
): Promise<ProviderStage[]> {
  const res = await fetchJson<LeavoStatus[] | { data: LeavoStatus[] }>(`${LEAVO_BASE}/status`, {
    token: apiToken,
    fetchImpl,
  })
  const list = Array.isArray(res) ? res : (res.data ?? [])
  return list.map((s) => ({ id: s.id, name: s.name }))
}

export async function fetchProviderStages(
  provider: 'leavo' | 'datacrazy',
  credentials: Record<string, unknown>,
  fetchImpl?: typeof fetch,
): Promise<ProviderStage[]> {
  const impl = fetchImpl as FetchLike | undefined
  switch (provider) {
    case 'datacrazy': {
      const apiKey = requireCredential(credentials, 'apiKey')
      return fetchDataCrazyStages(apiKey, impl)
    }
    case 'leavo': {
      const apiToken = requireCredential(credentials, 'apiToken')
      return fetchLeavoStages(apiToken, impl)
    }
    default: {
      const _exhaustive: never = provider
      throw new Error(`fetchProviderStages: provider nao suportado: ${String(_exhaustive)}`)
    }
  }
}
