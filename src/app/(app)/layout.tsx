import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { auth } from '@/auth/config'
import NavTabs from '../components/NavTabs'
import ThemeToggle from '../components/ThemeToggle'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const cookieStore = await cookies()
  const isDark = cookieStore.get('theme')?.value === 'dark'
  const themeClass = isDark ? 'theme-dark' : ''

  const role = (session.user.role ?? '').toUpperCase()

  return (
    <div
      className={themeClass}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100%',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
        letterSpacing: '-0.011em',
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <header
        style={{
          height: 62,
          flexShrink: 0,
          borderBottom: '1px solid hsl(var(--border))',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 22px',
          background: 'hsl(var(--background))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'hsl(var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Image src="/leavo/icon-white.svg" alt="Leavo" width={21} height={21} />
          </div>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Leavo</div>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: '.08em',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              {role}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <NavTabs />

        <ThemeToggle isDark={isDark} />
      </header>

      <main
        className="leavo-scroll"
        style={{ flex: 1, overflow: 'auto', background: 'hsl(var(--muted) / .45)' }}
      >
        {children}
      </main>
    </div>
  )
}
