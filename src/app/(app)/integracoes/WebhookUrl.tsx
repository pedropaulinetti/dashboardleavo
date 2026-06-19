'use client'

import { useState } from 'react'

export default function WebhookUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard indisponível — ignora */
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <code
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'hsl(var(--muted-foreground))',
          background: 'hsl(var(--muted) / .5)',
          border: '1px solid hsl(var(--border))',
          borderRadius: 8,
          padding: '7px 9px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={url}
      >
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        style={{
          background: 'none',
          border: '1px solid hsl(var(--border))',
          borderRadius: 9,
          padding: '7px 12px',
          fontFamily: 'inherit',
          fontSize: 12.5,
          cursor: 'pointer',
          color: 'hsl(var(--foreground))',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  )
}
