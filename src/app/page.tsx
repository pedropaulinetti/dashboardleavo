import { auth } from '@/auth/config'

export default async function Home() {
  const session = await auth()
  return (
    <main style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h1>Dashboard (em construção)</h1>
      <p>Logado como: {session?.user?.email ?? '—'}</p>
    </main>
  )
}
