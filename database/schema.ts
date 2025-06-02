import { relations } from 'drizzle-orm';
import { 
  sqliteTable, 
  text, 
  integer, 
  real,
  index
} from 'drizzle-orm/sqlite-core';
import { 
  pgTable, 
  varchar, 
  timestamp, 
  boolean, 
  text as pgText,
  serial,
  bigint,
  decimal,
  index as pgIndex
} from 'drizzle-orm/pg-core';

// Environment-based table creation
const isLocal = process.env.NODE_ENV === 'development';

// User roles enum
export const UserRole = {
  ADMIN: 'admin',
  EMPLOYEE: 'employee'
} as const;

// File categories enum
export const FileCategory = {
  FURNITURE: 'furniture',
  LIGHTING: 'lighting',
  TEXTILES: 'textiles',
  ACCESSORIES: 'accessories',
  FINISHES: 'finishes'
} as const;

// File processing status enum
export const ProcessingStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const;

// SQLite Tables (Development)
export const sqliteUsers = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'employee'] }).notNull().default('employee'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  roleIdx: index('users_role_idx').on(table.role),
}));

export const sqliteSites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  clientName: text('client_name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  nameIdx: index('sites_name_idx').on(table.name),
  clientIdx: index('sites_client_idx').on(table.clientName),
}));

export const sqliteSitePermissions = sqliteTable('site_permissions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => sqliteUsers.id, { onDelete: 'cascade' }),
  siteId: text('site_id').notNull().references(() => sqliteSites.id, { onDelete: 'cascade' }),
  canView: integer('can_view', { mode: 'boolean' }).notNull().default(true),
  canUpload: integer('can_upload', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  userSiteIdx: index('site_permissions_user_site_idx').on(table.userId, table.siteId),
  siteIdx: index('site_permissions_site_idx').on(table.siteId),
}));

export const sqliteFiles = sqliteTable('files', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  category: text('category', { enum: ['furniture', 'lighting', 'textiles', 'accessories', 'finishes'] }).notNull(),
  siteId: text('site_id').notNull().references(() => sqliteSites.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by').notNull().references(() => sqliteUsers.id),
  gcsPath: text('gcs_path').notNull(),
  thumbnailPath: text('thumbnail_path'),
  aiDescription: text('ai_description'),
  aiTags: text('ai_tags'), // JSON string array
  processingStatus: text('processing_status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default('pending'),
  metadata: text('metadata'), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  siteIdx: index('files_site_idx').on(table.siteId),
  categoryIdx: index('files_category_idx').on(table.category),
  statusIdx: index('files_status_idx').on(table.processingStatus),
  uploadedByIdx: index('files_uploaded_by_idx').on(table.uploadedBy),
  filenameIdx: index('files_filename_idx').on(table.filename),
}));

export const sqliteSearchQueries = sqliteTable('search_queries', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => sqliteUsers.id),
  query: text('query').notNull(),
  filters: text('filters'), // JSON string
  resultsCount: integer('results_count').notNull(),
  responseTime: real('response_time').notNull(), // in milliseconds
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  userIdx: index('search_queries_user_idx').on(table.userId),
  queryIdx: index('search_queries_query_idx').on(table.query),
}));

export const sqliteSharedLinks = sqliteTable('shared_links', {
  id: text('id').primaryKey(),
  fileId: text('file_id').notNull().references(() => sqliteFiles.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull().references(() => sqliteUsers.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  tokenIdx: index('shared_links_token_idx').on(table.token),
  fileIdx: index('shared_links_file_idx').on(table.fileId),
  expiresIdx: index('shared_links_expires_idx').on(table.expiresAt),
}));

// PostgreSQL Tables (Production)
export const pgUsers = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('employee'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  emailIdx: pgIndex('users_email_idx').on(table.email),
  roleIdx: pgIndex('users_role_idx').on(table.role),
}));

export const pgSites = pgTable('sites', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: pgText('description'),
  clientName: varchar('client_name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: pgIndex('sites_name_idx').on(table.name),
  clientIdx: pgIndex('sites_client_idx').on(table.clientName),
}));

export const pgSitePermissions = pgTable('site_permissions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => pgUsers.id, { onDelete: 'cascade' }),
  siteId: varchar('site_id', { length: 255 }).notNull().references(() => pgSites.id, { onDelete: 'cascade' }),
  canView: boolean('can_view').notNull().default(true),
  canUpload: boolean('can_upload').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userSiteIdx: pgIndex('site_permissions_user_site_idx').on(table.userId, table.siteId),
  siteIdx: pgIndex('site_permissions_site_idx').on(table.siteId),
}));

export const pgFiles = pgTable('files', {
  id: varchar('id', { length: 255 }).primaryKey(),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  siteId: varchar('site_id', { length: 255 }).notNull().references(() => pgSites.id, { onDelete: 'cascade' }),
  uploadedBy: varchar('uploaded_by', { length: 255 }).notNull().references(() => pgUsers.id),
  gcsPath: varchar('gcs_path', { length: 500 }).notNull(),
  thumbnailPath: varchar('thumbnail_path', { length: 500 }),
  aiDescription: pgText('ai_description'),
  aiTags: pgText('ai_tags'), // JSON string array
  processingStatus: varchar('processing_status', { length: 50 }).notNull().default('pending'),
  metadata: pgText('metadata'), // JSON string
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: pgIndex('files_site_idx').on(table.siteId),
  categoryIdx: pgIndex('files_category_idx').on(table.category),
  statusIdx: pgIndex('files_status_idx').on(table.processingStatus),
  uploadedByIdx: pgIndex('files_uploaded_by_idx').on(table.uploadedBy),
  filenameIdx: pgIndex('files_filename_idx').on(table.filename),
}));

export const pgSearchQueries = pgTable('search_queries', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => pgUsers.id),
  query: pgText('query').notNull(),
  filters: pgText('filters'), // JSON string
  resultsCount: serial('results_count').notNull(),
  responseTime: decimal('response_time', { precision: 10, scale: 2 }).notNull(), // in milliseconds
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdx: pgIndex('search_queries_user_idx').on(table.userId),
  queryIdx: pgIndex('search_queries_query_idx').on(table.query),
}));

export const pgSharedLinks = pgTable('shared_links', {
  id: varchar('id', { length: 255 }).primaryKey(),
  fileId: varchar('file_id', { length: 255 }).notNull().references(() => pgFiles.id, { onDelete: 'cascade' }),
  createdBy: varchar('created_by', { length: 255 }).notNull().references(() => pgUsers.id),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tokenIdx: pgIndex('shared_links_token_idx').on(table.token),
  fileIdx: pgIndex('shared_links_file_idx').on(table.fileId),
  expiresIdx: pgIndex('shared_links_expires_idx').on(table.expiresAt),
}));

// Export appropriate tables based on environment
export const users = isLocal ? sqliteUsers : pgUsers;
export const sites = isLocal ? sqliteSites : pgSites;
export const sitePermissions = isLocal ? sqliteSitePermissions : pgSitePermissions;
export const files = isLocal ? sqliteFiles : pgFiles;
export const searchQueries = isLocal ? sqliteSearchQueries : pgSearchQueries;
export const sharedLinks = isLocal ? sqliteSharedLinks : pgSharedLinks;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sitePermissions: many(sitePermissions),
  uploadedFiles: many(files),
  searchQueries: many(searchQueries),
  sharedLinks: many(sharedLinks),
}));

export const sitesRelations = relations(sites, ({ many }) => ({
  permissions: many(sitePermissions),
  files: many(files),
}));

export const sitePermissionsRelations = relations(sitePermissions, ({ one }) => ({
  user: one(users, {
    fields: [sitePermissions.userId],
    references: [users.id],
  }),
  site: one(sites, {
    fields: [sitePermissions.siteId],
    references: [sites.id],
  }),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  site: one(sites, {
    fields: [files.siteId],
    references: [sites.id],
  }),
  uploader: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
  sharedLinks: many(sharedLinks),
}));

export const searchQueriesRelations = relations(searchQueries, ({ one }) => ({
  user: one(users, {
    fields: [searchQueries.userId],
    references: [users.id],
  }),
}));

export const sharedLinksRelations = relations(sharedLinks, ({ one }) => ({
  file: one(files, {
    fields: [sharedLinks.fileId],
    references: [files.id],
  }),
  creator: one(users, {
    fields: [sharedLinks.createdBy],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type SitePermission = typeof sitePermissions.$inferSelect;
export type NewSitePermission = typeof sitePermissions.$inferInsert;
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type NewSearchQuery = typeof searchQueries.$inferInsert;
export type SharedLink = typeof sharedLinks.$inferSelect;
export type NewSharedLink = typeof sharedLinks.$inferInsert;