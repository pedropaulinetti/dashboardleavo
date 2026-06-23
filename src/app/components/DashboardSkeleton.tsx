function Box({ height, style }: { height: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, ...style }} aria-hidden="true" />
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 14,
        padding: 18,
      }}
    >
      {children}
    </div>
  )
}

export default function DashboardSkeleton() {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      role="status"
      aria-busy="true"
      aria-label="Carregando dados do funil"
    >
      {/* Highlight cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Box height={12} style={{ width: '55%', marginBottom: 14 }} />
            <Box height={26} style={{ width: '70%', marginBottom: 10 }} />
            <Box height={10} style={{ width: '40%' }} />
          </Card>
        ))}
      </div>

      {/* Cost cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Box height={12} style={{ width: '50%', marginBottom: 14 }} />
            <Box height={22} style={{ width: '65%' }} />
          </Card>
        ))}
      </div>

      {/* Funnel */}
      <Card>
        <Box height={14} style={{ width: '30%', marginBottom: 20 }} />
        <Box height={220} style={{ width: '100%' }} />
      </Card>

      {/* UTM ranking + Loss donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'start' }}>
        <Card>
          <Box height={14} style={{ width: '35%', marginBottom: 18 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Box key={i} height={16} style={{ width: `${90 - i * 8}%` }} />
            ))}
          </div>
        </Card>
        <Card>
          <Box height={14} style={{ width: '45%', marginBottom: 18 }} />
          <Box height={180} style={{ width: 180, margin: '0 auto', borderRadius: '50%' }} />
        </Card>
      </div>

      {/* Creatives */}
      <Card>
        <Box height={14} style={{ width: '25%', marginBottom: 18 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Box key={i} height={120} style={{ width: '100%' }} />
          ))}
        </div>
      </Card>
    </div>
  )
}
