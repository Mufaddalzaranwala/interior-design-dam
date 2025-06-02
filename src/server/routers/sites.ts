import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '../trpc';
import { sites, sitePermissions, files, users } from '../../../database/schema';
import { getUserSitePermissions, canViewSite } from '../../lib/permissions';
import { nanoid } from 'nanoid';

export const sitesRouter = createTRPCRouter({
  // Get all sites accessible to the user
  getSites: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role === 'admin') {
        // Admins can see all sites
        const allSites = await ctx.db
          .select({
            id: sites.id,
            name: sites.name,
            description: sites.description,
            clientName: sites.clientName,
            isActive: sites.isActive,
            createdAt: sites.createdAt,
            updatedAt: sites.updatedAt,
          })
          .from(sites)
          .orderBy(desc(sites.createdAt));

        // Get file counts for each site
        const sitesWithCounts = await Promise.all(
          allSites.map(async (site) => {
            const [fileCount] = await ctx.db
              .select({ count: sql<number>`count(*)` })
              .from(files)
              .where(eq(files.siteId, site.id));

            return {
              ...site,
              fileCount: fileCount?.count || 0,
              canView: true,
              canUpload: true,
            };
          })
        );

        return sitesWithCounts;
      } else {
        // Regular users only see sites they have access to
        const userSites = await ctx.db
          .select({
            id: sites.id,
            name: sites.name,
            description: sites.description,
            clientName: sites.clientName,
            isActive: sites.isActive,
            createdAt: sites.createdAt,
            updatedAt: sites.updatedAt,
            canView: sitePermissions.canView,
            canUpload: sitePermissions.canUpload,
          })
          .from(sitePermissions)
          .innerJoin(sites, eq(sites.id, sitePermissions.siteId))
          .where(
            and(
              eq(sitePermissions.userId, ctx.user.id),
              eq(sites.isActive, true),
              eq(sitePermissions.canView, true)
            )
          )
          .orderBy(desc(sites.createdAt));

        // Get file counts for accessible sites
        const sitesWithCounts = await Promise.all(
          userSites.map(async (site) => {
            const [fileCount] = await ctx.db
              .select({ count: sql<number>`count(*)` })
              .from(files)
              .where(eq(files.siteId, site.id));

            return {
              ...site,
              fileCount: fileCount?.count || 0,
            };
          })
        );

        return sitesWithCounts;
      }
    }),

  // Get a specific site by ID
  getSite: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const [site] = await ctx.db
        .select()
        .from(sites)
        .where(eq(sites.id, input.id))
        .limit(1);

      if (!site) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }

      // Check if user can view this site
      const canView = await canViewSite(ctx.user.id, input.id);
      if (!canView && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this site',
        });
      }

      // Get site statistics
      const [stats] = await ctx.db
        .select({
          totalFiles: sql<number>`count(*)`,
          totalSize: sql<number>`sum(${files.size})`,
        })
        .from(files)
        .where(eq(files.siteId, input.id));

      // Get files by category
      const categoryStats = await ctx.db
        .select({
          category: files.category,
          count: sql<number>`count(*)`,
          totalSize: sql<number>`sum(${files.size})`,
        })
        .from(files)
        .where(eq(files.siteId, input.id))
        .groupBy(files.category);

      // Get recent files
      const recentFiles = await ctx.db
        .select({
          id: files.id,
          filename: files.filename,
          originalName: files.originalName,
          size: files.size,
          category: files.category,
          mimeType: files.mimeType,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(eq(files.siteId, input.id))
        .orderBy(desc(files.createdAt))
        .limit(10);

      return {
        ...site,
        stats: {
          totalFiles: stats?.totalFiles || 0,
          totalSize: stats?.totalSize || 0,
        },
        categoryStats: categoryStats.reduce((acc, stat) => {
          acc[stat.category] = {
            count: stat.count,
            size: stat.totalSize || 0,
          };
          return acc;
        }, {} as Record<string, { count: number; size: number }>),
        recentFiles,
      };
    }),

  // Create a new site (admin only)
  createSite: adminProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Site name is required'),
        description: z.string().optional(),
        clientName: z.string().min(1, 'Client name is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const siteId = nanoid();
        const now = new Date();

        const newSite = {
          id: siteId,
          name: input.name,
          description: input.description || null,
          clientName: input.clientName,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };

        await ctx.db.insert(sites).values(newSite);

        return {
          site: newSite,
          message: 'Site created successfully',
        };
      } catch (error) {
        console.error('Site creation error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create site',
        });
      }
    }),

  // Update site (admin only)
  updateSite: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1, 'Site name is required').optional(),
        description: z.string().optional(),
        clientName: z.string().min(1, 'Client name is required').optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [existingSite] = await ctx.db
        .select()
        .from(sites)
        .where(eq(sites.id, input.id))
        .limit(1);

      if (!existingSite) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }

      try {
        const updateData: any = {
          updatedAt: new Date(),
        };

        if (input.name !== undefined) {
          updateData.name = input.name;
        }
        if (input.description !== undefined) {
          updateData.description = input.description;
        }
        if (input.clientName !== undefined) {
          updateData.clientName = input.clientName;
        }
        if (input.isActive !== undefined) {
          updateData.isActive = input.isActive;
        }

        await ctx.db
          .update(sites)
          .set(updateData)
          .where(eq(sites.id, input.id));

        return {
          message: 'Site updated successfully',
        };
      } catch (error) {
        console.error('Site update error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update site',
        });
      }
    }),

  // Delete site (admin only)
  deleteSite: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [existingSite] = await ctx.db
        .select()
        .from(sites)
        .where(eq(sites.id, input.id))
        .limit(1);

      if (!existingSite) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Site not found',
        });
      }

      try {
        // Check if site has files
        const [fileCount] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(files)
          .where(eq(files.siteId, input.id));

        if (fileCount && fileCount.count > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot delete site with ${fileCount.count} files. Please delete files first.`,
          });
        }

        // Delete site permissions first
        await ctx.db
          .delete(sitePermissions)
          .where(eq(sitePermissions.siteId, input.id));

        // Delete site
        await ctx.db
          .delete(sites)
          .where(eq(sites.id, input.id));

        return {
          message: 'Site deleted successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Site deletion error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete site',
        });
      }
    }),

  // Get site users and their permissions (admin only)
  getSiteUsers: adminProcedure
    .input(z.object({ siteId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const siteUsers = await ctx.db
          .select({
            userId: sitePermissions.userId,
            userName: users.name,
            userEmail: users.email,
            userRole: users.role,
            canView: sitePermissions.canView,
            canUpload: sitePermissions.canUpload,
            grantedAt: sitePermissions.createdAt,
          })
          .from(sitePermissions)
          .innerJoin(users, eq(users.id, sitePermissions.userId))
          .where(
            and(
              eq(sitePermissions.siteId, input.siteId),
              eq(users.isActive, true)
            )
          )
          .orderBy(users.name);

        return siteUsers;
      } catch (error) {
        console.error('Get site users error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get site users',
        });
      }
    }),

  // Get users not assigned to a site (admin only)
  getUnassignedUsers: adminProcedure
    .input(z.object({ siteId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        // Get all active users
        const allUsers = await ctx.db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(eq(users.isActive, true))
          .orderBy(users.name);

        // Get users already assigned to this site
        const assignedUsers = await ctx.db
          .select({
            userId: sitePermissions.userId,
          })
          .from(sitePermissions)
          .where(eq(sitePermissions.siteId, input.siteId));

        const assignedUserIds = new Set(assignedUsers.map(u => u.userId));

        // Filter out assigned users
        const unassignedUsers = allUsers.filter(user => !assignedUserIds.has(user.id));

        return unassignedUsers;
      } catch (error) {
        console.error('Get unassigned users error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get unassigned users',
        });
      }
    }),

  // Grant site access to user (admin only)
  grantSiteAccess: adminProcedure
    .input(
      z.object({
        siteId: z.string(),
        userId: z.string(),
        canView: z.boolean().default(true),
        canUpload: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Check if permission already exists
        const [existing] = await ctx.db
          .select()
          .from(sitePermissions)
          .where(
            and(
              eq(sitePermissions.userId, input.userId),
              eq(sitePermissions.siteId, input.siteId)
            )
          )
          .limit(1);

        if (existing) {
          // Update existing permission
          await ctx.db
            .update(sitePermissions)
            .set({
              canView: input.canView,
              canUpload: input.canUpload,
            })
            .where(eq(sitePermissions.id, existing.id));
        } else {
          // Create new permission
          await ctx.db.insert(sitePermissions).values({
            id: nanoid(),
            userId: input.userId,
            siteId: input.siteId,
            canView: input.canView,
            canUpload: input.canUpload,
            createdAt: new Date(),
          });
        }

        return {
          message: 'Site access granted successfully',
        };
      } catch (error) {
        console.error('Grant site access error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to grant site access',
        });
      }
    }),

  // Revoke site access from user (admin only)
  revokeSiteAccess: adminProcedure
    .input(
      z.object({
        siteId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.db
          .delete(sitePermissions)
          .where(
            and(
              eq(sitePermissions.userId, input.userId),
              eq(sitePermissions.siteId, input.siteId)
            )
          );

        return {
          message: 'Site access revoked successfully',
        };
      } catch (error) {
        console.error('Revoke site access error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revoke site access',
        });
      }
    }),

  // Update user permissions for a site (admin only)
  updateUserPermissions: adminProcedure
    .input(
      z.object({
        siteId: z.string(),
        userId: z.string(),
        canView: z.boolean(),
        canUpload: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.db
          .update(sitePermissions)
          .set({
            canView: input.canView,
            canUpload: input.canUpload,
          })
          .where(
            and(
              eq(sitePermissions.userId, input.userId),
              eq(sitePermissions.siteId, input.siteId)
            )
          );

        return {
          message: 'User permissions updated successfully',
        };
      } catch (error) {
        console.error('Update user permissions error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user permissions',
        });
      }
    }),

  // Get site activity (recent uploads, etc.)
  getSiteActivity: protectedProcedure
    .input(
      z.object({
        siteId: z.string(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // Check if user can view this site
      const canView = await canViewSite(ctx.user.id, input.siteId);
      if (!canView && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this site',
        });
      }

      try {
        const activities = await ctx.db
          .select({
            fileId: files.id,
            filename: files.filename,
            originalName: files.originalName,
            category: files.category,
            size: files.size,
            mimeType: files.mimeType,
            uploadedBy: files.uploadedBy,
            uploaderName: users.name,
            createdAt: files.createdAt,
          })
          .from(files)
          .innerJoin(users, eq(users.id, files.uploadedBy))
          .where(eq(files.siteId, input.siteId))
          .orderBy(desc(files.createdAt))
          .limit(input.limit);

        return activities;
      } catch (error) {
        console.error('Get site activity error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get site activity',
        });
      }
    }),
});