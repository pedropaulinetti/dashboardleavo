'use client'

import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Granularity, TimeSeriesPoint } from '@/dashboard/queries'
import { fmtBRL0fromCents, fmtInt } from '@/dashboard/format'

const SERIES = [
  { key: 'leads', label: 'Leads', color: 'hsl(142 64% 40%)', axis: 'left' },
  { key: 'agendadas', label: 'Agendadas', color: 'hsl(199 89% 48%)', axis: 'left' },
  { key: 'realizadas', label: 'Realizadas', color: 'hsl(262 83% 58%)', axis: 'left' },
  { key: 'vendas', label: 'Fechados', color: 'hsl(var(--primary))', axis: 'left' },
  { key: 'spendCents', label: 'Investimento', color: 'hsl(38 92% 50%)', axis: 'right' },
] as const

const MONTHS_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

/** Parse de 'YYYY-MM-DD' em UTC, evitando o shift de fuso do `new Date(string)`. */
function parseUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

/** Formata o tick do eixo X conforme a granularidade. */
function fmtPeriod(iso: string, granularity: Granularity): string {
  const date = parseUTC(iso)
  if (granularity === 'year') {
    return String(date.getUTCFullYear())
  }
  if (granularity === 'month') {
    const yy = String(date.getUTCFullYear()).slice(-2)
    return `${MONTHS_PT[date.getUTCMonth()]}/${yy}`
  }
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

const COUNT_KEYS = new Set(['leads', 'agendadas', 'realizadas', 'vendas'])

export default function TrendChart({
  data,
  granularity,
}: {
  data: TimeSeriesPoint[]
  granularity: Granularity
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SERIES.map((s) => [s.key, true])),
  )

  function toggleSeries(key: string) {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 16,
        padding: '20px 22px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>
            Evolução no tempo
          </h3>
          <p style={{ fontSize: 13, margin: '3px 0 0', color: 'hsl(var(--muted-foreground))' }}>
            Etapas do funil e investimento em mídia, agrupados automaticamente pelo período
            selecionado.
          </p>
        </div>
      </div>

      <div
        role="group"
        aria-label="Séries visíveis"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {SERIES.map((s) => {
          const active = visible[s.key]
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleSeries(s.key)}
              aria-pressed={active}
              style={{
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                borderRadius: 999,
                padding: '5px 12px',
                border: active ? `1px solid ${s.color}` : '1px solid hsl(var(--border))',
                background: active ? 'hsl(var(--card))' : 'hsl(var(--muted) / .4)',
                color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                opacity: active ? 1 : 0.45,
                transition: 'opacity .15s, border-color .15s',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              {s.label}
            </button>
          )
        })}
      </div>

      {data.length === 0 ? (
        <div
          style={{
            height: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'hsl(var(--muted-foreground))',
            fontSize: 13,
          }}
        >
          Sem dados para o período selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="period"
              tickFormatter={(v: string) => fmtPeriod(v, granularity)}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v: number) => fmtBRL0fromCents(v)}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              stroke="hsl(var(--border))"
              width={80}
            />
            <Tooltip
              labelFormatter={(label) => fmtPeriod(String(label), granularity)}
              formatter={(value, name, item) => {
                const key = item?.dataKey
                const num = Number(value)
                if (key === 'spendCents') return [fmtBRL0fromCents(num), name]
                if (typeof key === 'string' && COUNT_KEYS.has(key)) {
                  return [fmtInt(num), name]
                }
                return [fmtInt(num), name]
              }}
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 10,
                fontSize: 13,
              }}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                yAxisId={s.axis}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                hide={!visible[s.key]}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
