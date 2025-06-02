import { useState, useCallback, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import type { SiteWithStats, SiteUser, PermissionRequest } from '../types';

interface UseSitesOptions {
  includeStats?: boolean;
  autoRefresh?: boolean;
}

export const useSites = (options: UseSitesOptions = {}) => {
  const { includeStats = true, autoRefresh = false } = options;

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  // Get all sites accessible to the user
  const { 
    data: sites, 
    isLoading, 
    error, 
    refetch: refetchSites 
  } = trpc.sites.getSites.useQuery(undefined, {
    refetchOnWindowFocus: autoRefresh,
    refetchInterval: autoRefresh ? 30000 : false, // 30 seconds if auto-refresh
  });

  // Get specific site details
  const { 
    data: selectedSite, 
    isLoading: isLoadingSite,
    refetch: refetchSite 
  } = trpc.sites.getSite.useQuery(
    { id: selectedSiteId! },
    {
      enabled: !!selectedSiteId,
      refetchOnWindowFocus: false,
    }
  );

  // Create site mutation (admin only)
  const createSiteMutation = trpc.sites.createSite.useMutation({
    onSuccess: () => {
      refetchSites();
    },
  });

  // Update site mutation (admin only)
  const updateSiteMutation = trpc.sites.updateSite.useMutation({
    onSuccess: () => {
      refetchSites();
      if (selectedSiteId) {
        refetchSite();
      }
    },
  });

  // Delete site mutation (admin only)
  const deleteSiteMutation = trpc.sites.deleteSite.useMutation({
    onSuccess: () => {
      refetchSites();
      if (selectedSiteId) {
        setSelectedSiteId(null);
      }
    },
  });

  // Create new site
  const createSite = useCallback(async (siteData: {
    name: string;
    description?: string;
    clientName: string;
  }) => {
    return createSiteMutation.mutateAsync(siteData);
  }, [createSiteMutation]);

  // Update existing site
  const updateSite = useCallback(async (siteId: string, updates: {
    name?: string;
    description?: string;
    clientName?: string;
    isActive?: boolean;
  }) => {
    return updateSiteMutation.mutateAsync({ id: siteId, ...updates });
  }, [updateSiteMutation]);

  // Delete site
  const deleteSite = useCallback(async (siteId: string) => {
    return deleteSiteMutation.mutateAsync({ id: siteId });
  }, [deleteSiteMutation]);

  // Select a site for detailed view
  const selectSite = useCallback((siteId: string | null) => {
    setSelectedSiteId(siteId);
  }, []);

  // Get sites where user can upload
  const uploadableSites = useMemo(() => {
    return sites?.filter(site => site.canUpload) || [];
  }, [sites]);

  // Get sites where user can only view
  const viewOnlySites = useMemo(() => {
    return sites?.filter(site => site.canView && !site.canUpload) || [];
  }, [sites]);

  // Get site statistics
  const siteStats = useMemo(() => {
    if (!sites) return null;

    const totalSites = sites.length;
    const totalFiles = sites.reduce((sum, site) => sum + site.fileCount, 0);
    const uploadableSitesCount = uploadableSites.length;
    const viewOnlySitesCount = viewOnlySites.length;

    return {
      totalSites,
      totalFiles,
      uploadableSitesCount,
      viewOnlySitesCount,
      averageFilesPerSite: totalSites > 0 ? Math.round(totalFiles / totalSites) : 0,
    };
  }, [sites, uploadableSites, viewOnlySites]);

  // Find site by ID
  const findSiteById = useCallback((siteId: string) => {
    return sites?.find(site => site.id === siteId);
  }, [sites]);

  // Check if user can upload to specific site
  const canUploadToSite = useCallback((siteId: string) => {
    const site = findSiteById(siteId);
    return site?.canUpload || false;
  }, [findSiteById]);

  // Check if user can view specific site
  const canViewSite = useCallback((siteId: string) => {
    const site = findSiteById(siteId);
    return site?.canView || false;
  }, [findSiteById]);

  // Refresh sites data
  const refresh = useCallback(() => {
    refetchSites();
    if (selectedSiteId) {
      refetchSite();
    }
  }, [refetchSites, refetchSite, selectedSiteId]);

  return {
    // Data
    sites: sites || [],
    selectedSite,
    uploadableSites,
    viewOnlySites,
    siteStats,
    
    // State
    isLoading: isLoading || (selectedSiteId && isLoadingSite),
    error: error?.message,
    selectedSiteId,
    
    // Actions
    createSite,
    updateSite,
    deleteSite,
    selectSite,
    refresh,
    
    // Utilities
    findSiteById,
    canUploadToSite,
    canViewSite,
    hasSites: sites && sites.length > 0,
    hasUploadableSites: uploadableSites.length > 0,
    
    // Mutation states
    isCreating: createSiteMutation.isLoading,
    isUpdating: updateSiteMutation.isLoading,
    isDeleting: deleteSiteMutation.isLoading,
    
    // Mutation errors
    createError: createSiteMutation.error?.message,
    updateError: updateSiteMutation.error?.message,
    deleteError: deleteSiteMutation.error?.message,
  };
};

// Hook for managing site users and permissions (admin only)
export const useSitePermissions = (siteId: string) => {
  // Get site users
  const { 
    data: siteUsers, 
    isLoading: isLoadingUsers,
    refetch: refetchUsers 
  } = trpc.sites.getSiteUsers.useQuery(
    { siteId },
    {
      enabled: !!siteId,
      refetchOnWindowFocus: false,
    }
  );

  // Get unassigned users
  const { 
    data: unassignedUsers, 
    isLoading: isLoadingUnassigned,
    refetch: refetchUnassigned 
  } = trpc.sites.getUnassignedUsers.useQuery(
    { siteId },
    {
      enabled: !!siteId,
      refetchOnWindowFocus: false,
    }
  );

  // Grant site access mutation
  const grantAccessMutation = trpc.sites.grantSiteAccess.useMutation({
    onSuccess: () => {
      refetchUsers();
      refetchUnassigned();
    },
  });

  // Revoke site access mutation
  const revokeAccessMutation = trpc.sites.revokeSiteAccess.useMutation({
    onSuccess: () => {
      refetchUsers();
      refetchUnassigned();
    },
  });

  // Update user permissions mutation
  const updatePermissionsMutation = trpc.sites.updateUserPermissions.useMutation({
    onSuccess: () => {
      refetchUsers();
    },
  });

  // Grant access to user
  const grantAccess = useCallback(async (request: PermissionRequest) => {
    return grantAccessMutation.mutateAsync(request);
  }, [grantAccessMutation]);

  // Revoke access from user
  const revokeAccess = useCallback(async (userId: string) => {
    return revokeAccessMutation.mutateAsync({ siteId, userId });
  }, [revokeAccessMutation, siteId]);

  // Update user permissions
  const updatePermissions = useCallback(async (request: PermissionRequest) => {
    return updatePermissionsMutation.mutateAsync(request);
  }, [updatePermissionsMutation]);

  // Bulk grant access to multiple users
  const bulkGrantAccess = useCallback(async (userIds: string[], permissions: {
    canView: boolean;
    canUpload: boolean;
  }) => {
    const promises = userIds.map(userId =>
      grantAccessMutation.mutateAsync({
        siteId,
        userId,
        ...permissions,
      })
    );

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Refresh data
    refetchUsers();
    refetchUnassigned();

    return { successful, failed, total: userIds.length };
  }, [grantAccessMutation, siteId, refetchUsers, refetchUnassigned]);

  // Get permission statistics
  const permissionStats = useMemo(() => {
    if (!siteUsers) return null;

    const totalUsers = siteUsers.length;
    const viewOnlyUsers = siteUsers.filter(u => u.canView && !u.canUpload).length;
    const uploadUsers = siteUsers.filter(u => u.canUpload).length;
    const adminUsers = siteUsers.filter(u => u.userRole === 'admin').length;
    const employeeUsers = siteUsers.filter(u => u.userRole === 'employee').length;

    return {
      totalUsers,
      viewOnlyUsers,
      uploadUsers,
      adminUsers,
      employeeUsers,
      uploadPercentage: totalUsers > 0 ? Math.round((uploadUsers / totalUsers) * 100) : 0,
    };
  }, [siteUsers]);

  // Find user in site
  const findSiteUser = useCallback((userId: string) => {
    return siteUsers?.find(user => user.userId === userId);
  }, [siteUsers]);

  // Check if user has specific permissions
  const userHasPermission = useCallback((userId: string, permission: 'view' | 'upload') => {
    const user = findSiteUser(userId);
    if (!user) return false;
    
    return permission === 'view' ? user.canView : user.canUpload;
  }, [findSiteUser]);

  return {
    // Data
    siteUsers: siteUsers || [],
    unassignedUsers: unassignedUsers || [],
    permissionStats,
    
    // State
    isLoading: isLoadingUsers || isLoadingUnassigned,
    
    // Actions
    grantAccess,
    revokeAccess,
    updatePermissions,
    bulkGrantAccess,
    
    // Utilities
    findSiteUser,
    userHasPermission,
    hasUsers: siteUsers && siteUsers.length > 0,
    hasUnassignedUsers: unassignedUsers && unassignedUsers.length > 0,
    
    // Mutation states
    isGranting: grantAccessMutation.isLoading,
    isRevoking: revokeAccessMutation.isLoading,
    isUpdating: updatePermissionsMutation.isLoading,
    
    // Errors
    grantError: grantAccessMutation.error?.message,
    revokeError: revokeAccessMutation.error?.message,
    updateError: updatePermissionsMutation.error?.message,
  };
};

// Hook for site activity
export const useSiteActivity = (siteId: string, limit: number = 20) => {
  const { 
    data: activity, 
    isLoading, 
    error, 
    refetch 
  } = trpc.sites.getSiteActivity.useQuery(
    { siteId, limit },
    {
      enabled: !!siteId,
      refetchOnWindowFocus: false,
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  );

  return {
    activity: activity || [],
    isLoading,
    error: error?.message,
    refetch,
    hasActivity: activity && activity.length > 0,
  };
};

export default useSites;