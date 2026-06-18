import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().length(64),
})

export const env = schema.parse(process.env)
