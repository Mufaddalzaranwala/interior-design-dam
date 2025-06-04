#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧹 Clearing all non-authentication data...');

const { createClient } = require('@libsql/client');
const dbFile = path.join(process.cwd(), 'database', 'local.db');

if (!fs.existsSync(dbFile)) {
  console.error('❌ Database file not found. Please run: npm run setup-db');
  process.exit(1);
}

const client = createClient({
  url: `file:${dbFile}`
});

try {
  // List of tables to clear (except 'users')
  const tablesToClear = [
    'shared_links',
    'search_queries',
    'files',
    'site_permissions',
    'sites'
  ];

  tablesToClear.forEach(table => {
    console.log(`Deleting all data from ${table}...`);
    client.execute(`DELETE FROM ${table}`);
  });

  client.close();
  console.log('✅ Non-authentication data cleared. User authentication data is preserved.');
} catch (error) {
  console.error('❌ Failed to clear non-authentication data:', error.message);
  client.close();
  process.exit(1);
}
