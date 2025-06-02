import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { createTRPCRouter, adminProcedure } from '../trpc';
import { 
  users, 
  sites, 
  files, 
  sitePermissions, 
  searchQueries, 
  sharedLinks,
  ProcessingStatus 
} from '../../../database/schema';
import { checkConnection } from '../../lib/db';
import { checkBucketAccess, getStorageStats } from '../../lib/storage';
import { checkAIService } from '../../lib/ai';
import { getPermissionStats } from '../../lib/permissions';

export const adminRouter = createTRPCRouter({
  // Get system overview
  getSystemOverview: adminProcedure
    .query(async ({ ctx }) => {
      try {
        // Get basic counts
        const [userCount] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.isActive, true));

        const [siteCount] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(sites)
          .where(eq(sites.isActive, true));

        const [fileCount] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(files);

        const [totalSize] = await ctx.db
          .select({ totalSize: sql<number>`sum(${files.size})` })
          .from(files);

        // Get processing status counts
        const processingStats = await ctx.db
          .select({
            status: files.processingStatus,
            count: sql<number>`count(*)`,
          })
          .from(files)
          .groupBy(files.processingStatus);

        // Get recent activity
        const recentUploads = await ctx.db
          .select({
            id: files.id,
            filename: files.filename,
            originalName: files.originalName,
            size: files.size,
            uploaderName: users.name,
            siteName: sites.name,
            createdAt: files.createdAt,
          })
          .from(files)
          .innerJoin(users, eq(users.id, files.uploadedBy))
          .innerJoin(sites, eq(sites.id, files.siteId))
          .orderBy(desc(files.createdAt))
          .limit(10);

        // Get daily upload stats for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyUploads = await ctx.db
          .select({
            date: sql<string>`date(${files.createdAt})`,
            count: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .where(gte(files.createdAt, thirtyDaysAgo))
          .groupBy(sql`date(${files.createdAt})`)
          .orderBy(sql`date(${files.createdAt})`);

        return {
          stats: {
            totalUsers: userCount?.count || 0,
            totalSites: siteCount?.count || 0,
            totalFiles: fileCount?.count || 0,
            totalSize: totalSize?.totalSize || 0,
          },
          processingStats: processingStats.reduce((acc, stat) => {
            acc[stat.status] = stat.count;
            return acc;
          }, {} as Record<string, number>),
          recentUploads,
          dailyUploads,
        };
      } catch (error) {
        console.error('Get system overview error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get system overview',
        });
      }
    }),

  // Get detailed analytics
  getAnalytics: adminProcedure
    .input(
      z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const dateFrom = input.dateFrom ? new Date(input.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dateTo = input.dateTo ? new Date(input.dateTo) : new Date();

        // File uploads by category
        const uploadsByCategory = await ctx.db
          .select({
            category: files.category,
            count: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .where(
            and(
              gte(files.createdAt, dateFrom),
              sql`${files.createdAt} <= ${dateTo}`
            )
          )
          .groupBy(files.category);

        // Top uploaders
        const topUploaders = await ctx.db
          .select({
            userId: users.id,
            userName: users.name,
            userEmail: users.email,
            uploadCount: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .innerJoin(users, eq(users.id, files.uploadedBy))
          .where(
            and(
              gte(files.createdAt, dateFrom),
              sql`${files.createdAt} <= ${dateTo}`
            )
          )
          .groupBy(users.id, users.name, users.email)
          .orderBy(sql`count(*) DESC`)
          .limit(10);

        // Most active sites
        const activeSites = await ctx.db
          .select({
            siteId: sites.id,
            siteName: sites.name,
            clientName: sites.clientName,
            uploadCount: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .innerJoin(sites, eq(sites.id, files.siteId))
          .where(
            and(
              gte(files.createdAt, dateFrom),
              sql`${files.createdAt} <= ${dateTo}`
            )
          )
          .groupBy(sites.id, sites.name, sites.clientName)
          .orderBy(sql`count(*) DESC`)
          .limit(10);

        // Search analytics
        const searchStats = await ctx.db
          .select({
            totalSearches: sql<number>`count(*)`,
            avgResponseTime: sql<number>`avg(${searchQueries.responseTime})`,
            avgResultsCount: sql<number>`avg(${searchQueries.resultsCount})`,
          })
          .from(searchQueries)
          .where(
            and(
              gte(searchQueries.createdAt, dateFrom),
              sql`${searchQueries.createdAt} <= ${dateTo}`
            )
          );

        // Popular search terms
        const popularSearches = await ctx.db
          .select({
            query: searchQueries.query,
            count: sql<number>`count(*)`,
            avgResponseTime: sql<number>`avg(${searchQueries.responseTime})`,
          })
          .from(searchQueries)
          .where(
            and(
              gte(searchQueries.createdAt, dateFrom),
              sql`${searchQueries.createdAt} <= ${dateTo}`
            )
          )
          .groupBy(searchQueries.query)
          .orderBy(sql`count(*) DESC`)
          .limit(10);

        // Shared links stats
        const [shareStats] = await ctx.db
          .select({
            totalShares: sql<number>`count(*)`,
            activeShares: sql<number>`sum(case when ${sharedLinks.isActive} and ${sharedLinks.expiresAt} > current_timestamp then 1 else 0 end)`,
          })
          .from(sharedLinks)
          .where(
            and(
              gte(sharedLinks.createdAt, dateFrom),
              sql`${sharedLinks.createdAt} <= ${dateTo}`
            )
          );

        return {
          uploadsByCategory,
          topUploaders,
          activeSites,
          searchStats: searchStats[0] || {
            totalSearches: 0,
            avgResponseTime: 0,
            avgResultsCount: 0,
          },
          popularSearches,
          shareStats: shareStats || {
            totalShares: 0,
            activeShares: 0,
          },
        };
      } catch (error) {
        console.error('Get analytics error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get analytics',
        });
      }
    }),

  // Get system health status
  getSystemHealth: adminProcedure
    .query(async ({ ctx }) => {
      try {
        const health = {
          database: false,
          storage: false,
          ai: false,
          overall: false,
        };

        // Check database connection
        try {
          health.database = await checkConnection();
        } catch (error) {
          console.error('Database health check failed:', error);
        }

        // Check storage access
        try {
          health.storage = await checkBucketAccess();
        } catch (error) {
          console.error('Storage health check failed:', error);
        }

        // Check AI service
        try {
          health.ai = await checkAIService();
        } catch (error) {
          console.error('AI health check failed:', error);
        }

        // Overall health
        health.overall = health.database && health.storage && health.ai;

        // Get additional system metrics
        const [failedProcessing] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(files)
          .where(eq(files.processingStatus, ProcessingStatus.FAILED));

        const [pendingProcessing] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(files)
          .where(eq(files.processingStatus, ProcessingStatus.PENDING));

        return {
          ...health,
          metrics: {
            failedProcessing: failedProcessing?.count || 0,
            pendingProcessing: pendingProcessing?.count || 0,
          },
        };
      } catch (error) {
        console.error('Get system health error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get system health',
        });
      }
    }),

  // Get storage statistics
  getStorageStats: adminProcedure
    .query(async ({ ctx }) => {
      try {
        // Get database storage stats
        const dbStats = await ctx.db
          .select({
            totalFiles: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files);

        const categoryStats = await ctx.db
          .select({
            category: files.category,
            count: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .groupBy(files.category);

        const siteStats = await ctx.db
          .select({
            siteId: sites.id,
            siteName: sites.name,
            fileCount: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .innerJoin(sites, eq(sites.id, files.siteId))
          .groupBy(sites.id, sites.name)
          .orderBy(sql`sum(${files.size}) DESC`)
          .limit(10);

        // Get GCS storage stats (if available)
        let gcsStats;
        try {
          gcsStats = await getStorageStats();
        } catch (error) {
          console.error('Failed to get GCS stats:', error);
          gcsStats = {
            totalFiles: 0,
            totalSize: 0,
            sizeByCategory: {},
          };
        }

        return {
          database: {
            totalFiles: dbStats[0]?.totalFiles || 0,
            totalSize: dbStats[0]?.totalSize || 0,
          },
          gcs: gcsStats,
          byCategory: categoryStats.reduce((acc, stat) => {
            acc[stat.category] = {
              count: stat.count,
              size: stat.totalSize || 0,
            };
            return acc;
          }, {} as Record<string, { count: number; size: number }>),
          bySite: siteStats,
        };
      } catch (error) {
        console.error('Get storage stats error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get storage statistics',
        });
      }
    }),

  // Get permission statistics
  getPermissionStats: adminProcedure
    .query(async ({ ctx }) => {
      try {
        const stats = await getPermissionStats();

        // Get detailed permission breakdown
        const userPermissions = await ctx.db
          .select({
            userId: users.id,
            userName: users.name,
            userEmail: users.email,
            siteCount: sql<number>`count(distinct ${sitePermissions.siteId})`,
            uploadSiteCount: sql<number>`sum(case when ${sitePermissions.canUpload} then 1 else 0 end)`,
          })
          .from(users)
          .leftJoin(sitePermissions, eq(sitePermissions.userId, users.id))
          .where(eq(users.isActive, true))
          .groupBy(users.id, users.name, users.email)
          .orderBy(sql`count(distinct ${sitePermissions.siteId}) DESC`);

        const sitePermissions2 = await ctx.db
          .select({
            siteId: sites.id,
            siteName: sites.name,
            userCount: sql<number>`count(distinct ${sitePermissions.userId})`,
            uploadUserCount: sql<number>`sum(case when ${sitePermissions.canUpload} then 1 else 0 end)`,
          })
          .from(sites)
          .leftJoin(sitePermissions, eq(sitePermissions.siteId, sites.id))
          .where(eq(sites.isActive, true))
          .groupBy(sites.id, sites.name)
          .orderBy(sql`count(distinct ${sitePermissions.userId}) DESC`);

        return {
          overview: stats,
          userPermissions,
          sitePermissions: sitePermissions2,
        };
      } catch (error) {
        console.error('Get permission stats error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get permission statistics',
        });
      }
    }),

  // Retry failed file processing
  retryFailedProcessing: adminProcedure
    .input(
      z.object({
        fileIds: z.array(z.string()).optional(),
        retryAll: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        let filesToRetry;

        if (input.retryAll) {
          filesToRetry = await ctx.db
            .select()
            .from(files)
            .where(eq(files.processingStatus, ProcessingStatus.FAILED));
        } else if (input.fileIds && input.fileIds.length > 0) {
          filesToRetry = await ctx.db
            .select()
            .from(files)
            .where(
              and(
                sql`${files.id} IN (${input.fileIds.map(() => '?').join(',')})`,
                eq(files.processingStatus, ProcessingStatus.FAILED)
              )
            );
        } else {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Either provide file IDs or set retryAll to true',
          });
        }

        if (filesToRetry.length === 0) {
          return {
            message: 'No failed files found to retry',
            retriedCount: 0,
          };
        }

        // Update status to pending for retry
        const fileIds = filesToRetry.map(f => f.id);
        await ctx.db
          .update(files)
          .set({
            processingStatus: ProcessingStatus.PENDING,
            updatedAt: new Date(),
          })
          .where(sql`${files.id} IN (${fileIds.map(() => '?').join(',')})`);

        // Here you would trigger the cloud function or background job
        // to reprocess these files. For now, we'll just update the status.

        return {
          message: `${filesToRetry.length} file(s) queued for reprocessing`,
          retriedCount: filesToRetry.length,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Retry failed processing error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retry processing',
        });
      }
    }),

  // Clean up expired shared links
  cleanupExpiredLinks: adminProcedure
    .mutation(async ({ ctx }) => {
      try {
        const now = new Date();
        
        const expiredLinks = await ctx.db
          .select()
          .from(sharedLinks)
          .where(
            and(
              eq(sharedLinks.isActive, true),
              sql`${sharedLinks.expiresAt} < ${now}`
            )
          );

        if (expiredLinks.length === 0) {
          return {
            message: 'No expired links found',
            cleanedCount: 0,
          };
        }

        await ctx.db
          .update(sharedLinks)
          .set({ isActive: false })
          .where(
            and(
              eq(sharedLinks.isActive, true),
              sql`${sharedLinks.expiresAt} < ${now}`
            )
          );

        return {
          message: `${expiredLinks.length} expired link(s) cleaned up`,
          cleanedCount: expiredLinks.length,
        };
      } catch (error) {
        console.error('Cleanup expired links error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cleanup expired links',
        });
      }
    }),

  // Get system configuration
  getSystemConfig: adminProcedure
    .query(async ({ ctx }) => {
      return {
        environment: process.env.NODE_ENV || 'development',
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
        allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
          'image/*',
          'application/pdf',
          '.dwg',
          '.dxf'
        ],
        bucketName: process.env.GCS_BUCKET_NAME || 'not-configured',
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        features: {
          aiProcessing: !!process.env.GEMINI_API_KEY,
          cloudStorage: !!process.env.GCS_BUCKET_NAME,
          fullTextSearch: true,
        },
      };
    }),

  // Get failed processing files
  getFailedFiles: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        // Get total count
        const [countResult] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(files)
          .where(eq(files.processingStatus, ProcessingStatus.FAILED));

        const total = countResult?.count || 0;

        // Get failed files
        const failedFiles = await ctx.db
          .select({
            id: files.id,
            filename: files.filename,
            originalName: files.originalName,
            mimeType: files.mimeType,
            size: files.size,
            category: files.category,
            siteId: files.siteId,
            siteName: sites.name,
            uploadedBy: files.uploadedBy,
            uploaderName: users.name,
            createdAt: files.createdAt,
            updatedAt: files.updatedAt,
          })
          .from(files)
          .innerJoin(sites, eq(sites.id, files.siteId))
          .innerJoin(users, eq(users.id, files.uploadedBy))
          .where(eq(files.processingStatus, ProcessingStatus.FAILED))
          .orderBy(desc(files.updatedAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit);

        return {
          files: failedFiles,
          total,
          page: input.page,
          limit: input.limit,
        };
      } catch (error) {
        console.error('Get failed files error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get failed files',
        });
      }
    }),
});