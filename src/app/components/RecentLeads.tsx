import type { RecentLeadItem } from '@/dashboard/queries'
import { fmtBRL0fromCents } from '@/dashboard/format'

const COLS = '1.6fr 1.6fr 1.1fr 1fr .9fr .7fr'

const STAGE_LABEL: Record<string, string> = {
  leads: 'Leads',
  mql: 'MQL',
  agendadas: 'Agendadas',
  realizadas: 'Realizadas',
  negociacoes: 'Negociações',
  vendas: 'Vendas',
}

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage
}

// Data UTC -> 'dd/mm/aa'.
function fmtDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yy = String(d.getUTCFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

const ellipsis = {
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
}

// Cor de alerta (mesma usada em HighlightCards para deltas negativos).
const ALERT = 'hsl(0 72% 51%)'

function StagePill({ stage, lost }: { stage: string; lost: boolean }) {
  const label = lost ? 'Perdido' : stageLabel(stage)
  const bg = lost ? 'hsl(0 72% 51% / .12)' : 'hsl(var(--muted))'
  const color = lost ? ALERT : 'hsl(var(--muted-foreground))'
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 9px',
        borderRadius: 9999,
        background: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

export default function RecentLeads({ items }: { items: RecentLeadItem[] }) {
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
        <h4 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Últimos leads</h4>
        <p style={{ fontSize: 13, margin: '3px 0 0' }}>Os leads mais recentes do período.</p>
      </div>
      {items.length > 0 ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 10,
              padding: '0 4px 8px',
              fontSize: 11.5,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              color: 'hsl(var(--muted-foreground))',
              borderBottom: '1px solid hsl(var(--border))',
            }}
          >
            <div>Nome</div>
            <div>Contato</div>
            <div>Origem</div>
            <div>Etapa</div>
            <div style={{ textAlign: 'right' }}>Valor</div>
            <div style={{ textAlign: 'right' }}>Data</div>
          </div>
          {items.map((it, i) => {
            const lost = it.lostReason != null
            const origem = it.utmSource ?? it.channel ?? '—'
            return (
              <div
                key={`${it.contact ?? '—'}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: COLS,
                  gap: 10,
                  alignItems: 'center',
                  padding: '11px 4px',
                  borderBottom: '1px solid hsl(var(--border)/.6)',
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0, ...ellipsis }}>
                  {it.name ?? '—'}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    fontFamily: 'var(--font-mono)',
                    color: 'hsl(var(--muted-foreground))',
                    minWidth: 0,
                    ...ellipsis,
                  }}
                >
                  {it.contact ?? '—'}
                </div>
                <div
                  style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', minWidth: 0, ...ellipsis }}
                >
                  {origem}
                </div>
                <div style={{ minWidth: 0 }}>
                  <StagePill stage={it.currentStage} lost={lost} />
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    fontSize: 13.5,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.valueCents > 0 ? fmtBRL0fromCents(it.valueCents) : '—'}
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    fontSize: 13,
                    color: 'hsl(var(--muted-foreground))',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmtDate(it.createdAt)}
                </div>
              </div>
            )
          })}
        </>
      ) : (
        <div
          style={{
            padding: 28,
            textAlign: 'center',
            fontSize: 13,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          Nenhum lead no período.
        </div>
      )}
    </div>
  )
}
