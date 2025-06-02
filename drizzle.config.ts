import type { Config } from 'drizzle-kit';

const isLocal = process.env.NODE_ENV !== 'production';

export default {
  schema: './database/schema.ts',
  out: './drizzle',
  driver: isLocal ? 'libsql' : 'pg',
  dbCredentials: isLocal 
    ? {
        url: './database/local.db'
      }
    : {
        connectionString: process.env.DATABASE_URL!
      },
} satisfies Config;