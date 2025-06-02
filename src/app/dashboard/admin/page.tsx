'use client';

import React, { useState } from 'react';
import { 
  BarChart3, 
  Users, 
  Building, 
  Files, 
  HardDrive, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  Activity,
  Zap,
  Shield,
  Database,
  Server,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Navigation, MobileNavigation } from '@/components/Navigation';
import { useRequireAdmin } from '@/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { formatFileSize, formatNumber, formatDate, cn } from '@/lib/utils';

export default function AdminDashboardPage() {
  useRequireAdmin();
  
  const [refreshing, setRefreshing] = useState(false);

  // Fetch admin data
  const { 
    data: systemOverview, 
    isLoading: overviewLoading,
    refetch: refetchOverview 
  } = trpc.admin.getSystemOverview.useQuery();

  const { 
    data: systemHealth, 
    isLoading: healthLoading,
    refetch: refetchHealth 
  } = trpc.admin.getSystemHealth.useQuery();

  const { 
    data: storageStats, 
    isLoading: storageLoading,
    refetch: refetchStorage 
  } = trpc.admin.getStorageStats.useQuery();

  const { 
    data: permissionStats, 
    isLoading: permissionLoading,
    refetch: refetchPermissions 
  } = trpc.admin.getPermissionStats.useQuery();

  const utils = trpc.useContext();

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchOverview(),
        refetchHealth(),
        refetchStorage(),
        refetchPermissions(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const retryFailedProcessingMutation = trpc.admin.retryFailedProcessing.useMutation({
    onSuccess: () => {
      utils.admin.getSystemOverview.invalidate();
    },
  });

  const cleanupExpiredLinksMutation = trpc.admin.cleanupExpiredLinks.useMutation();

  const handleRetryFailed = async () => {
    await retryFailedProcessingMutation.mutateAsync({ retryAll: true });
  };

  const handleCleanupLinks = async () => {
    await cleanupExpiredLinksMutation.mutateAsync();
  };

  const isLoading = overviewLoading || healthLoading || storageLoading || permissionLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Navigation />
      </div>

      {/* Mobile Navigation */}
      <MobileNavigation />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-600">
                  System overview and management tools
                </p>
              </div>
              
              <Button 
                onClick={handleRefreshAll}
                disabled={refreshing}
                variant="outline"
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
                Refresh All
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="space-y-8">
            {/* System Health Status */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Database</p>
                      <div className="flex items-center mt-1">
                        {systemHealth?.database ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                            <span className="text-sm text-green-600">Healthy</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-500 mr-1" />
                            <span className="text-sm text-red-600">Error</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Database className={cn(
                      "w-8 h-8",
                      systemHealth?.database ? "text-green-500" : "text-red-500"
                    )} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Storage</p>
                      <div className="flex items-center mt-1">
                        {systemHealth?.storage ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                            <span className="text-sm text-green-600">Connected</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-500 mr-1" />
                            <span className="text-sm text-red-600">Error</span>
                          </>
                        )}
                      </div>
                    </div>
                    <HardDrive className={cn(
                      "w-8 h-8",
                      systemHealth?.storage ? "text-green-500" : "text-red-500"
                    )} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">AI Service</p>
                      <div className="flex items-center mt-1">
                        {systemHealth?.ai ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                            <span className="text-sm text-green-600">Online</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-500 mr-1" />
                            <span className="text-sm text-red-600">Offline</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Zap className={cn(
                      "w-8 h-8",
                      systemHealth?.ai ? "text-green-500" : "text-red-500"
                    )} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Overall</p>
                      <div className="flex items-center mt-1">
                        {systemHealth?.overall ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                            <span className="text-sm text-green-600">Healthy</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-500 mr-1" />
                            <span className="text-sm text-red-600">Issues</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Server className={cn(
                      "w-8 h-8",
                      systemHealth?.overall ? "text-green-500" : "text-red-500"
                    )} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* System Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Users</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatNumber(systemOverview?.stats.totalUsers || 0)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-gray-600">
                    <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
                    {permissionStats?.overview.totalUsersWithAccess || 0} with access
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Sites</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatNumber(systemOverview?.stats.totalSites || 0)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                      <Building className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-gray-600">
                    <Activity className="w-4 h-4 mr-1 text-blue-500" />
                    {permissionStats?.overview.totalSitesWithUsers || 0} with users
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Files</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatNumber(systemOverview?.stats.totalFiles || 0)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Files className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-gray-600">
                    <Clock className="w-4 h-4 mr-1 text-yellow-500" />
                    {systemOverview?.recentUploads.length || 0} recent
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Storage Used</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatFileSize(systemOverview?.stats.totalSize || 0)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <HardDrive className="w-6 h-6 text-yellow-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-gray-600">
                    <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
                    Across all sites
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Processing Status & Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Processing Status */}
              <Card>
                <CardHeader>
                  <CardTitle>File Processing Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(systemOverview?.processingStats || {}).map(([status, count]) => {
                      const statusColors = {
                        pending: 'bg-yellow-100 text-yellow-800',
                        processing: 'bg-blue-100 text-blue-800',
                        completed: 'bg-green-100 text-green-800',
                        failed: 'bg-red-100 text-red-800',
                      };

                      return (
                        <div key={status} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className={cn(
                              'px-2 py-1 text-xs rounded-full capitalize',
                              statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'
                            )}>
                              {status}
                            </span>
                          </div>
                          <span className="font-medium">{count}</span>
                        </div>
                      );
                    })}
                  </div>

                  {systemHealth?.metrics.failedProcessing > 0 && (
                    <div className="mt-6">
                      <Button
                        onClick={handleRetryFailed}
                        disabled={retryFailedProcessingMutation.isLoading}
                        size="sm"
                        variant="outline"
                        className="w-full"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry Failed Processing
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Storage Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Storage by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(storageStats?.byCategory || {}).map(([category, stats]) => (
                      <div key={category} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <span className="text-sm font-medium capitalize">{category}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{stats.count} files</div>
                          <div className="text-xs text-gray-500">{formatFileSize(stats.size)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Button
                      onClick={handleCleanupLinks}
                      disabled={cleanupExpiredLinksMutation.isLoading}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Cleanup Expired Links
                    </Button>

                    <Button
                      onClick={() => window.location.href = '/dashboard/admin/users'}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Manage Users
                    </Button>

                    <Button
                      onClick={() => window.location.href = '/dashboard/admin/sites'}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Building className="w-4 h-4 mr-2" />
                      Manage Sites
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Recent Uploads */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Uploads</CardTitle>
                </CardHeader>
                <CardContent>
                  {systemOverview?.recentUploads && systemOverview.recentUploads.length > 0 ? (
                    <div className="space-y-4">
                      {systemOverview.recentUploads.slice(0, 5).map((file) => (
                        <div key={file.id} className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Files className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {file.originalName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {file.uploaderName} • {file.siteName} • {formatDate(file.createdAt)}
                            </p>
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatFileSize(file.size)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Files className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-sm">No recent uploads</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Daily Upload Chart Placeholder */}
              <Card>
                <CardHeader>
                  <CardTitle>Upload Trends (Last 7 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  {systemOverview?.dailyUploads && systemOverview.dailyUploads.length > 0 ? (
                    <div className="space-y-3">
                      {systemOverview.dailyUploads.slice(-7).map((day) => (
                        <div key={day.date} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{day.date}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium">{day.count} files</span>
                            <span className="text-xs text-gray-500">
                              {formatFileSize(day.totalSize)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <BarChart3 className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-sm">No upload data available</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}