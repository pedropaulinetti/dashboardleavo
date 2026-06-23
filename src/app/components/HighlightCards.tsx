import type { Highlights } from '@/dashboard/queries'
import { fmtBRL0fromCents, fmtInt, pct } from '@/dashboard/format'

const GREEN = 'hsl(142 64% 40%)'
const RED = 'hsl(0 72% 51%)'
const MUTED = 'hsl(var(--muted-foreground))'

// Ícones SVG inline simples (lucide-like), 15px no card.
function ArrowUR() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  )
}

function ArrowDR() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m7 7 10 10" />
      <path d="M17 7v10H7" />
    </svg>
  )
}

function GlyphBanknote() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01" />
      <path d="M18 12h.01" />
    </svg>
  )
}

function GlyphBadgeCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function GlyphWallet() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  )
}

function GlyphTrendingUp() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </svg>
  )
}

function GlyphTag() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  )
}

function GlyphTarget() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function GlyphClock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function GlyphUserX() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m17 8 5 5" />
      <path d="m22 8-5 5" />
    </svg>
  )
}

// Formata a fração de delta como "+12,4%"; null -> "—" (sem seta).
function fmtDelta(d: number | null): string {
  if (d === null) return '—'
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1).replace('.', ',')}%`
}

// Cor do delta. Padrão "maior é melhor": >= 0 verde, < 0 vermelho. Quando
// `lowerIsBetter`, inverte (queda é boa -> verde). null -> muted (sem seta).
function deltaColor(d: number | null, lowerIsBetter = false): string {
  if (d === null) return MUTED
  const good = lowerIsBetter ? d <= 0 : d >= 0
  return good ? GREEN : RED
}

// Ciclo de vendas em dias (arredondado), com singular/plural. null -> "—".
function fmtDias(n: number | null): string {
  if (n === null) return '—'
  const r = Math.round(n)
  return `${r} ${r === 1 ? 'dia' : 'dias'}`
}

export default function HighlightCards({ data }: { data: Highlights }) {
  const cards = [
    {
      label: 'Receita gerada',
      value: fmtBRL0fromCents(data.receitaCents),
      delta: data.deltas.receita,
      icon: <GlyphBanknote />,
      iconBg: 'hsl(142 64% 40% / .12)',
      iconFg: GREEN,
    },
    {
      label: 'Vendas',
      value: fmtInt(data.vendas),
      delta: data.deltas.vendas,
      icon: <GlyphBadgeCheck />,
      iconBg: 'hsl(var(--primary)/.12)',
      iconFg: 'hsl(var(--primary))',
    },
    {
      label: 'Investimento',
      value: fmtBRL0fromCents(data.investCents),
      delta: data.deltas.invest,
      icon: <GlyphWallet />,
      iconBg: 'hsl(var(--muted))',
      iconFg: MUTED,
    },
    {
      label: 'ROAS',
      value: data.roas == null ? '—' : `${data.roas.toFixed(1).replace('.', ',')}x`,
      delta: data.deltas.roas,
      icon: <GlyphTrendingUp />,
      iconBg: 'hsl(var(--muted))',
      iconFg: MUTED,
    },
    {
      label: 'Ticket médio',
      value: data.ticketMedioCents == null ? '—' : fmtBRL0fromCents(data.ticketMedioCents),
      delta: data.deltas.ticketMedio,
      icon: <GlyphTag />,
      iconBg: 'hsl(142 64% 40% / .12)',
      iconFg: GREEN,
    },
    {
      label: 'CAC',
      value: data.cacCents == null ? '—' : fmtBRL0fromCents(data.cacCents),
      delta: data.deltas.cac,
      lowerIsBetter: true,
      icon: <GlyphTarget />,
      iconBg: 'hsl(var(--muted))',
      iconFg: MUTED,
    },
    {
      label: 'Ciclo de vendas',
      value: fmtDias(data.cicloVendasDias),
      delta: data.deltas.cicloVendas,
      lowerIsBetter: true,
      icon: <GlyphClock />,
      iconBg: 'hsl(var(--muted))',
      iconFg: MUTED,
    },
    {
      label: 'Taxa de no-show',
      value: data.noShowRate == null ? '—' : pct(data.noShowRate),
      delta: data.deltas.noShow,
      lowerIsBetter: true,
      icon: <GlyphUserX />,
      iconBg: 'hsl(0 72% 51% / .12)',
      iconFg: RED,
    },
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
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>{c.label}</span>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: c.iconBg,
                color: c.iconFg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
              }}
            >
              {c.icon}
            </span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, marginTop: 10, letterSpacing: '-0.02em' }}>
            {c.value}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 6,
              fontSize: 12.5,
              color: deltaColor(c.delta, c.lowerIsBetter ?? false),
            }}
          >
            {c.delta !== null && (
              <span style={{ fontSize: 14, display: 'inline-flex' }}>
                {c.delta >= 0 ? <ArrowUR /> : <ArrowDR />}
              </span>
            )}
            {fmtDelta(c.delta)}
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>vs. período anterior</span>
          </div>
        </div>
      ))}
    </div>
  )
}
