'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Period = 'all' | '7d' | '30d' | '90d' | '12m' | 'custom'

const calendarIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)

const chevronDownIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const checkIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const presets: { value: Exclude<Period, 'custom'>; label: string }[] = [
  { value: 'all', label: 'Todos os períodos' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: '12m', label: 'Últimos 12 meses' },
]

function formatBr(iso?: string): string {
  if (!iso) return 'dd/mm/aaaa'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return 'dd/mm/aaaa'
  return `${d}/${m}/${y}`
}

function periodLabel(period: Period, from?: string, to?: string): string {
  if (period === 'custom') {
    return `${formatBr(from)} – ${formatBr(to)}`
  }
  return presets.find((p) => p.value === period)?.label ?? 'Todos os períodos'
}

export default function PeriodFilter({
  period = 'all',
  from,
  to,
}: {
  period?: Period
  from?: string
  to?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState(false)
  const [fromDate, setFromDate] = useState(from ?? '')
  const [toDate, setToDate] = useState(to ?? '')

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  function selectPreset(value: Exclude<Period, 'custom'>) {
    pushParams((params) => {
      params.set('period', value)
      params.delete('from')
      params.delete('to')
    })
    setOpen(false)
  }

  function applyCustom() {
    pushParams((params) => {
      params.set('period', 'custom')
      params.set('from', fromDate)
      params.set('to', toDate)
    })
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          color: 'hsl(var(--foreground))',
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 10,
          padding: '9px 12px',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 15, display: 'inline-flex', color: 'hsl(var(--muted-foreground))' }}>
          {calendarIcon}
        </span>
        {periodLabel(period, from, to)}
        <span style={{ fontSize: 15, display: 'inline-flex', color: 'hsl(var(--muted-foreground))' }}>
          {chevronDownIcon}
        </span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              zIndex: 50,
              width: 288,
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 12,
              padding: 12,
              boxShadow: '0 12px 32px -12px hsl(0 0% 0% / .3)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'hsl(var(--muted-foreground))',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Atalhos
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6 }}>
              {presets.map((o) => {
                const active = period === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => selectPreset(o.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      border: '1px solid hsl(var(--border))',
                      cursor: 'pointer',
                      borderRadius: 9,
                      padding: '8px 10px',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      textAlign: 'left',
                      backgroundColor: active ? 'hsl(var(--muted))' : 'hsl(var(--card))',
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    {o.label}
                    {active && (
                      <span style={{ fontSize: 14, display: 'inline-flex', color: 'hsl(var(--primary))' }}>
                        {checkIcon}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div style={{ height: 1, background: 'hsl(var(--border))', margin: '13px 0' }} />

            <div
              style={{
                fontSize: 11,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'hsl(var(--muted-foreground))',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Período personalizado
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, display: 'block', fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                De
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  max={toDate || undefined}
                  style={{
                    marginTop: 4,
                    width: '100%',
                    fontFamily: 'inherit',
                    fontSize: 12.5,
                    color: 'hsl(var(--foreground))',
                    background: 'hsl(var(--muted) / .5)',
                    border: '1px solid hsl(var(--input))',
                    borderRadius: 8,
                    padding: '7px 8px',
                  }}
                />
              </label>
              <label style={{ flex: 1, display: 'block', fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                Até
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  min={fromDate || undefined}
                  style={{
                    marginTop: 4,
                    width: '100%',
                    fontFamily: 'inherit',
                    fontSize: 12.5,
                    color: 'hsl(var(--foreground))',
                    background: 'hsl(var(--muted) / .5)',
                    border: '1px solid hsl(var(--input))',
                    borderRadius: 8,
                    padding: '7px 8px',
                  }}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={applyCustom}
              style={{
                marginTop: 11,
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                background: 'hsl(var(--primary))',
                color: '#fff',
                border: 'none',
                borderRadius: 9,
                padding: 9,
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 15, display: 'inline-flex' }}>{calendarIcon}</span>
              Aplicar período
            </button>
          </div>
        </>
      )}
    </div>
  )
}
