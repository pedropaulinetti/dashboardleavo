import type { CostCards as CostCardsData } from '@/dashboard/queries'
import { fmtBRLfromCents } from '@/dashboard/format'

const GREEN = 'hsl(142 64% 40%)'
const RED = 'hsl(0 72% 51%)'
const MUTED = 'hsl(var(--muted-foreground))'

function ArrowUR() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  )
}

function ArrowDR() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m7 7 10 10" />
      <path d="M17 7v10H7" />
    </svg>
  )
}

function fmtDelta(d: number | null): string {
  if (d === null) return '—'
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1).replace('.', ',')}%`
}

// "Menor é melhor": <= 0 verde, > 0 vermelho. null -> muted (sem seta).
function deltaColor(d: number | null): string {
  if (d === null) return MUTED
  return d <= 0 ? GREEN : RED
}

export default function CostCards({ data }: { data: CostCardsData }) {
  const cards = [
    { label: 'CPL — Custo por Lead', value: data.cplCents, delta: data.deltas.cpl },
    { label: 'Custo por MQL', value: data.cpmqlCents, delta: data.deltas.cpmql },
    { label: 'CPM', value: data.cpmCents, delta: data.deltas.cpm },
    { label: 'CPC', value: data.cpcCents, delta: data.deltas.cpc },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 16,
            padding: '16px 18px',
          }}
        >
          <div style={{ fontSize: 12.5, color: 'hsl(var(--muted-foreground))' }}>{c.label}</div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 8, letterSpacing: '-0.02em' }}>
            {c.value == null ? '—' : fmtBRLfromCents(c.value)}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 5,
              fontSize: 12,
              color: deltaColor(c.delta),
            }}
          >
            {c.delta !== null && (
              <span style={{ fontSize: 13, display: 'inline-flex' }}>
                {c.delta <= 0 ? <ArrowDR /> : <ArrowUR />}
              </span>
            )}
            {fmtDelta(c.delta)}
          </div>
        </div>
      ))}
    </div>
  )
}
