'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth/config'
import { db } from '@/db'
import { getProvider } from '@/ingestion/providers'
import { connectIntegration, disconnectIntegration } from '@/ingestion/integrations'

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
