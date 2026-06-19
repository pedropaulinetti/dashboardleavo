import { middlewareAuth } from '@/auth/edge'

// Next.js 16 exige um export de função explícito (default ou "middleware").
// O re-export direto de middlewareAuth não é reconhecido como função no build.
export default middlewareAuth

export const config = {
  // protege a home e /integracoes; deixa passar /login, /api/auth, /api/cron
  // (autenticada por Bearer CRON_SECRET na própria rota), estáticos
  matcher: ['/((?!api/auth|api/cron|login|_next/static|_next/image|favicon.ico).*)'],
}
