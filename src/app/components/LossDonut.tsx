import type { DonutArc } from '@/dashboard/donut'
import type { LossReasons } from '@/dashboard/queries'
import { fmtInt } from '@/dashboard/format'
import { LOSS_REASONS } from '@/dashboard/loss-reasons'

const REASON_COLOR = new Map<string, string>(LOSS_REASONS.map((l) => [l.reason, l.color]))
const FALLBACK_COLOR = 'hsl(var(--muted-foreground))'

function colorFor(reason: string): string {
  return REASON_COLOR.get(reason) ?? FALLBACK_COLOR
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
                  stroke={colorFor(r.reason)}
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
            {loss.rows.map((r) => (
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
                    background: colorFor(r.reason),
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
