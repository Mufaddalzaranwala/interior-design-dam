import { initTRPC, TRPCError } from '@trpc/server';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { ZodError } from 'zod';
import superjson from 'superjson';
import { db } from '../lib/db';
import { getCurrentUser, type AuthUser } from '../lib/auth';

// Create context for tRPC requests
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts;

  // Get the session from the server
  const user = await getCurrentUser();

  return {
    db,
    user,
    req,
    res,
  };
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// Initialize tRPC
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// Export reusable router and procedure helpers
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// Auth middleware
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user || !ctx.user.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user as AuthUser,
    },
  });
});

// Admin middleware
const enforceUserIsAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user as AuthUser,
    },
  });
});

// Protected procedure that requires authentication
export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

// Admin procedure that requires admin role
export const adminProcedure = t.procedure.use(enforceUserIsAdmin);

// Rate limiting middleware
const rateLimitMiddleware = t.middleware(async ({ ctx, next, path }) => {
  // Simple in-memory rate limiting (in production, use Redis)
  const key = `${ctx.user?.id || 'anonymous'}:${path}`;
  
  // For now, we'll skip rate limiting in development
  // In production, implement proper rate limiting here
  
  return next();
});

// Rate limited procedure
export const rateLimitedProcedure = t.procedure.use(rateLimitMiddleware);

// Logging middleware
const loggingMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  
  const result = await next();
  
  const durationMs = Date.now() - start;
  const level = result.ok ? 'info' : 'error';
  
  console.log(`[tRPC] ${level.toUpperCase()} ${type} ${path} - ${durationMs}ms`);
  
  return result;
});

// Logged procedure
export const loggedProcedure = t.procedure.use(loggingMiddleware);

// Combined protected + logged procedure
export const protectedLoggedProcedure = protectedProcedure.use(loggingMiddleware);

// Combined admin + logged procedure
export const adminLoggedProcedure = adminProcedure.use(loggingMiddleware);