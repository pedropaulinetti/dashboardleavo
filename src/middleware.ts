import { middlewareAuth } from '@/auth/edge'

// Next.js 16 exige um export de função explícito (default ou "middleware").
// O re-export direto de middlewareAuth não é reconhecido como função no build.
export default middlewareAuth

export const config = {
  // protege a home e /integracoes; deixa passar /login, /api/auth, estáticos
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)'],
}
