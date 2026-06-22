import PeriodFilter from '../components/PeriodFilter'
import ChannelFilter from '../components/ChannelFilter'
import HighlightCards from '../components/HighlightCards'
import CostCards from '../components/CostCards'
import Funnel from '../components/Funnel'
import UtmRanking from '../components/UtmRanking'
import LossDonut from '../components/LossDonut'
import Creatives from '../components/Creatives'
import { auth } from '@/auth/config'
import { db } from '@/db'
import { getDashboardData } from '@/dashboard/queries'

type Period = 'all' | '7d' | '30d' | '90d' | '12m' | 'custom'
type Channel = 'all' | 'meta' | 'google' | 'whats' | 'indica'

const PERIODS: Period[] = ['all', '7d', '30d', '90d', '12m', 'custom']
const CHANNELS: Channel[] = ['all', 'meta', 'google', 'whats', 'indica']

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
  const period: Period = PERIODS.includes(rawPeriod as Period) ? (rawPeriod as Period) : 'all'

  const rawChannel = one(sp.channel)
  const channel: Channel = CHANNELS.includes(rawChannel as Channel)
    ? (rawChannel as Channel)
    : 'all'

  const from = one(sp.from)
  const to = one(sp.to)

  const session = await auth()
  const orgId = session!.user.organizationId!

  const data = await getDashboardData(
    db,
    orgId,
    { period, channel, from, to },
    new Date(),
  )

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

      <HighlightCards data={data.highlights} />
      <CostCards data={data.costCards} />
      <Funnel
        counts={data.funnel.counts}
        convGeral={data.funnel.convGeral}
        paths={data.funnelPaths}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.55fr 1fr',
          gap: 20,
          alignItems: 'start',
        }}
      >
        <UtmRanking rows={data.utm} />
        <LossDonut loss={data.loss} arcs={data.donutArcs} />
      </div>
      <Creatives items={data.creatives} />
    </div>
  )
}
