'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Granularity, TimeSeriesPoint } from '@/dashboard/queries'
import { fmtBRL0fromCents, fmtInt } from '@/dashboard/format'

const GRAN_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
]

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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function selectGran(value: Granularity) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'month') {
      params.delete('gran')
    } else {
      params.set('gran', value)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
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
            Etapas do funil e investimento em mídia ao longo do período.
          </p>
        </div>

        <div
          role="group"
          aria-label="Granularidade"
          style={{
            display: 'inline-flex',
            border: '1px solid hsl(var(--border))',
            borderRadius: 10,
            padding: 3,
            gap: 3,
            background: 'hsl(var(--muted) / .4)',
          }}
        >
          {GRAN_OPTIONS.map((o) => {
            const active = granularity === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => selectGran(o.value)}
                aria-pressed={active}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: 'none',
                  borderRadius: 7,
                  padding: '6px 14px',
                  background: active ? 'hsl(var(--card))' : 'transparent',
                  color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                  boxShadow: active ? '0 1px 2px hsl(0 0% 0% / .12)' : 'none',
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
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
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="leads"
              name="Leads"
              stroke="hsl(142 64% 40%)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="agendadas"
              name="Agendadas"
              stroke="hsl(199 89% 48%)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="realizadas"
              name="Realizadas"
              stroke="hsl(262 83% 58%)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="vendas"
              name="Fechados"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="spendCents"
              name="Investimento"
              stroke="hsl(38 92% 50%)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
