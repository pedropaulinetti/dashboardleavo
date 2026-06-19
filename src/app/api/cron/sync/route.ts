// Cron de sincronização — roda syncOrg para todas as organizações.
//
// Auth: o Vercel Cron envia automaticamente `Authorization: Bearer ${CRON_SECRET}`
// quando a env var CRON_SECRET existe no projeto Vercel (não há header proprietário).
//
// DEPLOY: em produção, configurar CRON_SECRET nas Environment Variables do projeto
// na Vercel — sem isso o cron agendado chama a rota sem Authorization e toma 401.
import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/db'
import { syncOrg } from '@/ingestion/sync'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }
  const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations)
  const results = []
  for (const org of orgs) {
    try {
      const r = await syncOrg(db, org.id)
      results.push({ organizationId: org.id, ok: true, providers: r })
    } catch (e) {
      results.push({ organizationId: org.id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ orgs: orgs.length, results })
}
