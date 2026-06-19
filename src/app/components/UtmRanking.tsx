import type { UtmRankItem } from '@/dashboard/queries'
import { fmtBRLfromCents, fmtInt, pct } from '@/dashboard/format'

const COLS = '1.7fr .7fr .7fr 1.1fr .8fr'

export default function UtmRanking({ rows }: { rows: UtmRankItem[] }) {
  const maxConv = Math.max(0, ...rows.map((r) => r.conv ?? 0))

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
        <h4 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Melhores origens</h4>
        <p style={{ fontSize: 13, margin: '3px 0 0' }}>
          Ranking de UTMs por volume e taxa de conversão em venda.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 8,
          padding: '0 4px 8px',
          fontSize: 11.5,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          color: 'hsl(var(--muted-foreground))',
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <div>Origem / campanha</div>
        <div style={{ textAlign: 'right' }}>Leads</div>
        <div style={{ textAlign: 'right' }}>Vendas</div>
        <div>Conversão</div>
        <div style={{ textAlign: 'right' }}>CPL</div>
      </div>
      {rows.map((u, i) => {
        const conv = u.conv ?? 0
        const convW = maxConv > 0 ? `${(conv / maxConv) * 100}%` : '0%'
        return (
          <div
            key={`${u.source ?? '—'}-${u.campaign ?? '—'}-${i}`}
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 8,
              alignItems: 'center',
              padding: '11px 4px',
              borderBottom: '1px solid hsl(var(--border)/.6)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {u.source ?? '—'}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'hsl(var(--muted-foreground))',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {u.campaign ?? '—'}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13.5 }}>{fmtInt(u.leads)}</div>
            <div style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 600 }}>{fmtInt(u.vendas)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 9999,
                  background: 'hsl(var(--muted))',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 9999,
                    background: 'hsl(var(--primary))',
                    width: convW,
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', width: 34 }}>
                {pct(conv)}
              </span>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              {u.cplCents == null ? 'Orgânico' : fmtBRLfromCents(u.cplCents)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
