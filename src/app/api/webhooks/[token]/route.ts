import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { handleWebhook } from '@/ingestion/webhook'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params // Next 16: params é Promise
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const res = await handleWebhook(db, token, payload)
  if (res.status === 'not_found') {
    return NextResponse.json({ error: 'token inválido' }, { status: 404 })
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}
