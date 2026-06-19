'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import type { ProviderField } from '@/ingestion/providers'
import { connectAction } from './actions'

const lockIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const zapIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: 'hsl(var(--primary))',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '9px 15px',
        fontFamily: 'inherit',
        fontSize: 13.5,
        fontWeight: 500,
        cursor: pending ? 'default' : 'pointer',
        opacity: pending ? 0.7 : 1,
      }}
    >
      <span style={{ fontSize: 15, display: 'inline-flex' }}>{lockIcon}</span>
      {pending ? 'Salvando…' : 'Salvar conexão'}
    </button>
  )
}

export default function ConnectForm({
  provider,
  fields,
}: {
  provider: string
  fields: ProviderField[]
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 14,
          width: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: 'hsl(var(--card))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 10,
          padding: 10,
          fontFamily: 'inherit',
          fontSize: 13.5,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 15, display: 'inline-flex' }}>{zapIcon}</span> Conectar
      </button>
    )
  }

  return (
    <form
      action={connectAction.bind(null, provider)}
      style={{
        marginTop: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        borderTop: '1px dashed hsl(var(--border))',
        paddingTop: 14,
      }}
    >
      {fields.map((f) => (
        <div key={f.name}>
          <label
            htmlFor={`${provider}-${f.name}`}
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 5,
              color: 'hsl(var(--foreground))',
            }}
          >
            {f.label}
          </label>
          <input
            id={`${provider}-${f.name}`}
            name={f.name}
            type={f.type}
            required
            autoComplete="off"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              fontSize: 13.5,
              color: 'hsl(var(--foreground))',
              background: 'hsl(var(--muted) / .5)',
              border: '1px solid hsl(var(--input))',
              borderRadius: 9,
              padding: '9px 11px',
            }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 9, marginTop: 3 }}>
        <SaveButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 10,
            padding: '9px 15px',
            fontFamily: 'inherit',
            fontSize: 13.5,
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
