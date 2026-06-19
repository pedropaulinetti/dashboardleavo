export default function DashboardPage() {
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
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
          Dashboard
        </h2>
        <p style={{ fontSize: 13, margin: '3px 0 0', color: 'hsl(var(--muted-foreground))' }}>
          Widgets do funil de vendas chegam na Task 10.
        </p>
      </div>
    </div>
  )
}
