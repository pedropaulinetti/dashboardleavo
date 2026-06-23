import HighlightCards from './HighlightCards'
import CostCards from './CostCards'
import Funnel from './Funnel'
import TrendChart from './TrendChart'
import UtmRanking from './UtmRanking'
import LossDonut from './LossDonut'
import Creatives from './Creatives'
import { auth } from '@/auth/config'
import { db } from '@/db'
import { getDashboardData, getTimeSeries } from '@/dashboard/queries'
import { resolveRange } from '@/dashboard/range'

type Period = 'all' | 'month' | '7d' | '30d' | '90d' | '12m' | 'custom'
type Channel = 'all' | 'meta' | 'google' | 'whats' | 'indica'
type Granularity = 'day' | 'month' | 'year'

export default async function DashboardContent({
  period,
  channel,
  from,
  to,
  granularity,
}: {
  period: Period
  channel: Channel
  from?: string
  to?: string
  granularity: Granularity
}) {
  const session = await auth()
  const orgId = session!.user.organizationId!

  const now = new Date()

  const data = await getDashboardData(db, orgId, { period, channel, from, to }, now)

  const range = resolveRange({ period, from, to }, now)
  const series = await getTimeSeries(db, orgId, {
    from: range.from,
    to: range.to,
    channel,
    granularity,
  })

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
    </>
  )
}
