import HighlightCards from './HighlightCards'
import CostCards from './CostCards'
import Funnel from './Funnel'
import TrendChart from './TrendChart'
import UtmRanking from './UtmRanking'
import LossDonut from './LossDonut'
import Creatives from './Creatives'
import RecentLeads from './RecentLeads'
import { auth } from '@/auth/config'
import { db } from '@/db'
import { getDashboardData, getTimeSeries } from '@/dashboard/queries'
import { resolveRange, granularityForRange } from '@/dashboard/range'

type Period = 'all' | 'month' | '7d' | '30d' | '90d' | '12m' | 'custom'
type Channel = 'all' | 'meta' | 'google' | 'whats' | 'indica'

export default async function DashboardContent({
  period,
  channel,
  from,
  to,
}: {
  period: Period
  channel: Channel
  from?: string
  to?: string
}) {
  const session = await auth()
  const orgId = session!.user.organizationId!

  const now = new Date()
  const range = resolveRange({ period, from, to }, now)

  // Granularidade derivada automaticamente do range já resolvido (sem seletor).
  const granularity = granularityForRange(range.from, range.to)

  // getDashboardData e getTimeSeries são independentes — rodam em paralelo
  // (antes eram sequenciais, somando as duas latências).
  const [data, series] = await Promise.all([
    getDashboardData(db, orgId, { period, channel, from, to }, now),
    getTimeSeries(db, orgId, {
      from: range.from,
      to: range.to,
      channel,
      granularity,
    }),
  ])

  return (
    <>
      <HighlightCards data={data.highlights} />
      <CostCards data={data.costCards} />
      <Funnel
        counts={data.funnel.counts}
        convGeral={data.funnel.convGeral}
        paths={data.funnelPaths}
      />
      <TrendChart data={series} granularity={granularity} />
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
      <RecentLeads items={data.recentLeads} />
    </>
  )
}
