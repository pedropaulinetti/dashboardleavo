import type { DashboardData } from '@/dashboard/queries'
import { fmtInt, pct } from '@/dashboard/format'
import { safeDiv } from '@/dashboard/math'

const STAGE_LABELS = ['Leads', 'MQL', 'Agendadas', 'Realizadas', 'Negociações', 'Vendas']

export default function Funnel({
  counts,
  convGeral,
  paths,
}: {
  counts: number[]
  convGeral: number | null
  paths: DashboardData['funnelPaths']
}) {
  return (
    <div
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 16,
        padding: '22px 24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h4 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Funil de conversão</h4>
          <p style={{ fontSize: 13, margin: '3px 0 0' }}>
            Volume por etapa e taxa de passagem entre cada estágio.
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'hsl(var(--muted)/.7)',
            border: '1px solid hsl(var(--border))',
            borderRadius: 9999,
            padding: '6px 14px',
          }}
        >
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>Conversão geral</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'hsl(var(--primary))' }}>
            {convGeral == null ? '—' : pct(convGeral)}
          </span>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6,1fr)',
          gap: 6,
          marginBottom: 6,
        }}
      >
        {STAGE_LABELS.map((label, i) => {
          const convLabel =
            i === 0
              ? 'Topo do funil'
              : `${pct(safeDiv(counts[i], counts[i - 1]) ?? 0)} da etapa anterior`
          return (
            <div key={label} style={{ padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 9999,
                    flexShrink: 0,
                    background: `hsl(var(--chart-${i + 1}))`,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: 'hsl(var(--muted-foreground))',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {label}
                </span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, letterSpacing: '-0.02em' }}>
                {fmtInt(counts[i])}
              </div>
              <div style={{ fontSize: 11.5, color: 'hsl(var(--muted-foreground))', marginTop: 1 }}>
                {convLabel}
              </div>
            </div>
          )
        })}
      </div>
      <svg
        viewBox="0 0 1200 256"
        preserveAspectRatio="none"
        style={{ width: '100%', height: 230, display: 'block', overflow: 'visible' }}
      >
        {paths.map((p) => (
          <path key={p.id} d={p.d} fill={p.fill} opacity={p.op} />
        ))}
      </svg>
    </div>
  )
}
