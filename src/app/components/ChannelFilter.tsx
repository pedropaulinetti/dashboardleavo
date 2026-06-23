'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Channel = 'all' | 'meta' | 'google' | 'whats' | 'indica'

const spinnerIcon = (
  <svg className="spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

const filterIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </svg>
)

const chevronDownIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const checkIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const channels: { value: Channel; label: string }[] = [
  { value: 'all', label: 'Todos os canais' },
  { value: 'meta', label: 'Meta Ads' },
  { value: 'google', label: 'Google Ads' },
  { value: 'whats', label: 'WhatsApp Orgânico' },
  { value: 'indica', label: 'Indicação' },
]

export default function ChannelFilter({ channel = 'all' }: { channel?: Channel }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Canal otimista: marca a escolha imediatamente. Só vale enquanto a navegação
  // está pendente; ao terminar, volta a refletir a prop (estado real da URL).
  const [optimistic, setOptimistic] = useState<Channel | null>(null)
  const shownChannel = isPending && optimistic ? optimistic : channel
  const currentLabel = channels.find((c) => c.value === shownChannel)?.label ?? 'Todos os canais'

  function selectChannel(value: Channel) {
    setOptimistic(value)
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('channel')
    } else {
      params.set('channel', value)
    }
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname)
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
        aria-busy={isPending}
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
          cursor: isPending ? 'progress' : 'pointer',
        }}
      >
        <span style={{ fontSize: 15, display: 'inline-flex', color: 'hsl(var(--muted-foreground))' }}>
          {isPending ? spinnerIcon : filterIcon}
        </span>
        {currentLabel}
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
              minWidth: 196,
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 12,
              padding: 5,
              boxShadow: '0 12px 32px -12px hsl(0 0% 0% / .3)',
            }}
          >
            {channels.map((o) => {
              const active = shownChannel === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => selectChannel(o.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    width: '100%',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    textAlign: 'left',
                    background: active ? 'hsl(var(--muted))' : 'transparent',
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  {o.label}
                  {active && (
                    <span style={{ fontSize: 15, display: 'inline-flex', color: 'hsl(var(--primary))' }}>
                      {checkIcon}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
