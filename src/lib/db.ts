import { drizzle } from 'drizzle-orm/libsql';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { createClient } from '@libsql/client';
import postgres from 'postgres';
import * as schema from '../../database/schema';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import fs from 'fs';

// Raw DB client for direct SQL operations
let rawClient: any;

// Driver client for queries
let db: ReturnType<typeof drizzle> | ReturnType<typeof drizzlePg>;

const isLocal = process.env.NODE_ENV === 'development';

if (isLocal) {
  // LibSQL setup for local development
  const dbPath = path.join(process.cwd(), 'database', 'local.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  rawClient = createClient({ url: `file:${dbPath}` });
  db = drizzle(rawClient, { schema });
} else {
  // PostgreSQL setup for production
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL environment variable is required');
  rawClient = postgres(connectionString, { max:10, idle_timeout:20, connect_timeout:10 });
  db = drizzlePg(rawClient, { schema });
}

// Database utilities
export const createConnection = () => db;

export const runMigrations = async () => {
  try {
    if (isLocal) {
      const migrationsPath = path.join(process.cwd(), 'drizzle', 'sqlite');
      if (fs.existsSync(migrationsPath)) {
        await migrate(db as any, { migrationsFolder: migrationsPath });
      }
    } else {
      const migrationsPath = path.join(process.cwd(), 'drizzle', 'pg');
      if (fs.existsSync(migrationsPath)) {
        await migratePg(db as any, { migrationsFolder: migrationsPath });
      }
    }
    console.log('✓ Database migrations completed');
  } catch (error) {
    console.error('✗ Database migration failed:', error);
    throw error;
  }
};

// Full-text search utilities
export const searchFiles = async (query: string, siteIds: string[] = []) => {
  const client = rawClient;
  if (isLocal) {
    // LibSQL search (basic text search, FTS5 setup is more complex)
    const siteFilter = siteIds.length > 0 
      ? `AND site_id IN (${siteIds.map(() => '?').join(',')})`
      : '';
    
    const params = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];
    if (siteIds.length > 0) {
      params.push(...siteIds);
    }
    
    const result = await client.execute({
      sql: `
        SELECT * FROM files
        WHERE (
          filename LIKE ? OR 
          original_name LIKE ? OR 
          ai_description LIKE ? OR 
          ai_tags LIKE ?
        ) ${siteFilter}
        ORDER BY created_at DESC
        LIMIT 50
      `,
      args: params
    });
    
    return result.rows;
  } else {
    // PostgreSQL full-text search
    const siteFilter = siteIds.length > 0 
      ? `AND site_id = ANY($${siteIds.length + 1})`
      : '';
    
    const result = await client`
      SELECT *,
        ts_rank(
          to_tsvector('english', filename || ' ' || original_name || ' ' || COALESCE(ai_description, '') || ' ' || COALESCE(ai_tags, '')),
          plainto_tsquery('english', ${query})
        ) as rank
      FROM files
      WHERE to_tsvector('english', filename || ' ' || original_name || ' ' || COALESCE(ai_description, '') || ' ' || COALESCE(ai_tags, ''))
        @@ plainto_tsquery('english', ${query})
      ${siteFilter}
      ORDER BY rank DESC
      LIMIT 50
    `;
    
    return result;
  }
};

// Health check
export const checkConnection = async (): Promise<boolean> => {
  const client = rawClient;
  try {
    if (isLocal) await client.execute('SELECT 1');
    else await client`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
};

// Close connection (for cleanup)
export const closeConnection = () => {
  const client = rawClient;
  if (isLocal) client.close();
  else client.end();
};

export { db };
export default db;