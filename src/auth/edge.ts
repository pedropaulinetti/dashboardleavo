import NextAuth from 'next-auth'

export const { auth: middlewareAuth } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const loggedIn = !!auth?.user
      const onLogin = request.nextUrl.pathname.startsWith('/login')
      if (!loggedIn && !onLogin) return false // redireciona p/ /login
      return true
    },
  },
})
