'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/auth/config'
import { db } from '@/db'
import { integrations } from '@/db/schema'
import { getProvider } from '@/ingestion/providers'
import {
  connectIntegration,
  disconnectIntegration,
  getDecryptedCredentials,
} from '@/ingestion/integrations'
import { fetchProviderStages, type ProviderStage } from '@/ingestion/catalog'
import { FUNNEL_STAGE_VALUES, type FunnelStage, type StageMapping } from '@/ingestion/mapping'

type FunnelProvider = 'leavo' | 'datacrazy'

function isFunnelProvider(provider: string): provider is FunnelProvider {
  return provider === 'leavo' || provider === 'datacrazy'
}

async function requireOwner() {
  const session = await auth()
  if (session?.user?.role !== 'owner') {
    throw new Error('Não autorizado: apenas o proprietário pode alterar integrações.')
  }
  const organizationId = session.user.organizationId
  if (!organizationId) {
    throw new Error('Não autorizado: organização não encontrada na sessão.')
  }
  return organizationId
}

export async function connectAction(provider: string, formData: FormData) {
  const organizationId = await requireOwner()

  const def = getProvider(provider)
  if (!def) {
    throw new Error(`Provedor desconhecido: '${provider}'`)
  }

  const credentials: Record<string, string> = {}
  for (const field of def.fields) {
    credentials[field.name] = String(formData.get(field.name) ?? '')
  }

  await connectIntegration(db, organizationId, provider, credentials)
  revalidatePath('/integracoes')
}

export async function disconnectAction(provider: string) {
  const organizationId = await requireOwner()
  await disconnectIntegration(db, organizationId, provider)
  revalidatePath('/integracoes')
}

// Lê o mapeamento já salvo do config da integração.
// datacrazy → config.stageMap; leavo → config.statusMap.
function readCurrentMapping(
  provider: FunnelProvider,
  config: Record<string, unknown> | null | undefined,
): StageMapping {
  if (!config) return {}
  const key = provider === 'datacrazy' ? 'stageMap' : 'statusMap'
  const raw = config[key]
  if (!raw || typeof raw !== 'object') return {}
  return raw as StageMapping
}

export type LoadStagesResult =
  | { ok: true; stages: ProviderStage[]; current: StageMapping }
  | { ok: false; error: string }

// Action que RETORNA dados (chamável via useActionState/useTransition no client).
// Owner-only. Puxa os estágios reais do CRM e o mapeamento atual já salvo.
export async function loadStagesAction(provider: string): Promise<LoadStagesResult> {
  try {
    const organizationId = await requireOwner()

    if (!isFunnelProvider(provider)) {
      return { ok: false, error: 'Mapeamento de etapas indisponível para esta integração.' }
    }

    const [row] = await db
      .select()
      .from(integrations)
      .where(
        and(eq(integrations.organizationId, organizationId), eq(integrations.provider, provider)),
      )

    if (!row || row.status !== 'connected') {
      return { ok: false, error: 'Integração não conectada. Conecte-a antes de mapear as etapas.' }
    }

    const credentials = getDecryptedCredentials(row)
    if (!credentials) {
      return { ok: false, error: 'Credenciais indisponíveis. Reconecte a integração e tente novamente.' }
    }

    const stages = await fetchProviderStages(provider, credentials)
    const current = readCurrentMapping(provider, row.config)
    return { ok: true, stages, current }
  } catch {
    // Nunca expor detalhes internos / credenciais ao client.
    return { ok: false, error: 'Não foi possível carregar os estágios do CRM. Tente novamente.' }
  }
}

const FUNNEL_SET = new Set<string>(FUNNEL_STAGE_VALUES)

function coerceFunnelValue(value: string): FunnelStage | 'ignore' {
  return FUNNEL_SET.has(value) ? (value as FunnelStage) : 'ignore'
}

export type SaveResult = { ok: boolean; error?: string }

// Salva o mapeamento (owner-only). Faz merge com o config existente.
// Assinatura no padrão do useActionState: (provider, prevState, formData).
// NÃO chama revalidatePath: a página não exibe o config (ele é relido sob
// demanda por loadStagesAction), e revalidar resetaria o componente client.
export async function saveMappingAction(
  provider: string,
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  try {
    const organizationId = await requireOwner()

    if (!isFunnelProvider(provider)) {
      return { ok: false, error: 'Mapeamento indisponível para esta integração.' }
    }

    const mapping: StageMapping = {}
    for (const [key, value] of formData.entries()) {
      if (typeof key === 'string' && key.startsWith('stage_')) {
        const stageId = key.slice('stage_'.length)
        if (stageId) mapping[stageId] = coerceFunnelValue(String(value))
      }
    }

    const [row] = await db
      .select()
      .from(integrations)
      .where(
        and(eq(integrations.organizationId, organizationId), eq(integrations.provider, provider)),
      )

    const existingConfig = (row?.config ?? {}) as Record<string, unknown>

    let nextConfig: Record<string, unknown>
    if (provider === 'datacrazy') {
      const valueUnitRaw = String(formData.get('valueUnit') ?? 'reais')
      const valueUnit = valueUnitRaw === 'cents' ? 'cents' : 'reais'
      const sourceFieldRaw = String(formData.get('sourceField') ?? '').trim()
      nextConfig = {
        ...existingConfig,
        stageMap: mapping,
        valueUnit,
        ...(sourceFieldRaw ? { sourceField: sourceFieldRaw } : {}),
      }
    } else {
      nextConfig = { ...existingConfig, statusMap: mapping }
    }

    await db
      .update(integrations)
      .set({ config: nextConfig })
      .where(
        and(eq(integrations.organizationId, organizationId), eq(integrations.provider, provider)),
      )

    return { ok: true }
  } catch {
    // Nunca expor detalhes internos / credenciais ao client.
    return { ok: false, error: 'Não foi possível salvar. Tente novamente.' }
  }
}
