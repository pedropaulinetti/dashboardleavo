import type { IntegrationView } from '@/ingestion/integrations'
import { connectAction, disconnectAction } from './actions'
import ConnectForm from './ConnectForm'
import StageMapping from './StageMapping'
import WebhookUrl from './WebhookUrl'

const keyIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="M21 2l-9.6 9.6M15.5 7.5l3 3" />
  </svg>
)

const zapIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

function DisconnectButton({ provider }: { provider: string }) {
  return (
    <form action={disconnectAction.bind(null, provider)} style={{ display: 'inline-flex' }}>
      <button
        type="submit"
        style={{
          background: 'none',
          border: '1px solid hsl(var(--border))',
          borderRadius: 9,
          padding: '7px 12px',
          fontFamily: 'inherit',
          fontSize: 12.5,
          cursor: 'pointer',
          color: 'hsl(var(--foreground))',
          whiteSpace: 'nowrap',
        }}
      >
        Desconectar
      </button>
    </form>
  )
}

export default function IntegrationCard({
  item,
  webhookUrl,
}: {
  item: IntegrationView
  webhookUrl?: string
}) {
  const connected = item.connected
  const isWebhook = item.id === 'webhook'

  return (
    <div
      style={{
        background: 'hsl(var(--card))',
        border: connected
          ? '1px solid hsl(var(--primary) / .35)'
          : '1px solid hsl(var(--border))',
        borderRadius: 16,
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 11,
            background: '#fff',
            border: '1px solid hsl(var(--border))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            padding: 8,
          }}
        >
          {item.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.logo}
              alt={item.name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'hsl(var(--primary))',
                lineHeight: 1,
              }}
            >
              {item.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{item.name}</div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 3,
              fontSize: 12,
              color: connected ? 'hsl(142 71% 38%)' : 'hsl(var(--muted-foreground))',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 9999,
                background: connected ? 'hsl(142 71% 45%)' : 'hsl(var(--muted-foreground))',
              }}
            />
            {connected ? 'Conectado' : 'Desconectado'}
          </div>
        </div>
      </div>

      <p
        style={{
          fontSize: 13,
          margin: '12px 0 0',
          lineHeight: 1.5,
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        {item.description}
      </p>

      {connected && isWebhook && (
        <div
          style={{
            marginTop: 14,
            borderTop: '1px solid hsl(var(--border))',
            paddingTop: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
          }}
        >
          {webhookUrl && <WebhookUrl url={webhookUrl} />}
          <div style={{ display: 'flex' }}>
            <DisconnectButton provider={item.id} />
          </div>
        </div>
      )}

      {connected && !isWebhook && (
        <div
          style={{
            marginTop: 14,
            borderTop: '1px solid hsl(var(--border))',
            paddingTop: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 15, display: 'inline-flex', color: 'hsl(var(--muted-foreground))' }}>
            {keyIcon}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ••••••••{item.tail ?? ''}
          </span>
          <DisconnectButton provider={item.id} />
        </div>
      )}

      {connected && (item.id === 'leavo' || item.id === 'datacrazy') && (
        <StageMapping provider={item.id} />
      )}

      {!connected && isWebhook && (
        <form action={connectAction.bind(null, 'webhook')}>
          <button
            type="submit"
            style={{
              marginTop: 14,
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: 'hsl(var(--card))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 10,
              padding: 10,
              fontFamily: 'inherit',
              fontSize: 13.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 15, display: 'inline-flex' }}>{zapIcon}</span> Conectar
          </button>
        </form>
      )}

      {!connected && !isWebhook && <ConnectForm provider={item.id} fields={item.fields} />}
    </div>
  )
}
