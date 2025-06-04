#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');

const isLocal = process.env.NODE_ENV !== 'production';

console.log('🌱 Seeding database...');
console.log(`Environment: ${isLocal ? 'development (SQLite)' : 'production (PostgreSQL)'}`);

if (isLocal) {
  seedSQLite();
} else {
  seedPostgreSQL();
}

function seedSQLite() {
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
    console.log('📝 Creating sample data...');
    
    // Clear existing data (be careful in production!)
    console.log('🧹 Clearing existing data...');
    client.execute('DELETE FROM shared_links');
    client.execute('DELETE FROM search_queries');
    client.execute('DELETE FROM files');
    client.execute('DELETE FROM site_permissions');
    client.execute('DELETE FROM sites');
    client.execute('DELETE FROM users');
    
    // Create users
    const users = createUsers(client);
    console.log(`✓ Created ${users.length} users`);
    
    // Create sites
    const sites = createSites(client);
    console.log(`✓ Created ${sites.length} sites`);
    
    // Create site permissions
    createSitePermissions(client, users, sites);
    console.log('✓ Created site permissions');
    
    // Create sample files
    const files = createSampleFiles(client, users, sites);
    console.log(`✓ Created ${files.length} sample files`);
    
    // Create sample search queries
    createSampleSearchQueries(client, users);
    console.log('✓ Created sample search queries');
    
    client.close();
    
    console.log('✅ Database seeding completed successfully!');
    console.log('\nSample accounts created:');
    console.log('👤 Admin: admin@example.com / password123');
    console.log('👤 Employee: employee@example.com / password123');
    console.log('👤 Designer: designer@example.com / password123');
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error.message);
    client.close();
    process.exit(1);
  }
}

function seedPostgreSQL() {
  console.log('📝 PostgreSQL seeding not implemented yet');
  console.log('Please implement PostgreSQL seeding logic');
  process.exit(1);
}

function createUsers(db) {
  const users = [
    {
      id: nanoid(),
      email: 'admin@example.com',
      name: 'Admin User',
      password: 'password123',
      role: 'admin',
    },
    {
      id: nanoid(),
      email: 'employee@example.com',
      name: 'John Employee',
      password: 'password123',
      role: 'employee',
    },
    {
      id: nanoid(),
      email: 'designer@example.com',
      name: 'Jane Designer',
      password: 'password123',
      role: 'employee',
    },
    {
      id: nanoid(),
      email: 'manager@example.com',
      name: 'Mike Manager',
      password: 'password123',
      role: 'employee',
    },
  ];
  
  const now = Date.now();
  
  users.forEach(user => {
    const passwordHash = bcrypt.hashSync(user.password, 12);
    db.execute({
      sql: `
        INSERT INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        user.id,
        user.email,
        user.name,
        passwordHash,
        user.role,
        1, // is_active
        now,
        now
      ]
    });
  });
  
  return users;
}

function createSites(client) {
  const sites = [
    {
      id: nanoid(),
      name: 'Luxury Apartment Downtown',
      description: 'Modern luxury apartment renovation in the heart of downtown',
      clientName: 'Sarah Johnson',
    },
    {
      id: nanoid(),
      name: 'Corporate Office Redesign',
      description: 'Complete office space redesign for tech startup',
      clientName: 'TechCorp Inc.',
    },
    {
      id: nanoid(),
      name: 'Beach House Retreat',
      description: 'Coastal vacation home interior design project',
      clientName: 'The Williams Family',
    },
    {
      id: nanoid(),
      name: 'Restaurant Interior',
      description: 'Contemporary restaurant design with open kitchen concept',
      clientName: 'Bistro Verde',
    },
    {
      id: nanoid(),
      name: 'Historic Home Restoration',
      description: 'Restoration and modernization of 1920s historic home',
      clientName: 'Heritage Trust',
    },
  ];
  
  const now = Date.now();
  
  sites.forEach(site => {
    client.execute({
      sql: `
        INSERT INTO sites (id, name, description, client_name, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        site.id,
        site.name,
        site.description,
        site.clientName,
        1, // is_active
        now,
        now
      ]
    });
  });
  
  return sites;
}

function createSitePermissions(client, users, sites) {
  const now = Date.now();
  const admin = users.find(u => u.role === 'admin');
  const employees = users.filter(u => u.role === 'employee');
  
  // Admin has full access to all sites
  sites.forEach(site => {
    client.execute({
      sql: `
        INSERT INTO site_permissions (id, user_id, site_id, can_view, can_upload, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        nanoid(),
        admin.id,
        site.id,
        1, // can_view
        1, // can_upload
        now
      ]
    });
  });
  
  // Employees have varied access
  employees.forEach((employee, index) => {
    sites.forEach((site, siteIndex) => {
      // Give each employee access to different sites
      const hasAccess = (index + siteIndex) % 2 === 0;
      const canUpload = hasAccess && (index + siteIndex) % 3 === 0;
      
      if (hasAccess) {
        client.execute({
          sql: `
            INSERT INTO site_permissions (id, user_id, site_id, can_view, can_upload, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          args: [
            nanoid(),
            employee.id,
            site.id,
            1, // can_view
            canUpload ? 1 : 0, // can_upload
            now
          ]
        });
      }
    });
  });
}

function createSampleFiles(client, users, sites) {
  const categories = ['furniture', 'lighting', 'textiles', 'accessories', 'finishes'];
  const sampleFiles = [
    {
      originalName: 'living_room_sofa.jpg',
      mimeType: 'image/jpeg',
      category: 'furniture',
      aiDescription: 'Modern grey sectional sofa with clean lines and comfortable cushions',
      aiTags: '["sofa", "sectional", "grey", "modern", "living room", "furniture"]',
    },
    {
      originalName: 'pendant_lighting.jpg',
      mimeType: 'image/jpeg',
      category: 'lighting',
      aiDescription: 'Contemporary pendant lights with brass finish over kitchen island',
      aiTags: '["pendant", "lighting", "brass", "contemporary", "kitchen", "island"]',
    },
    {
      originalName: 'fabric_samples.pdf',
      mimeType: 'application/pdf',
      category: 'textiles',
      aiDescription: 'Fabric sample collection for upholstery and drapery',
      aiTags: '["fabric", "samples", "upholstery", "drapery", "textiles"]',
    },
    {
      originalName: 'decorative_vases.jpg',
      mimeType: 'image/jpeg',
      category: 'accessories',
      aiDescription: 'Collection of ceramic vases in earth tones for accent decor',
      aiTags: '["vases", "ceramic", "earth tones", "decor", "accessories"]',
    },
    {
      originalName: 'hardwood_flooring.jpg',
      mimeType: 'image/jpeg',
      category: 'finishes',
      aiDescription: 'Oak hardwood flooring with natural finish and wide planks',
      aiTags: '["hardwood", "flooring", "oak", "natural", "wide plank", "finishes"]',
    },
    {
      originalName: 'kitchen_cabinets.jpg',
      mimeType: 'image/jpeg',
      category: 'furniture',
      aiDescription: 'White shaker-style kitchen cabinets with soft-close hardware',
      aiTags: '["cabinets", "kitchen", "white", "shaker", "soft-close", "furniture"]',
    },
    {
      originalName: 'bathroom_tiles.jpg',
      mimeType: 'image/jpeg',
      category: 'finishes',
      aiDescription: 'Subway tile backsplash in matte white with dark grout',
      aiTags: '["subway tile", "bathroom", "white", "matte", "dark grout", "finishes"]',
    },
    {
      originalName: 'area_rug_pattern.jpg',
      mimeType: 'image/jpeg',
      category: 'textiles',
      aiDescription: 'Persian-inspired area rug with intricate blue and gold pattern',
      aiTags: '["area rug", "persian", "blue", "gold", "pattern", "textiles"]',
    },
  ];
  
  const now = Date.now();
  const files = [];
  
  // Create multiple files for each site
  sites.forEach((site, siteIndex) => {
    const numFiles = Math.floor(Math.random() * 5) + 3; // 3-7 files per site
    
    for (let i = 0; i < numFiles; i++) {
      const sampleFile = sampleFiles[i % sampleFiles.length];
      const fileId = nanoid();
      const filename = `${fileId}.${sampleFile.mimeType.split('/')[1] || 'jpg'}`;
      const gcsPath = `sites/${site.id}/${sampleFile.category}/${new Date().toISOString().slice(0, 10)}/${filename}`;
      
      // Random file size between 100KB and 10MB
      const size = Math.floor(Math.random() * (10 * 1024 * 1024 - 100 * 1024)) + 100 * 1024;
      
      // Random uploader (who has access to this site)
      const uploaders = users.filter(user => {
        if (user.role === 'admin') return true;
        // Check if this user has upload access to this site
        return (users.indexOf(user) + siteIndex) % 3 === 0;
      });
      const uploader = uploaders[Math.floor(Math.random() * uploaders.length)];
      
      // Vary the creation time
      const createdAt = now - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000); // Within last 30 days
      
      const file = {
        id: fileId,
        filename,
        originalName: `${site.name.toLowerCase().replace(/\s+/g, '_')}_${sampleFile.originalName}`,
        mimeType: sampleFile.mimeType,
        size,
        category: sampleFile.category,
        siteId: site.id,
        uploadedBy: uploader.id,
        gcsPath,
        aiDescription: sampleFile.aiDescription,
        // Add site name and client name to tags for search
        aiTags: JSON.stringify([
          ...JSON.parse(sampleFile.aiTags),
          site.name,
          site.clientName
        ]),
        processingStatus: 'completed',
        createdAt,
        updatedAt: createdAt,
      };
      
      client.execute({
        sql: `
          INSERT INTO files (id, filename, original_name, mime_type, size, category, site_id, uploaded_by, gcs_path, ai_description, ai_tags, processing_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          file.id,
          file.filename,
          file.originalName,
          file.mimeType,
          file.size,
          file.category,
          file.siteId,
          file.uploadedBy,
          file.gcsPath,
          file.aiDescription,
          file.aiTags,
          file.processingStatus,
          file.createdAt,
          file.updatedAt
        ]
      });
      
      files.push(file);
    }
  });
  
  return files;
}

function createSampleSearchQueries(client, users) {
  const sampleQueries = [
    'modern sofa',
    'lighting kitchen',
    'bathroom tiles',
    'hardwood flooring',
    'pendant lights',
    'fabric samples',
    'grey furniture',
    'contemporary design',
    'brass fixtures',
    'white cabinets',
  ];
  
  const now = Date.now();
  
  // Create search queries for each user
  users.forEach(user => {
    const numQueries = Math.floor(Math.random() * 5) + 2; // 2-6 queries per user
    
    for (let i = 0; i < numQueries; i++) {
      const query = sampleQueries[Math.floor(Math.random() * sampleQueries.length)];
      const resultsCount = Math.floor(Math.random() * 20) + 1; // 1-20 results
      const responseTime = Math.random() * 1000 + 100; // 100-1100ms
      const createdAt = now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000); // Within last 7 days
      
      client.execute({
        sql: `
          INSERT INTO search_queries (id, user_id, query, results_count, response_time, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          nanoid(),
          user.id,
          query,
          resultsCount,
          responseTime,
          createdAt
        ]
      });
    }
  });
}