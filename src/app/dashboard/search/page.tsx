'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Clock, 
  TrendingUp, 
  BarChart3, 
  Files,
  Zap,
  Target,
  Eye,
  Download,
  Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchInterface } from '@/components/SearchInterface';
import { Navigation, MobileNavigation } from '@/components/Navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { useSearchAnalytics } from '@/hooks/useSearch';
import { useSites } from '@/hooks/useSites';
import { trpc } from '@/lib/trpc';
import { formatNumber, formatDuration, formatDate, cn } from '@/lib/utils';
import type { FileWithDetails } from '@/types';

export default function DashboardSearchPage() {
  useRequireAuth();
  
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileWithDetails | null>(null);

  const { sites, siteStats } = useSites();
  
  // Fetch search analytics
  const { 
    analytics, 
    isLoading: analyticsLoading,
    refetch: refetchAnalytics 
  } = useSearchAnalytics();

  // Clear search history mutation
  const clearHistoryMutation = trpc.search.clearSearchHistory.useMutation({
    onSuccess: () => {
      refetchAnalytics();
    },
  });

  // Generate download URL mutation
  const downloadUrlMutation = trpc.files.getDownloadUrl.useMutation();

  // Create share link mutation
  const shareLinkMutation = trpc.files.createShareLink.useMutation();

  const handleFileSelect = (file: FileWithDetails) => {
    setSelectedFile(file);
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

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear your search history?')) {
      await clearHistoryMutation.mutateAsync();
    }
  };

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
                <h1 className="text-2xl font-bold text-gray-900">Smart Search</h1>
                <p className="text-sm text-gray-600">
                  Find design assets using natural language or advanced filters
                </p>
              </div>
              
              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  onClick={() => setShowAnalytics(!showAnalytics)}
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  {showAnalytics ? 'Hide' : 'Show'} Analytics
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="space-y-8">
            {/* Search Analytics */}
            {showAnalytics && (
              <div className="space-y-6">
                {/* Search Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Available Sites</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {sites.length}
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Target className="w-6 h-6 text-blue-600" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center text-sm text-gray-600">
                        <Eye className="w-4 h-4 mr-1 text-green-500" />
                        Searchable locations
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Total Files</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {formatNumber(siteStats?.totalFiles || 0)}
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <Files className="w-6 h-6 text-green-600" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center text-sm text-gray-600">
                        <Search className="w-4 h-4 mr-1 text-blue-500" />
                        Indexed for search
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">My Searches</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {formatNumber(analytics?.stats.totalSearches || 0)}
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                          <BarChart3 className="w-6 h-6 text-purple-600" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center text-sm text-gray-600">
                        <TrendingUp className="w-4 h-4 mr-1 text-green-500" />
                        All time total
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Avg Response</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {formatDuration(analytics?.stats.avgResponseTime || 0)}
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                          <Zap className="w-6 h-6 text-yellow-600" />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center text-sm text-gray-600">
                        <Clock className="w-4 h-4 mr-1 text-blue-500" />
                        Search performance
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Searches and Popular Queries */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Recent Searches */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center">
                          <Clock className="w-5 h-5 mr-2" />
                          Recent Searches
                        </CardTitle>
                        {analytics?.recentSearches && analytics.recentSearches.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleClearHistory}
                            disabled={clearHistoryMutation.isLoading}
                          >
                            Clear History
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {analyticsLoading ? (
                        <div className="space-y-3">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="animate-pulse flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-200 rounded"></div>
                              <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : analytics?.recentSearches && analytics.recentSearches.length > 0 ? (
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {analytics.recentSearches.slice(0, 10).map((search) => (
                            <div key={search.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {search.query}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {search.resultsCount} results • {formatDuration(search.responseTime)} • {formatDate(search.createdAt)}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  // Trigger search with this query
                                  const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
                                  if (searchInput) {
                                    searchInput.value = search.query;
                                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                                  }
                                }}
                                className="ml-2"
                              >
                                <Search className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <Search className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                          <p className="text-sm">No recent searches</p>
                          <p className="text-xs">Start searching to see your history here</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Popular Searches */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2" />
                        Popular Searches
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {analyticsLoading ? (
                        <div className="space-y-3">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="animate-pulse flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-200 rounded"></div>
                              <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : analytics?.popularSearches && analytics.popularSearches.length > 0 ? (
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          {analytics.popularSearches.map((search, index) => (
                            <div key={search.query} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
                              <div className="flex items-center space-x-3">
                                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {search.query}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {search.count} searches • avg {formatDuration(search.avgResponseTime)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  // Trigger search with this query
                                  const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
                                  if (searchInput) {
                                    searchInput.value = search.query;
                                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                                  }
                                }}
                                className="ml-2"
                              >
                                <Search className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <TrendingUp className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                          <p className="text-sm">No popular searches yet</p>
                          <p className="text-xs">Search patterns will appear here over time</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Search Tips */}
            {!showAnalytics && (
              <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Search className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-blue-900 mb-2">Smart Search Tips</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
                        <div>
                          <p className="font-medium mb-1">Natural Language:</p>
                          <p>"modern dining chairs" or "brass pendant lights"</p>
                        </div>
                        <div>
                          <p className="font-medium mb-1">Specific Filters:</p>
                          <p>category:furniture or type:image</p>
                        </div>
                        <div>
                          <p className="font-medium mb-1">Room Types:</p>
                          <p>"living room sofa" or "kitchen cabinets"</p>
                        </div>
                        <div>
                          <p className="font-medium mb-1">Materials:</p>
                          <p>"wood flooring" or "marble countertops"</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Main Search Interface */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Search className="w-5 h-5 mr-2" />
                  Search Design Assets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SearchInterface
                  onFileSelect={handleFileSelect}
                  showFilters={true}
                  compact={false}
                />
              </CardContent>
            </Card>

            {/* Selected File Details */}
            {selectedFile && (
              <Card>
                <CardHeader>
                  <CardTitle>Selected File</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start space-x-4">
                    <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center">
                      {selectedFile.mimeType.startsWith('image/') ? '🖼️' : 
                       selectedFile.mimeType === 'application/pdf' ? '📄' : '📁'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {selectedFile.originalName}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                        <div>
                          <span className="font-medium text-gray-700">Category:</span>
                          <p className="text-gray-600 capitalize">{selectedFile.category}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Size:</span>
                          <p className="text-gray-600">{selectedFile.size}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Type:</span>
                          <p className="text-gray-600">{selectedFile.mimeType}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Uploaded:</span>
                          <p className="text-gray-600">{formatDate(selectedFile.createdAt)}</p>
                        </div>
                      </div>
                      {selectedFile.aiDescription && (
                        <div className="mb-4">
                          <span className="font-medium text-gray-700">AI Description:</span>
                          <p className="text-gray-600 mt-1">{selectedFile.aiDescription}</p>
                        </div>
                      )}
                      {selectedFile.aiTags && (
                        <div className="mb-4">
                          <span className="font-medium text-gray-700">Tags:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {JSON.parse(selectedFile.aiTags).map((tag: string, index: number) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => handleDownload(selectedFile)}
                          disabled={downloadUrlMutation.isLoading}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleShare(selectedFile)}
                          disabled={shareLinkMutation.isLoading}
                        >
                          <Share2 className="w-4 h-4 mr-2" />
                          Share
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setSelectedFile(null)}
                        >
                          Clear Selection
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}