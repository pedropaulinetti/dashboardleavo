import { Suspense } from 'react'
import PeriodFilter from '../components/PeriodFilter'
import ChannelFilter from '../components/ChannelFilter'
import DashboardContent from '../components/DashboardContent'
import DashboardSkeleton from '../components/DashboardSkeleton'

type Period = 'all' | 'month' | '7d' | '30d' | '90d' | '12m' | 'custom'
type Channel = 'all' | 'meta' | 'google' | 'whats' | 'indica'
type Granularity = 'day' | 'month' | 'year'

const PERIODS: Period[] = ['all', 'month', '7d', '30d', '90d', '12m', 'custom']
const CHANNELS: Channel[] = ['all', 'meta', 'google', 'whats', 'indica']
const GRANULARITIES: Granularity[] = ['day', 'month', 'year']

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  const rawPeriod = one(sp.period)
  const period: Period = PERIODS.includes(rawPeriod as Period) ? (rawPeriod as Period) : 'month'

  const rawChannel = one(sp.channel)
  const channel: Channel = CHANNELS.includes(rawChannel as Channel)
    ? (rawChannel as Channel)
    : 'all'

  const from = one(sp.from)
  const to = one(sp.to)

  const rawGran = one(sp.gran)
  const granularity: Granularity = GRANULARITIES.includes(rawGran as Granularity)
    ? (rawGran as Granularity)
    : 'month'

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 1340,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
            Funil de Vendas
          </h2>
          <p style={{ fontSize: 13, margin: '3px 0 0', color: 'hsl(var(--muted-foreground))' }}>
            Acompanhe origem, custo e conversão de ponta a ponta.
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <PeriodFilter period={period} from={from} to={to} />
        <ChannelFilter channel={channel} />
      </div>

      <Suspense
        key={`${period}|${channel}|${from ?? ''}|${to ?? ''}|${granularity}`}
        fallback={<DashboardSkeleton />}
      >
        <DashboardContent
          period={period}
          channel={channel}
          from={from}
          to={to}
          granularity={granularity}
        />
      </Suspense>
    </div>
  )
}
