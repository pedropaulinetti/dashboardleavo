'use client'
import { signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isDark, setIsDark] = useState(false)

  // O login não tem o wrapper do shell do app, então detectamos o tema aqui:
  // primeiro o cookie `theme` (definido pelo ThemeToggle), com fallback para
  // a preferência do sistema.
  useEffect(() => {
    const cookieTheme = document.cookie
      .split('; ')
      .find((c) => c.startsWith('theme='))
      ?.split('=')[1]

    if (cookieTheme === 'dark') {
      setIsDark(true)
    } else if (cookieTheme === 'light') {
      setIsDark(false)
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true)
    }
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res?.error) {
        setError('Email ou senha inválidos')
        return
      }
      window.location.href = '/'
    } finally {
      setLoading(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: 'hsl(var(--foreground))',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    letterSpacing: 'inherit',
    color: 'hsl(var(--foreground))',
    background: 'hsl(var(--muted) / .5)',
    border: '1px solid hsl(var(--input))',
    borderRadius: 10,
    outline: 'none',
    transition: 'border-color .15s ease, box-shadow .15s ease',
  }

  return (
    <main
      className={isDark ? 'theme-dark' : undefined}
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        fontFamily: 'var(--font-sans)',
        letterSpacing: '-0.011em',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 16,
          padding: '36px 32px',
          boxShadow: '0 12px 32px -12px hsl(0 0% 0% / .25)',
          display: 'grid',
          gap: 22,
        }}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'hsl(var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image src="/leavo/icon-white.svg" alt="Leavo" width={25} height={25} />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              Entrar
            </h1>
            <p
              style={{
                fontSize: 14,
                margin: 0,
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              Acesse seu painel de funil
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 7 }}>
            <label htmlFor="email" style={labelStyle}>
              Email
            </label>
            <input
              id="email"
              name="email"
              placeholder="voce@empresa.com"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'hsl(var(--primary))'
                e.currentTarget.style.boxShadow = '0 0 0 3px hsl(var(--primary) / .12)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'hsl(var(--input))'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          <div style={{ display: 'grid', gap: 7 }}>
            <label htmlFor="password" style={labelStyle}>
              Senha
            </label>
            <input
              id="password"
              name="password"
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'hsl(var(--primary))'
                e.currentTarget.style.boxShadow = '0 0 0 3px hsl(var(--primary) / .12)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'hsl(var(--input))'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: 13,
              color: 'hsl(var(--primary))',
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '11px 16px',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            letterSpacing: 'inherit',
            color: 'hsl(var(--primary-foreground))',
            background: 'hsl(var(--primary))',
            border: 'none',
            borderRadius: 10,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'opacity .15s ease, filter .15s ease',
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.filter = 'brightness(0.94)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none'
          }}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
