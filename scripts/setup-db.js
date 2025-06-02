#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isReset = process.argv.includes('--reset');
const isLocal = process.env.NODE_ENV !== 'production';

console.log('🚀 Setting up database...');
console.log(`Environment: ${isLocal ? 'development (SQLite)' : 'production (PostgreSQL)'}`);

if (isReset) {
  console.log('⚠️  Reset flag detected - this will delete all existing data!');
}

// Database file path for SQLite
const dbDir = path.join(process.cwd(), 'database');
const dbFile = path.join(dbDir, 'local.db');

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('✓ Created database directory');
}

// Reset database if requested
if (isReset && isLocal && fs.existsSync(dbFile)) {
  fs.unlinkSync(dbFile);
  console.log('✓ Removed existing SQLite database');
}

// Check if drizzle-kit is available
try {
  execSync('npx drizzle-kit --version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ drizzle-kit not found. Please install it:');
  console.error('   npm install -D drizzle-kit');
  process.exit(1);
}

// Create drizzle config if it doesn't exist
const drizzleConfigPath = path.join(process.cwd(), 'drizzle.config.ts');
if (!fs.existsSync(drizzleConfigPath)) {
  const configContent = `import type { Config } from 'drizzle-kit';

export default {
  schema: './database/schema.ts',
  out: './drizzle',
  driver: '${isLocal ? 'better-sqlite' : 'pg'}',
  dbCredentials: {
    ${isLocal 
      ? `url: './database/local.db'` 
      : `connectionString: process.env.DATABASE_URL!`
    }
  },
} satisfies Config;
`;
  
  fs.writeFileSync(drizzleConfigPath, configContent);
  console.log('✓ Created drizzle.config.ts');
}

try {
  // Generate migrations
  console.log('📝 Generating migrations...');
  execSync('npx drizzle-kit generate:sqlite', { stdio: 'inherit' });
  
  // Apply migrations
  console.log('🔄 Applying migrations...');
  if (isLocal) {
    // For SQLite, we need to run migrations programmatically
    runSQLiteMigrations();
  } else {
    execSync('npx drizzle-kit migrate', { stdio: 'inherit' });
  }
  
  console.log('✅ Database setup completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Run: npm run seed-db (to add sample data)');
  console.log('2. Run: npm run dev (to start development server)');
  
} catch (error) {
  console.error('❌ Database setup failed:', error.message);
  process.exit(1);
}

function runSQLiteMigrations() {
  const { createClient } = require('@libsql/client');
  
  try {
    const client = createClient({
      url: `file:${dbFile}`
    });
    
    console.log('✓ Connected to SQLite database');
    
    // Read and execute schema
    const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      client.executeMultiple(schema);
      console.log('✓ Applied database schema');
    } else {
      // Create tables manually if schema file doesn't exist
      createTablesManually(client);
    }
    
    // Setup full-text search
    setupFullTextSearch(client);
    
    client.close();
    console.log('✓ SQLite migrations completed');
    
  } catch (error) {
    console.error('❌ SQLite migration failed:', error.message);
    throw error;
  }
}

function createTablesManually(client) {
  console.log('📝 Creating tables manually...');
  
  // Users table
  client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  
  // Sites table
  client.execute(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      client_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  
  // Site permissions table
  client.execute(`
    CREATE TABLE IF NOT EXISTS site_permissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      can_view INTEGER NOT NULL DEFAULT 1,
      can_upload INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      UNIQUE(user_id, site_id)
    );
  `);
  
  // Files table
  client.execute(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      category TEXT NOT NULL,
      site_id TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      gcs_path TEXT NOT NULL,
      thumbnail_path TEXT,
      ai_description TEXT,
      ai_tags TEXT,
      processing_status TEXT NOT NULL DEFAULT 'pending',
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );
  `);
  
  // Search queries table
  client.execute(`
    CREATE TABLE IF NOT EXISTS search_queries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      query TEXT NOT NULL,
      filters TEXT,
      results_count INTEGER NOT NULL,
      response_time REAL NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  
  // Shared links table
  client.execute(`
    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);
  
  // Create indexes
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_sites_client ON sites(client_name);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_site_permissions_user_site ON site_permissions(user_id, site_id);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_site_permissions_site ON site_permissions(site_id);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_files_site ON files(site_id);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_files_category ON files(category);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_files_status ON files(processing_status);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_search_queries_user ON search_queries(user_id);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(token);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_shared_links_file ON shared_links(file_id);
  `);
  client.execute(`
    CREATE INDEX IF NOT EXISTS idx_shared_links_expires ON shared_links(expires_at);
  `);
  
  console.log('✓ Created database tables and indexes');
}

function setupFullTextSearch(client) {
  console.log('🔍 Setting up basic text search...');
  
  try {
    // Note: LibSQL doesn't support FTS5 out of the box like better-sqlite3
    // We'll rely on LIKE queries for now
    console.log('✓ Text search setup completed (using LIKE queries)');
    
  } catch (error) {
    console.warn('⚠️ Text search setup failed (this is OK for development):', error.message);
  }
}