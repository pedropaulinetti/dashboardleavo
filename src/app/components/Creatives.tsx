import type { CreativeItem } from '@/dashboard/queries'
import { fmtBRL0fromCents, fmtInt } from '@/dashboard/format'

function platLabel(channel: string | null): string {
  if (channel === 'meta') return 'Meta'
  if (channel === 'google') return 'Google'
  if (!channel) return '—'
  return channel.charAt(0).toUpperCase() + channel.slice(1)
}

export default function Creatives({ items }: { items: CreativeItem[] }) {
  const maxRevenue = Math.max(0, ...items.map((c) => c.revenueCents))

  return (
    <div
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 16,
        padding: '20px 22px',
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h4 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Melhores criativos</h4>
        <p style={{ fontSize: 13, margin: '3px 0 0' }}>
          Anúncios ordenados pela receita gerada no período.
        </p>
      </div>
      {items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((c) => {
            const barW = maxRevenue > 0 ? `${(c.revenueCents / maxRevenue) * 100}%` : '0%'
            return (
              <div
                key={c.rank}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '26px 2.2fr 1.6fr auto',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: 'hsl(var(--muted))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  {c.rank}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {c.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '1px 8px',
                        borderRadius: 9999,
                        background: 'hsl(var(--muted))',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {platLabel(c.channel)}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))' }}>
                      {fmtInt(c.leadsCount ?? 0)} leads · {c.vendas} vendas
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 9999,
                    background: 'hsl(var(--muted))',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 9999,
                      width: barW,
                      background: 'linear-gradient(90deg,hsl(var(--chart-1)),hsl(var(--chart-6)))',
                    }}
                  />
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmtBRL0fromCents(c.revenueCents)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div
          style={{
            padding: 28,
            textAlign: 'center',
            fontSize: 13,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          Sem criativos pagos neste canal — origem orgânica.
        </div>
      )}
    </div>
  )
}
