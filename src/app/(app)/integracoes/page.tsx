import { headers } from 'next/headers'
import { auth } from '@/auth/config'
import { db } from '@/db'
import { listIntegrations, type IntegrationView } from '@/ingestion/integrations'
import IntegrationCard from './IntegrationCard'

export default async function IntegracoesPage() {
  const session = await auth()
  const orgId = session!.user.organizationId!

  const items = await listIntegrations(db, orgId)

  // Monta a origem a partir dos headers da request para a URL do webhook.
  // Cai para caminho relativo se host não estiver disponível.
  const h = await headers()
  const host = h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const origin = host ? `${proto}://${host}` : ''

  const webhookUrlFor = (token: string | null) =>
    token ? `${origin}/api/webhooks/${token}` : undefined

  // Agrupa por categoria preservando a ordem do catálogo.
  const categories: { cat: string; items: IntegrationView[] }[] = []
  for (const item of items) {
    let group = categories.find((g) => g.cat === item.category)
    if (!group) {
      group = { cat: item.category, items: [] }
      categories.push(group)
    }
    group.items.push(item)
  }

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1180,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
          Integrações
        </h2>
        <p
          style={{
            fontSize: 13,
            margin: '4px 0 0',
            maxWidth: 560,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          Conecte suas ferramentas para alimentar o funil. As credenciais (login e senha / tokens)
          são guardadas com criptografia e usadas só para sincronizar dados.
        </p>
      </div>

      {categories.map((group) => (
        <div key={group.cat}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'hsl(var(--muted-foreground))',
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            {group.cat}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: 16,
            }}
          >
            {group.items.map((item) => (
              <IntegrationCard
                key={item.id}
                item={item}
                webhookUrl={item.id === 'webhook' ? webhookUrlFor(item.webhookToken) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
