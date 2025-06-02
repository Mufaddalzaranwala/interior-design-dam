'use client';

import React, { useState } from 'react';
import { 
  Upload, 
  Search, 
  BarChart3, 
  Building, 
  Users, 
  Files, 
  TrendingUp, 
  Clock,
  Eye,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUpload } from '@/components/FileUpload';
import { FileGrid } from '@/components/FileGrid';
import { SearchInterface } from '@/components/SearchInterface';
import { Navigation, MobileNavigation } from '@/components/Navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { useSites } from '@/hooks/useSites';
import { trpc } from '@/lib/trpc';
import { formatFileSize, formatDate, cn } from '@/lib/utils';

export default function DashboardPage() {
  useRequireAuth();
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedView, setSelectedView] = useState<'overview' | 'files' | 'search'>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { sites, uploadableSites, siteStats, isLoading: sitesLoading } = useSites();
  
  const { data: uploadStats, isLoading: statsLoading } = trpc.files.getUploadStats.useQuery();
  
  const { data: recentFiles, isLoading: filesLoading } = trpc.files.getFiles.useQuery({
    page: 1,
    limit: 6,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const handleUploadComplete = (uploadedCount: number) => {
    // Refetch data after successful upload
    // The queries will automatically update due to tRPC caching
    console.log(`Successfully uploaded ${uploadedCount} files`);
  };

  if (sitesLoading || statsLoading) {
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
        <Navigation 
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
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
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-sm text-gray-600">
                  Welcome back! Here's what's happening with your design assets.
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                {/* View Toggle */}
                <div className="hidden sm:flex bg-gray-100 rounded-lg p-1">
                  {[
                    { id: 'overview', label: 'Overview', icon: BarChart3 },
                    { id: 'files', label: 'Files', icon: Files },
                    { id: 'search', label: 'Search', icon: Search },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setSelectedView(id as any)}
                      className={cn(
                        'px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center space-x-2',
                        selectedView === id
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Upload Button */}
                {uploadableSites.length > 0 && (
                  <Button onClick={() => setShowUploadModal(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Files
                  </Button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {selectedView === 'overview' && (
            <div className="space-y-8">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Sites</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {siteStats?.totalSites || 0}
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Building className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-gray-600">
                      <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
                      {siteStats?.uploadableSitesCount || 0} with upload access
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Files</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {uploadStats?.totalFiles || 0}
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Files className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-1 text-blue-500" />
                      {uploadStats?.recentUploads?.length || 0} recent uploads
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Storage Used</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatFileSize(uploadStats?.totalSize || 0)}
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-purple-600" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-gray-600">
                      <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
                      Across all projects
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Categories</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {Object.keys(uploadStats?.filesByCategory || {}).length}
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <Users className="w-6 h-6 text-yellow-600" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-gray-600">
                      <Eye className="w-4 h-4 mr-1 text-blue-500" />
                      Well organized
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Files and Categories */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Files */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Recent Files</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedView('files')}
                        >
                          View All
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {filesLoading ? (
                        <div className="space-y-4">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="animate-pulse flex items-center space-x-4">
                              <div className="w-12 h-12 bg-gray-200 rounded"></div>
                              <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : recentFiles && recentFiles.files.length > 0 ? (
                        <div className="space-y-4">
                          {recentFiles.files.slice(0, 5).map((file) => (
                            <div key={file.id} className="flex items-center space-x-4 p-3 hover:bg-gray-50 rounded-lg">
                              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                                {file.mimeType.startsWith('image/') ? '🖼️' : 
                                 file.mimeType === 'application/pdf' ? '📄' : '📁'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {file.originalName}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {file.category} • {formatFileSize(file.size)} • {formatDate(file.createdAt)}
                                </p>
                              </div>
                              <Button size="sm" variant="ghost">
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Files className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                          <p className="text-gray-600 mb-2">No files uploaded yet</p>
                          <Button
                            onClick={() => setShowUploadModal(true)}
                            disabled={uploadableSites.length === 0}
                          >
                            Upload your first file
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Categories Breakdown */}
                <div>
                  <Card>
                    <CardHeader>
                      <CardTitle>Files by Category</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {uploadStats?.filesByCategory && Object.keys(uploadStats.filesByCategory).length > 0 ? (
                        <div className="space-y-4">
                          {Object.entries(uploadStats.filesByCategory).map(([category, stats]) => (
                            <div key={category} className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                <span className="text-sm font-medium capitalize">{category}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">{stats.count}</div>
                                <div className="text-xs text-gray-500">{formatFileSize(stats.size)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <BarChart3 className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600">No data available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {selectedView === 'files' && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">All Files</h2>
                <p className="text-gray-600">Browse and manage your design assets</p>
              </div>
              
              <FileGrid
                files={recentFiles?.files || []}
                isLoading={filesLoading}
                showActions={true}
                viewMode="grid"
              />
            </div>
          )}

          {selectedView === 'search' && (
            <div>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Search Files</h2>
                <p className="text-gray-600">Find files using natural language or filters</p>
              </div>
              
              <SearchInterface />
            </div>
          )}
        </main>
      </div>

      {/* File Upload Modal */}
      <FileUpload
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
}