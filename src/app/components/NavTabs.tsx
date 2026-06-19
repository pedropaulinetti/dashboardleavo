'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const gridIcon = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const plugIcon = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5" />
  </svg>
)

const tabs = [
  { href: '/', label: 'Dashboard', icon: gridIcon },
  { href: '/integracoes', label: 'Integração', icon: plugIcon },
]

export default function NavTabs() {
  const pathname = usePathname()

  return (
    <nav style={{ display: 'flex', gap: 4 }}>
      {tabs.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.label}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            className="navtab"
            style={{
              backgroundColor: active ? 'hsl(var(--primary))' : 'transparent',
              color: active ? '#fff' : 'hsl(var(--muted-foreground))',
            }}
          >
            <span style={{ display: 'inline-flex' }}>{tab.icon}</span>
          </Link>
        )
      })}
    </nav>
  )
}
