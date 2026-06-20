export type FunnelStage = 'leads' | 'mql' | 'agendadas' | 'realizadas' | 'negociacoes' | 'vendas'
export const FUNNEL_STAGE_VALUES: FunnelStage[] = ['leads', 'mql', 'agendadas', 'realizadas', 'negociacoes', 'vendas']

// chave = id (ou nome) do status/stage do cliente no CRM → etapa do nosso funil (ou 'ignore')
export type StageMapping = Record<string, FunnelStage | 'ignore'>
export type FieldMapping = { value?: string; utmSource?: string; utmCampaign?: string; channel?: string; lostReason?: string }

export type LeavoConfig = { statusMap: StageMapping; fields?: FieldMapping }
export type DataCrazyConfig = { stageMap: StageMapping; valueUnit: 'cents' | 'reais'; sourceField?: string; lossReasonMap?: Record<string, string> }
export type MetaConfig = { adAccountId: string }

// email em minúsculas; senão telefone só com dígitos; senão null
export function normalizeIdentity(email?: string | null, phone?: string | null): string | null {
  const e = (email ?? '').trim().toLowerCase()
  if (e) return e
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits || null
}

// aplica o mapeamento de etapa; retorna null quando 'ignore' ou ausente
export function mapStage(map: StageMapping, key: string | null | undefined): FunnelStage | null {
  if (!key) return null
  const v = map[key]
  return v && v !== 'ignore' ? v : null
}
