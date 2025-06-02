import { db } from './db';
import { sitePermissions, sites, users } from '../../database/schema';
import { eq, and, inArray } from 'drizzle-orm';
import type { AuthUser } from './auth';

export interface SitePermission {
  siteId: string;
  siteName: string;
  canView: boolean;
  canUpload: boolean;
}

export interface UserSiteAccess {
  userId: string;
  sitePermissions: SitePermission[];
  accessibleSiteIds: string[];
}

// Get user's site permissions
export const getUserSitePermissions = async (userId: string): Promise<SitePermission[]> => {
  try {
    const permissions = await db
      .select({
        siteId: sitePermissions.siteId,
        siteName: sites.name,
        canView: sitePermissions.canView,
        canUpload: sitePermissions.canUpload,
      })
      .from(sitePermissions)
      .innerJoin(sites, eq(sites.id, sitePermissions.siteId))
      .where(
        and(
          eq(sitePermissions.userId, userId),
          eq(sites.isActive, true)
        )
      );

    return permissions;
  } catch (error) {
    console.error('Failed to get user site permissions:', error);
    return [];
  }
};

// Get sites accessible to user (with view permission)
export const getAccessibleSites = async (userId: string, requireUpload: boolean = false): Promise<string[]> => {
  try {
    const permissions = await db
      .select({
        siteId: sitePermissions.siteId,
      })
      .from(sitePermissions)
      .innerJoin(sites, eq(sites.id, sitePermissions.siteId))
      .where(
        and(
          eq(sitePermissions.userId, userId),
          eq(sites.isActive, true),
          eq(sitePermissions.canView, true),
          requireUpload ? eq(sitePermissions.canUpload, true) : undefined
        )
      );

    return permissions.map(p => p.siteId);
  } catch (error) {
    console.error('Failed to get accessible sites:', error);
    return [];
  }
};

// Check if user can view a specific site
export const canViewSite = async (userId: string, siteId: string): Promise<boolean> => {
  try {
    const [permission] = await db
      .select({
        canView: sitePermissions.canView,
      })
      .from(sitePermissions)
      .innerJoin(sites, eq(sites.id, sitePermissions.siteId))
      .where(
        and(
          eq(sitePermissions.userId, userId),
          eq(sitePermissions.siteId, siteId),
          eq(sites.isActive, true)
        )
      )
      .limit(1);

    return permission?.canView || false;
  } catch (error) {
    console.error('Failed to check view permission:', error);
    return false;
  }
};

// Check if user can upload to a specific site
export const canUploadToSite = async (userId: string, siteId: string): Promise<boolean> => {
  try {
    const [permission] = await db
      .select({
        canView: sitePermissions.canView,
        canUpload: sitePermissions.canUpload,
      })
      .from(sitePermissions)
      .innerJoin(sites, eq(sites.id, sitePermissions.siteId))
      .where(
        and(
          eq(sitePermissions.userId, userId),
          eq(sitePermissions.siteId, siteId),
          eq(sites.isActive, true)
        )
      )
      .limit(1);

    return permission?.canView && permission?.canUpload || false;
  } catch (error) {
    console.error('Failed to check upload permission:', error);
    return false;
  }
};

// Grant site access to user
export const grantSiteAccess = async (
  userId: string,
  siteId: string,
  canView: boolean = true,
  canUpload: boolean = false
): Promise<boolean> => {
  try {
    // Check if permission already exists
    const [existing] = await db
      .select()
      .from(sitePermissions)
      .where(
        and(
          eq(sitePermissions.userId, userId),
          eq(sitePermissions.siteId, siteId)
        )
      )
      .limit(1);

    if (existing) {
      // Update existing permission
      await db
        .update(sitePermissions)
        .set({
          canView,
          canUpload,
        })
        .where(eq(sitePermissions.id, existing.id));
    } else {
      // Create new permission
      await db.insert(sitePermissions).values({
        id: `perm_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        userId,
        siteId,
        canView,
        canUpload,
        createdAt: new Date(),
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to grant site access:', error);
    return false;
  }
};

// Revoke site access from user
export const revokeSiteAccess = async (userId: string, siteId: string): Promise<boolean> => {
  try {
    await db
      .delete(sitePermissions)
      .where(
        and(
          eq(sitePermissions.userId, userId),
          eq(sitePermissions.siteId, siteId)
        )
      );

    return true;
  } catch (error) {
    console.error('Failed to revoke site access:', error);
    return false;
  }
};

// Update user's upload permission for a site
export const updateUploadPermission = async (
  userId: string,
  siteId: string,
  canUpload: boolean
): Promise<boolean> => {
  try {
    await db
      .update(sitePermissions)
      .set({ canUpload })
      .where(
        and(
          eq(sitePermissions.userId, userId),
          eq(sitePermissions.siteId, siteId)
        )
      );

    return true;
  } catch (error) {
    console.error('Failed to update upload permission:', error);
    return false;
  }
};

// Get all users with access to a site
export const getSiteUsers = async (siteId: string): Promise<Array<{
  userId: string;
  userName: string;
  userEmail: string;
  canView: boolean;
  canUpload: boolean;
}>> => {
  try {
    const siteUsers = await db
      .select({
        userId: sitePermissions.userId,
        userName: users.name,
        userEmail: users.email,
        canView: sitePermissions.canView,
        canUpload: sitePermissions.canUpload,
      })
      .from(sitePermissions)
      .innerJoin(users, eq(users.id, sitePermissions.userId))
      .where(
        and(
          eq(sitePermissions.siteId, siteId),
          eq(users.isActive, true)
        )
      );

    return siteUsers;
  } catch (error) {
    console.error('Failed to get site users:', error);
    return [];
  }
};

// Filter files by user permissions
export const filterFilesBySiteAccess = async (
  userId: string,
  fileResults: Array<{ siteId: string; [key: string]: any }>
): Promise<Array<{ siteId: string; [key: string]: any }>> => {
  try {
    if (fileResults.length === 0) {
      return [];
    }

    const uniqueSiteIds = [...new Set(fileResults.map(f => f.siteId))];
    const accessibleSiteIds = await getAccessibleSites(userId);
    const allowedSiteIds = new Set(accessibleSiteIds);

    return fileResults.filter(file => allowedSiteIds.has(file.siteId));
  } catch (error) {
    console.error('Failed to filter files by site access:', error);
    return [];
  }
};

// Bulk grant permissions to multiple users for a site
export const bulkGrantSiteAccess = async (
  userIds: string[],
  siteId: string,
  canView: boolean = true,
  canUpload: boolean = false
): Promise<{ success: number; failed: number }> => {
  let success = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const granted = await grantSiteAccess(userId, siteId, canView, canUpload);
      if (granted) {
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`Failed to grant access for user ${userId}:`, error);
      failed++;
    }
  }

  return { success, failed };
};

// Middleware function for API route protection
export const requireSiteAccess = (
  user: AuthUser,
  siteId: string,
  requireUpload: boolean = false
) => {
  return async (): Promise<boolean> => {
    // Admin always has access
    if (user.role === 'admin') {
      return true;
    }

    return requireUpload 
      ? await canUploadToSite(user.id, siteId)
      : await canViewSite(user.id, siteId);
  };
};

// Get user's complete access summary
export const getUserAccessSummary = async (userId: string): Promise<UserSiteAccess> => {
  try {
    const permissions = await getUserSitePermissions(userId);
    const accessibleSiteIds = permissions
      .filter(p => p.canView)
      .map(p => p.siteId);

    return {
      userId,
      sitePermissions: permissions,
      accessibleSiteIds,
    };
  } catch (error) {
    console.error('Failed to get user access summary:', error);
    return {
      userId,
      sitePermissions: [],
      accessibleSiteIds: [],
    };
  }
};

// Check if user has any site access
export const hasAnySiteAccess = async (userId: string): Promise<boolean> => {
  try {
    const [permission] = await db
      .select({
        count: sitePermissions.id,
      })
      .from(sitePermissions)
      .innerJoin(sites, eq(sites.id, sitePermissions.siteId))
      .where(
        and(
          eq(sitePermissions.userId, userId),
          eq(sitePermissions.canView, true),
          eq(sites.isActive, true)
        )
      )
      .limit(1);

    return !!permission;
  } catch (error) {
    console.error('Failed to check site access:', error);
    return false;
  }
};

// Get permission statistics for admin dashboard
export const getPermissionStats = async (): Promise<{
  totalUsersWithAccess: number;
  totalSitesWithUsers: number;
  averageUsersPerSite: number;
  usersWithUploadAccess: number;
}> => {
  try {
    const [stats] = await db
      .select({
        totalPermissions: sitePermissions.id,
      })
      .from(sitePermissions)
      .innerJoin(users, eq(users.id, sitePermissions.userId))
      .innerJoin(sites, eq(sites.id, sitePermissions.siteId))
      .where(
        and(
          eq(users.isActive, true),
          eq(sites.isActive, true),
          eq(sitePermissions.canView, true)
        )
      );

    // Get unique counts
    const uniqueUsers = await db
      .selectDistinct({
        userId: sitePermissions.userId,
      })
      .from(sitePermissions)
      .innerJoin(users, eq(users.id, sitePermissions.userId))
      .where(
        and(
          eq(users.isActive, true),
          eq(sitePermissions.canView, true)
        )
      );

    const uniqueSites = await db
      .selectDistinct({
        siteId: sitePermissions.siteId,
      })
      .from(sitePermissions)
      .innerJoin(sites, eq(sites.id, sitePermissions.siteId))
      .where(
        and(
          eq(sites.isActive, true),
          eq(sitePermissions.canView, true)
        )
      );

    const uploadUsers = await db
      .selectDistinct({
        userId: sitePermissions.userId,
      })
      .from(sitePermissions)
      .innerJoin(users, eq(users.id, sitePermissions.userId))
      .where(
        and(
          eq(users.isActive, true),
          eq(sitePermissions.canView, true),
          eq(sitePermissions.canUpload, true)
        )
      );

    const totalUsersWithAccess = uniqueUsers.length;
    const totalSitesWithUsers = uniqueSites.length;
    const averageUsersPerSite = totalSitesWithUsers > 0 
      ? Math.round((stats?.totalPermissions || 0) / totalSitesWithUsers * 100) / 100
      : 0;
    const usersWithUploadAccess = uploadUsers.length;

    return {
      totalUsersWithAccess,
      totalSitesWithUsers,
      averageUsersPerSite,
      usersWithUploadAccess,
    };
  } catch (error) {
    console.error('Failed to get permission stats:', error);
    return {
      totalUsersWithAccess: 0,
      totalSitesWithUsers: 0,
      averageUsersPerSite: 0,
      usersWithUploadAccess: 0,
    };
  }
};

export default {
  getUserSitePermissions,
  getAccessibleSites,
  canViewSite,
  canUploadToSite,
  grantSiteAccess,
  revokeSiteAccess,
  updateUploadPermission,
  getSiteUsers,
  filterFilesBySiteAccess,
  bulkGrantSiteAccess,
  requireSiteAccess,
  getUserAccessSummary,
  hasAnySiteAccess,
  getPermissionStats,
};