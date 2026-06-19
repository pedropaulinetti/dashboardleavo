export type ProviderField = { label: string; name: string; type: 'text' | 'password' }
export type ProviderDef = {
  id: 'leavo' | 'datacrazy' | 'meta_ads' | 'webhook'
  name: string
  category: string
  kind: 'pull' | 'push'
  description: string
  logo: string // caminho em /public ou '' para fallback
  fields: ProviderField[]
}

export const PROVIDERS: ProviderDef[] = [
  { id: 'leavo', name: 'Leavo', category: 'Fontes de dados', kind: 'pull',
    description: 'Importa leads e a movimentação pelas etapas do funil da Leavo.',
    logo: '/leavo/icon-red.svg',
    fields: [{ label: 'API Token', name: 'apiToken', type: 'password' }] },
  { id: 'datacrazy', name: 'DataCrazy', category: 'Fontes de dados', kind: 'pull',
    description: 'Traz receita das vendas e atribuição (origem/UTM) do DataCrazy.',
    logo: '',
    fields: [{ label: 'API Key', name: 'apiKey', type: 'password' }] },
  { id: 'meta_ads', name: 'Meta Ads', category: 'Anúncios', kind: 'pull',
    description: 'Importa gasto, impressões, cliques e criativos das campanhas do Meta Ads.',
    logo: '/leavo/logos/meta.svg',
    fields: [
      { label: 'ID da conta de anúncios', name: 'adAccountId', type: 'text' },
      { label: 'Token de acesso', name: 'accessToken', type: 'password' },
    ] },
  { id: 'webhook', name: 'Webhook', category: 'Webhooks', kind: 'push',
    description: 'Receba dados de qualquer ferramenta via uma URL de webhook exclusiva.',
    logo: '',
    fields: [] },
]

export const PROVIDER_IDS = PROVIDERS.map(p => p.id)
export function getProvider(id: string): ProviderDef | undefined { return PROVIDERS.find(p => p.id === id) }
