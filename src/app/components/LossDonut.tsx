import type { DonutArc } from '@/dashboard/donut'
import type { LossReasons } from '@/dashboard/queries'
import { fmtInt } from '@/dashboard/format'

// Paleta de cores distintas para as fatias do donut. A cor de cada motivo é
// definida pelo seu ÍNDICE em `loss.rows` (cíclica se houver mais motivos que
// cores), garantindo consistência entre o arco do SVG e a legenda.
const DONUT_PALETTE = [
  'hsl(359 99% 57%)',
  'hsl(24 94% 57%)',
  'hsl(38 92% 58%)',
  'hsl(199 89% 48%)',
  'hsl(142 64% 40%)',
  'hsl(262 83% 58%)',
  'hsl(330 81% 60%)',
  'hsl(48 96% 53%)',
  'hsl(173 80% 40%)',
  'hsl(215 16% 55%)',
]

function colorFor(index: number): string {
  return DONUT_PALETTE[index % DONUT_PALETTE.length]
}

export default function LossDonut({ loss, arcs }: { loss: LossReasons; arcs: DonutArc[] }) {
  return (
    <div
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 16,
        padding: '20px 22px',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <h4 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Motivos da perda</h4>
        <p style={{ fontSize: 13, margin: '3px 0 0' }}>Negociações que não viraram venda.</p>
      </div>

      {loss.total === 0 ? (
        <div
          style={{
            padding: 28,
            textAlign: 'center',
            fontSize: 13,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          Sem perdas registradas neste período.
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', width: 188, height: 188, margin: '6px auto 14px' }}>
            <svg
              viewBox="0 0 200 200"
              style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}
            >
              {loss.rows.map((r, i) => (
                <circle
                  key={r.reason}
                  cx={100}
                  cy={100}
                  r={64}
                  fill="none"
                  stroke={colorFor(i)}
                  strokeWidth={26}
                  strokeDasharray={arcs[i]?.dash}
                  strokeDashoffset={arcs[i]?.offset}
                />
              ))}
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>
                {fmtInt(loss.total)}
              </div>
              <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>perdidos</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {loss.rows.map((r, i) => (
              <div
                key={r.reason}
                style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    flexShrink: 0,
                    background: colorFor(i),
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.reason}
                </span>
                <span style={{ fontWeight: 600 }}>{fmtInt(r.count)}</span>
                <span
                  style={{ color: 'hsl(var(--muted-foreground))', width: 38, textAlign: 'right' }}
                >
                  {`${(r.pct * 100).toFixed(0)}%`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
