import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '../trpc';
import { users, sitePermissions, files, sites } from '../../../database/schema';
import { createUser, updateUserPassword, deactivateUser } from '../../lib/auth';
import { getUserSitePermissions } from '../../lib/permissions';

export const usersRouter = createTRPCRouter({
  // Get all users (admin only)
  getUsers: adminProcedure
    .input(
      z.object({
        includeInactive: z.boolean().default(false),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const conditions = input.includeInactive ? [] : [eq(users.isActive, true)];

        // Get total count
        const [countResult] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(conditions.length > 0 ? and(...conditions) : undefined);

        const total = countResult?.count || 0;

        // Get users
        const userResults = await ctx.db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(users.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit);

        // Get additional stats for each user
        const usersWithStats = await Promise.all(
          userResults.map(async (user) => {
            // Get site count
            const [siteCount] = await ctx.db
              .select({ count: sql<number>`count(distinct ${sitePermissions.siteId})` })
              .from(sitePermissions)
              .where(eq(sitePermissions.userId, user.id));

            // Get upload count
            const [uploadCount] = await ctx.db
              .select({ count: sql<number>`count(*)` })
              .from(files)
              .where(eq(files.uploadedBy, user.id));

            return {
              ...user,
              siteCount: siteCount?.count || 0,
              uploadCount: uploadCount?.count || 0,
            };
          })
        );

        return {
          users: usersWithStats,
          total,
          page: input.page,
          limit: input.limit,
        };
      } catch (error) {
        console.error('Get users error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get users',
        });
      }
    }),

  // Get specific user (admin only)
  getUser: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const [user] = await ctx.db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Get user's site permissions
        const permissions = await getUserSitePermissions(input.id);

        // Get user's upload statistics
        const [uploadStats] = await ctx.db
          .select({
            totalUploads: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .where(eq(files.uploadedBy, input.id));

        // Get uploads by category
        const categoryUploads = await ctx.db
          .select({
            category: files.category,
            count: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .where(eq(files.uploadedBy, input.id))
          .groupBy(files.category);

        // Get recent uploads
        const recentUploads = await ctx.db
          .select({
            id: files.id,
            filename: files.filename,
            originalName: files.originalName,
            size: files.size,
            category: files.category,
            siteId: files.siteId,
            siteName: sites.name,
            createdAt: files.createdAt,
          })
          .from(files)
          .innerJoin(sites, eq(sites.id, files.siteId))
          .where(eq(files.uploadedBy, input.id))
          .orderBy(desc(files.createdAt))
          .limit(10);

        return {
          ...user,
          sitePermissions: permissions,
          stats: {
            totalUploads: uploadStats?.totalUploads || 0,
            totalSize: uploadStats?.totalSize || 0,
          },
          categoryUploads: categoryUploads.reduce((acc, stat) => {
            acc[stat.category] = {
              count: stat.count,
              size: stat.totalSize || 0,
            };
            return acc;
          }, {} as Record<string, { count: number; size: number }>),
          recentUploads,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Get user error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get user',
        });
      }
    }),

  // Create new user (admin only)
  createUser: adminProcedure
    .input(
      z.object({
        email: z.string().email('Invalid email format'),
        name: z.string().min(1, 'Name is required'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        role: z.enum(['admin', 'employee']).default('employee'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const newUser = await createUser(
          input.email,
          input.password,
          input.name,
          input.role
        );

        if (!newUser) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Failed to create user. Email may already exist.',
          });
        }

        return {
          user: newUser,
          message: 'User created successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Create user error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create user',
        });
      }
    }),

  // Update user (admin only)
  updateUser: adminProcedure
    .input(
      z.object({
        id: z.string(),
        email: z.string().email('Invalid email format').optional(),
        name: z.string().min(1, 'Name is required').optional(),
        role: z.enum(['admin', 'employee']).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [existingUser] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      if (!existingUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Prevent admin from deactivating themselves
      if (input.isActive === false && input.id === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot deactivate your own account',
        });
      }

      // Prevent changing the last admin's role
      if (input.role === 'employee' && existingUser.role === 'admin') {
        const [adminCount] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(
            and(
              eq(users.role, 'admin'),
              eq(users.isActive, true),
              ne(users.id, input.id)
            )
          );

        if (!adminCount || adminCount.count === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot change role of the last admin user',
          });
        }
      }

      try {
        const updateData: any = {
          updatedAt: new Date(),
        };

        if (input.email !== undefined) {
          // Check if email is already in use
          const [emailExists] = await ctx.db
            .select()
            .from(users)
            .where(
              and(
                eq(users.email, input.email.toLowerCase()),
                ne(users.id, input.id)
              )
            )
            .limit(1);

          if (emailExists) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Email is already in use',
            });
          }

          updateData.email = input.email.toLowerCase();
        }

        if (input.name !== undefined) {
          updateData.name = input.name;
        }

        if (input.role !== undefined) {
          updateData.role = input.role;
        }

        if (input.isActive !== undefined) {
          updateData.isActive = input.isActive;
        }

        await ctx.db
          .update(users)
          .set(updateData)
          .where(eq(users.id, input.id));

        return {
          message: 'User updated successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Update user error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user',
        });
      }
    }),

  // Reset user password (admin only)
  resetPassword: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [existingUser] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!existingUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      try {
        const success = await updateUserPassword(input.userId, input.newPassword);
        if (!success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to reset password',
          });
        }

        return {
          message: 'Password reset successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Reset password error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset password',
        });
      }
    }),

  // Deactivate user (admin only)
  deactivateUser: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot deactivate your own account',
        });
      }

      const [existingUser] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      if (!existingUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Prevent deactivating the last admin
      if (existingUser.role === 'admin') {
        const [adminCount] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(
            and(
              eq(users.role, 'admin'),
              eq(users.isActive, true),
              ne(users.id, input.id)
            )
          );

        if (!adminCount || adminCount.count === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot deactivate the last admin user',
          });
        }
      }

      try {
        const success = await deactivateUser(input.id);
        if (!success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to deactivate user',
          });
        }

        return {
          message: 'User deactivated successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Deactivate user error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to deactivate user',
        });
      }
    }),

  // Get current user profile
  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const [user] = await ctx.db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
          })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);

        if (!user) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Get user's site permissions
        const permissions = await getUserSitePermissions(ctx.user.id);

        // Get user's upload statistics
        const [uploadStats] = await ctx.db
          .select({
            totalUploads: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .where(eq(files.uploadedBy, ctx.user.id));

        return {
          ...user,
          sitePermissions: permissions,
          stats: {
            totalUploads: uploadStats?.totalUploads || 0,
            totalSize: uploadStats?.totalSize || 0,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Get profile error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get profile',
        });
      }
    }),

  // Update current user profile
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, 'Name is required').optional(),
        email: z.string().email('Invalid email format').optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const updateData: any = {
          updatedAt: new Date(),
        };

        if (input.email !== undefined) {
          // Check if email is already in use
          const [emailExists] = await ctx.db
            .select()
            .from(users)
            .where(
              and(
                eq(users.email, input.email.toLowerCase()),
                ne(users.id, ctx.user.id)
              )
            )
            .limit(1);

          if (emailExists) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Email is already in use',
            });
          }

          updateData.email = input.email.toLowerCase();
        }

        if (input.name !== undefined) {
          updateData.name = input.name;
        }

        await ctx.db
          .update(users)
          .set(updateData)
          .where(eq(users.id, ctx.user.id));

        return {
          message: 'Profile updated successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Update profile error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update profile',
        });
      }
    }),

  // Get user statistics (admin only)
  getUserStats: adminProcedure
    .query(async ({ ctx }) => {
      try {
        // Get total user counts
        const [userCounts] = await ctx.db
          .select({
            total: sql<number>`count(*)`,
            active: sql<number>`sum(case when ${users.isActive} then 1 else 0 end)`,
            admins: sql<number>`sum(case when ${users.role} = 'admin' and ${users.isActive} then 1 else 0 end)`,
            employees: sql<number>`sum(case when ${users.role} = 'employee' and ${users.isActive} then 1 else 0 end)`,
          })
          .from(users);

        // Get recent registrations
        const recentUsers = await ctx.db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.isActive, true))
          .orderBy(desc(users.createdAt))
          .limit(10);

        // Get user activity (upload counts)
        const userActivity = await ctx.db
          .select({
            userId: files.uploadedBy,
            userName: users.name,
            uploadCount: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${files.size})`,
          })
          .from(files)
          .innerJoin(users, eq(users.id, files.uploadedBy))
          .groupBy(files.uploadedBy, users.name)
          .orderBy(sql`count(*) DESC`)
          .limit(10);

        return {
          counts: userCounts || {
            total: 0,
            active: 0,
            admins: 0,
            employees: 0,
          },
          recentUsers,
          topUploaders: userActivity,
        };
      } catch (error) {
        console.error('Get user stats error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get user statistics',
        });
      }
    }),
});