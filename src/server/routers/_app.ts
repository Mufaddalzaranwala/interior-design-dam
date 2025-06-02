import { createTRPCRouter } from '../trpc';
import { authRouter } from './auth';
import { filesRouter } from './files';
import { searchRouter } from './search';
import { sitesRouter } from './sites';
import { usersRouter } from './users';
import { adminRouter } from './admin';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  files: filesRouter,
  search: searchRouter,
  sites: sitesRouter,
  users: usersRouter,
  admin: adminRouter,
});

// Export type definition of API
export type AppRouter = typeof appRouter;