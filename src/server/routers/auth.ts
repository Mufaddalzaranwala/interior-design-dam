import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../trpc';
import { login, createUser, updateUserPassword, getCurrentUser, logout } from '../../lib/auth';
import { setAuthCookie, clearAuthCookie } from '../../lib/auth';

export const authRouter = createTRPCRouter({
  // Login procedure
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email('Invalid email format'),
        password: z.string().min(1, 'Password is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await login(input.email, input.password);
        
        if (!result) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid email or password',
          });
        }

        // Set HTTP-only cookie
        await setAuthCookie(result.token);

        return {
          user: result.user,
          message: 'Login successful',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        
        console.error('Login error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Login failed',
        });
      }
    }),

  // Logout procedure
  logout: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        clearAuthCookie();
        
        return {
          message: 'Logout successful',
        };
      } catch (error) {
        console.error('Logout error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Logout failed',
        });
      }
    }),

  // Get current user procedure
  me: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.user;
    }),

  // Register procedure (admin only, for creating new employees)
  register: protectedProcedure
    .input(
      z.object({
        email: z.string().email('Invalid email format'),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        name: z.string().min(1, 'Name is required'),
        role: z.enum(['admin', 'employee']).default('employee'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can create new users
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can create new users',
        });
      }

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

        console.error('Registration error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed',
        });
      }
    }),

  // Change password procedure
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string().min(8, 'New password must be at least 8 characters'),
        confirmPassword: z.string().min(1, 'Password confirmation is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.newPassword !== input.confirmPassword) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'New password and confirmation do not match',
        });
      }

      try {
        // First verify current password
        const loginResult = await login(ctx.user.email, input.currentPassword);
        if (!loginResult) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Current password is incorrect',
          });
        }

        // Update password
        const success = await updateUserPassword(ctx.user.id, input.newPassword);
        if (!success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update password',
          });
        }

        return {
          message: 'Password updated successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error('Password change error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Password change failed',
        });
      }
    }),

  // Check authentication status
  checkAuth: publicProcedure
    .query(async ({ ctx }) => {
      try {
        const user = await getCurrentUser();
        return {
          isAuthenticated: !!user,
          user: user || null,
        };
      } catch (error) {
        return {
          isAuthenticated: false,
          user: null,
        };
      }
    }),

  // Reset password (admin only)
  resetUserPassword: protectedProcedure
    .input(
      z.object({
        userId: z.string().min(1, 'User ID is required'),
        newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can reset other users' passwords
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only administrators can reset user passwords',
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

        console.error('Password reset error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Password reset failed',
        });
      }
    }),

  // Validate session
  validateSession: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        valid: true,
        user: ctx.user,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };
    }),
});