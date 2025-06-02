'use client';

import React, { useState } from 'react';
import { 
  Upload, 
  Files, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  XCircle,
  Folder,
  TrendingUp,
  BarChart3,
  Download,
  Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUpload } from '@/components/FileUpload';
import { FileGrid } from '@/components/FileGrid';
import { SiteSelector } from '@/components/SiteSelector';
import { Navigation, MobileNavigation } from '@/components/Navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { useSites } from '@/hooks/useSites';
import { trpc } from '@/lib/trpc';
import { formatFileSize, formatDate, cn } from '@/lib/utils';
import type { FileCategory, FileWithDetails } from '@/types';

const FILE_CATEGORIES: { value: FileCategory; label: string; icon: string }[] = [
  { value: 'furniture', label: 'Furniture', icon: '🪑' },
  { value: 'lighting', label: 'Lighting', icon: '💡' },
  { value: 'textiles', label: 'Textiles', icon: '🧵' },
  { value: 'accessories', label: 'Accessories', icon: '🎨' },
  { value: 'finishes', label: 'Finishes', icon: '🏠' },
];

export default function DashboardUploadPage() {
  useRequireAuth();
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const { uploadableSites, siteStats, isLoading: sitesLoading } = useSites();
  
  // Fetch upload statistics
  const { 
    data: uploadStats, 
    isLoading: statsLoading,
    refetch: refetchStats 
  } = trpc.files.getUploadStats.useQuery();

  const utils = trpc.useContext();

  // Fetch recent uploads
  const {
    data: recentFiles,
    isLoading: filesLoading,
    refetch: refetchFiles,
  } = trpc.files.getFiles.useQuery({
    siteId: selectedSiteId || undefined,
    category: selectedCategory || undefined,
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  // Generate download URL mutation
  const downloadUrlMutation = trpc.files.getDownloadUrl.useMutation();

  // Create share link mutation
  const shareLinkMutation = trpc.files.createShareLink.useMutation();

  const handleUploadComplete = (uploadedCount: number) => {
    console.log(`Successfully uploaded ${uploadedCount} files`);
    // Refresh data
    refetchFiles();
    refetchStats();
    utils.files.getUploadStats.invalidate();
  };

  const handleDownload = async (file: FileWithDetails) => {
    try {
      const result = await downloadUrlMutation.mutateAsync({
        id: file.id,
        thumbnail: false,
      });
      
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleShare = async (file: FileWithDetails) => {
    try {
      const result = await shareLinkMutation.mutateAsync({
        fileId: file.id,
        expiresInHours: 24,
      });
      
      await navigator.clipboard.writeText(result.url);
      alert('Share link copied to clipboard!');
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const getProcessingStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getProcessingStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
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
                <h1 className="text-2xl font-bold text-gray-900">File Upload</h1>
                <p className="text-sm text-gray-600">
                  Upload and manage your design assets
                </p>
              </div>
              
              {uploadableSites.length > 0 && (
                <Button onClick={() => setShowUploadModal(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Files
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="space-y-8">
            {/* No Upload Access Warning */}
            {uploadableSites.length === 0 && (
              <Card className="border-yellow-200 bg-yellow-50">
                <CardContent className="p-6">
                  <div className="flex items-start">
                    <AlertCircle className="w-6 h-6 text-yellow-600 mt-1 mr-3" />
                    <div>
                      <h3 className="text-lg font-medium text-yellow-800">No Upload Access</h3>
                      <p className="text-yellow-700 mt-1">
                        You don't have upload permissions for any sites. Contact your administrator to request access.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upload Statistics */}
            {uploadableSites.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Upload Sites</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {uploadableSites.length}
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Folder className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-gray-600">
                      <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
                      Sites with upload access
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
                      Across all accessible sites
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
                      Total storage consumed
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
                        <Folder className="w-6 h-6 text-yellow-600" />
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
                      Well organized
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Files by Category */}
            {uploadStats?.filesByCategory && Object.keys(uploadStats.filesByCategory).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Files by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {FILE_CATEGORIES.map((category) => {
                      const stats = uploadStats.filesByCategory[category.value];
                      const isSelected = selectedCategory === category.value;
                      
                      return (
                        <div
                          key={category.value}
                          onClick={() => setSelectedCategory(isSelected ? null : category.value)}
                          className={cn(
                            "p-4 border rounded-lg cursor-pointer transition-colors",
                            isSelected 
                              ? "border-blue-500 bg-blue-50" 
                              : "border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <div className="flex items-center space-x-3 mb-3">
                            <span className="text-2xl">{category.icon}</span>
                            <div>
                              <h3 className="font-medium">{category.label}</h3>
                              <p className="text-xs text-gray-500">
                                {stats ? `${stats.count} files` : 'No files'}
                              </p>
                            </div>
                          </div>
                          {stats && (
                            <div className="text-xs text-gray-600">
                              {formatFileSize(stats.size)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filters and File List */}
            <div className="space-y-6">
              {/* Site Filter */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <label className="text-sm font-medium text-gray-700">Filter by Site:</label>
                      <div className="w-64">
                        <SiteSelector
                          selectedSiteId={selectedSiteId}
                          onSiteSelect={setSelectedSiteId}
                          showAllOption={true}
                          filter="uploadable"
                          compact={true}
                        />
                      </div>
                      {selectedCategory && (
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">Category:</span>
                          <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {FILE_CATEGORIES.find(c => c.value === selectedCategory)?.label}
                            <button
                              onClick={() => setSelectedCategory(null)}
                              className="ml-1 hover:text-blue-600"
                            >
                              ×
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* File Grid */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      {selectedSiteId || selectedCategory ? 'Filtered Files' : 'Recent Files'}
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('grid')}
                      >
                        Grid
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('list')}
                      >
                        List
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filesLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                  ) : recentFiles && recentFiles.files.length > 0 ? (
                    <FileGrid
                      files={recentFiles.files}
                      isLoading={filesLoading}
                      viewMode={viewMode}
                      onDownload={handleDownload}
                      onShare={handleShare}
                      showActions={true}
                    />
                  ) : (
                    <div className="text-center py-12">
                      <Files className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-600 mb-2">
                        {selectedSiteId || selectedCategory 
                          ? 'No files found with current filters' 
                          : 'No files uploaded yet'
                        }
                      </p>
                      {uploadableSites.length > 0 && (
                        <Button
                          onClick={() => setShowUploadModal(true)}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Files
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Upload Activity */}
            {uploadStats?.recentUploads && uploadStats.recentUploads.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Upload Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {uploadStats.recentUploads.slice(0, 5).map((file) => (
                      <div key={file.id} className="flex items-center space-x-4 p-3 hover:bg-gray-50 rounded-lg">
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                          <span className="text-xl">
                            {FILE_CATEGORIES.find(c => c.value === file.category)?.icon || '📁'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.originalName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {file.category} • {formatFileSize(file.size)} • {formatDate(file.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownload(file)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleShare(file)}
                          >
                            <Share2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>

      {/* File Upload Modal */}
      <FileUpload
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={handleUploadComplete}
        defaultSiteId={selectedSiteId || undefined}
        defaultCategory={selectedCategory || undefined}
      />
    </div>
  );
}