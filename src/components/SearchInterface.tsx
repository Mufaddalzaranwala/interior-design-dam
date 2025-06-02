import React, { useState, useCallback, useEffect } from 'react';
import { Search, Filter, X, Calendar, Folder, File, Download, Share2, Eye, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { SimpleModal } from './ui/modal';
import { useSearch } from '@/hooks/useSearch';
import { useSites } from '@/hooks/useSites';
import { trpc } from '@/lib/trpc';
import { formatFileSize, formatDate, cn } from '@/lib/utils';
import type { FileCategory, FileWithDetails } from '@/types';

interface SearchInterfaceProps {
  defaultQuery?: string;
  onFileSelect?: (file: FileWithDetails) => void;
  showFilters?: boolean;
  compact?: boolean;
}

const FILE_CATEGORIES: { value: FileCategory; label: string }[] = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'textiles', label: 'Textiles' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'finishes', label: 'Finishes' },
];

const MIME_TYPE_FILTERS = [
  { value: 'image/', label: 'Images', icon: '🖼️' },
  { value: 'application/pdf', label: 'PDFs', icon: '📄' },
  { value: 'application/dwg', label: 'CAD Files', icon: '📐' },
];

export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  defaultQuery = '',
  onFileSelect,
  showFilters = true,
  compact = false,
}) => {
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileWithDetails | null>(null);
  const [showFileModal, setShowFileModal] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const { sites } = useSites();
  
  const {
    query,
    filters,
    results,
    suggestions,
    isLoading,
    error,
    total,
    hasMore,
    setQuery,
    setFilters,
    search,
    loadMore,
    clearAll,
    hasActiveSearch,
    hasResults,
  } = useSearch({
    initialQuery: defaultQuery,
    autoSearch: true,
    saveToUrl: !compact,
    pageSize: compact ? 10 : 20,
  });

  // Generate download URL mutation
  const downloadUrlMutation = trpc.files.getDownloadUrl.useMutation();

  // Create share link mutation
  const shareLinkMutation = trpc.files.createShareLink.useMutation();

  // Create view URL mutation
  const viewUrlMutation = trpc.files.getViewUrl.useMutation();

  useEffect(() => {
    if (selectedFile?.thumbnailPath) {
      viewUrlMutation.mutateAsync({ id: selectedFile.id, thumbnail: true })
        .then(res => setThumbnailUrl(res.url))
        .catch(() => setThumbnailUrl(null));
    } else {
      setThumbnailUrl(null);
    }
  }, [selectedFile]);

  const handleFileClick = (file: FileWithDetails) => {
    if (onFileSelect) {
      onFileSelect(file);
    } else {
      setSelectedFile(file);
      setShowFileModal(true);
    }
  };

  const handleDownload = async (file: FileWithDetails, thumbnail = false) => {
    try {
      const result = await downloadUrlMutation.mutateAsync({
        id: file.id,
        thumbnail,
      });
      
      // Create download link
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
      
      // Copy to clipboard
      await navigator.clipboard.writeText(result.url);
      alert('Share link copied to clipboard!');
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  // Generate view URL and open in new tab
  const handleView = async (file: FileWithDetails, thumbnail = false) => {
    try {
      const result = await viewUrlMutation.mutateAsync({ id: file.id, thumbnail });
      window.open(result.url, '_blank');
    } catch (error) {
      console.error('View failed:', error);
    }
  };

  const clearFilter = (filterType: string, value?: string) => {
    const newFilters = { ...filters };
    
    switch (filterType) {
      case 'siteIds':
        if (value) {
          newFilters.siteIds = newFilters.siteIds?.filter(id => id !== value);
        } else {
          delete newFilters.siteIds;
        }
        break;
      case 'categories':
        if (value) {
          newFilters.categories = newFilters.categories?.filter(cat => cat !== value);
        } else {
          delete newFilters.categories;
        }
        break;
      case 'dateFrom':
        delete newFilters.dateFrom;
        break;
      case 'dateTo':
        delete newFilters.dateTo;
        break;
      case 'mimeTypes':
        if (value) {
          newFilters.mimeTypes = newFilters.mimeTypes?.filter(type => type !== value);
        } else {
          delete newFilters.mimeTypes;
        }
        break;
    }
    
    setFilters(newFilters);
  };

  const getFileIcon = (file: FileWithDetails) => {
    if (file.mimeType.startsWith('image/')) {
      return '🖼️';
    } else if (file.mimeType === 'application/pdf') {
      return '📄';
    } else if (file.mimeType.includes('dwg') || file.mimeType.includes('dxf')) {
      return '📐';
    }
    return '📁';
  };

  const getProcessingStatusBadge = (file: FileWithDetails) => {
    const status = file.processingStatus;
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };

    return (
      <span className={cn('px-2 py-1 text-xs rounded-full', colors[status])}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className={cn('w-full', compact ? 'space-y-4' : 'space-y-6')}>
      {/* Search Bar */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search files by name, description, or tags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-12"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && query && (
          <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-md shadow-lg mt-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setQuery(suggestion)}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {showFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {(filters.siteIds?.length || filters.categories?.length || filters.mimeTypes?.length) && (
                <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                  {(filters.siteIds?.length || 0) + (filters.categories?.length || 0) + (filters.mimeTypes?.length || 0)}
                </span>
              )}
            </Button>
          )}
          
          {hasActiveSearch && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
            >
              Clear All
            </Button>
          )}
        </div>

        <div className="text-sm text-gray-500">
          {hasResults && `${total} file${total !== 1 ? 's' : ''} found`}
        </div>
      </div>

      {/* Filters Panel */}
      {showFiltersPanel && showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Site Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">Sites</label>
              <div className="space-y-2">
                {sites.map((site) => (
                  <label key={site.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={filters.siteIds?.includes(site.id) || false}
                      onChange={(e) => {
                        const siteIds = filters.siteIds || [];
                        if (e.target.checked) {
                          setFilters({ siteIds: [...siteIds, site.id] });
                        } else {
                          setFilters({ siteIds: siteIds.filter(id => id !== site.id) });
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{site.name} - {site.clientName}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">Categories</label>
              <div className="grid grid-cols-2 gap-2">
                {FILE_CATEGORIES.map((category) => (
                  <label key={category.value} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={filters.categories?.includes(category.value) || false}
                      onChange={(e) => {
                        const categories = filters.categories || [];
                        if (e.target.checked) {
                          setFilters({ categories: [...categories, category.value] });
                        } else {
                          setFilters({ categories: categories.filter(cat => cat !== category.value) });
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{category.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* File Type Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">File Types</label>
              <div className="space-y-2">
                {MIME_TYPE_FILTERS.map((type) => (
                  <label key={type.value} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={filters.mimeTypes?.some(mime => mime.includes(type.value)) || false}
                      onChange={(e) => {
                        const mimeTypes = filters.mimeTypes || [];
                        if (e.target.checked) {
                          setFilters({ mimeTypes: [...mimeTypes, type.value] });
                        } else {
                          setFilters({ mimeTypes: mimeTypes.filter(mime => !mime.includes(type.value)) });
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{type.icon} {type.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">From Date</label>
                <Input
                  type="date"
                  value={filters.dateFrom || ''}
                  onChange={(e) => setFilters({ dateFrom: e.target.value || undefined })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">To Date</label>
                <Input
                  type="date"
                  value={filters.dateTo || ''}
                  onChange={(e) => setFilters({ dateTo: e.target.value || undefined })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Filters */}
      {(filters.siteIds?.length || filters.categories?.length || filters.mimeTypes?.length || filters.dateFrom || filters.dateTo) && (
        <div className="flex flex-wrap gap-2">
          {filters.siteIds?.map(siteId => {
            const site = sites.find(s => s.id === siteId);
            return (
              <span
                key={siteId}
                className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
              >
                Site: {site?.name}
                <button
                  onClick={() => clearFilter('siteIds', siteId)}
                  className="ml-1 hover:text-blue-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
          
          {filters.categories?.map(category => (
            <span
              key={category}
              className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
            >
              {FILE_CATEGORIES.find(c => c.value === category)?.label}
              <button
                onClick={() => clearFilter('categories', category)}
                className="ml-1 hover:text-green-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          
          {filters.dateFrom && (
            <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
              From: {filters.dateFrom}
              <button
                onClick={() => clearFilter('dateFrom')}
                className="ml-1 hover:text-purple-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          
          {filters.dateTo && (
            <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
              To: {filters.dateTo}
              <button
                onClick={() => clearFilter('dateTo')}
                className="ml-1 hover:text-purple-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Searching...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-8">
          <p className="text-red-600">{error}</p>
          <Button onClick={search} variant="outline" className="mt-2">
            Try Again
          </Button>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((file) => (
              <Card
                key={file.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleFileClick(file)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{getFileIcon(file)}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{file.originalName}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    {getProcessingStatusBadge(file)}
                  </div>

                  {file.aiDescription && (
                    <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                      {file.aiDescription}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>{file.category}</span>
                    <span>{formatDate(file.createdAt)}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file);
                      }}
                      disabled={downloadUrlMutation.isLoading}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare(file);
                      }}
                      disabled={shareLinkMutation.isLoading}
                    >
                      <Share2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="text-center">
              <Button
                onClick={loadMore}
                variant="outline"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* No Results */}
      {!isLoading && !error && hasActiveSearch && !hasResults && (
        <div className="text-center py-8">
          <Search className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2">No files found</p>
          <p className="text-sm text-gray-500">
            Try adjusting your search terms or filters
          </p>
        </div>
      )}

      {/* File Detail Modal */}
      {selectedFile && (
        <SimpleModal
          isOpen={showFileModal}
          onClose={() => setShowFileModal(false)}
          title={selectedFile.originalName}
          size="lg"
        >
          {thumbnailUrl && (
            <div className="mb-4 text-center">
              <img src={thumbnailUrl} alt="Thumbnail" className="mx-auto max-h-40 object-contain" />
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Size:</span> {formatFileSize(selectedFile.size)}
              </div>
              <div>
                <span className="font-medium">Category:</span> {selectedFile.category}
              </div>
              <div>
                <span className="font-medium">Uploaded:</span> {formatDate(selectedFile.createdAt)}
              </div>
              <div>
                <span className="font-medium">Status:</span> {getProcessingStatusBadge(selectedFile)}
              </div>
            </div>

            {selectedFile.aiDescription && (
              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-sm text-gray-600">{selectedFile.aiDescription}</p>
              </div>
            )}

            {selectedFile.aiTags && (
              <div>
                <h4 className="font-medium mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1">
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
                onClick={() => handleView(selectedFile)}
                disabled={viewUrlMutation.isLoading}
              >
                <Eye className="w-4 h-4 mr-2" />
                View
              </Button>
            </div>
          </div>
        </SimpleModal>
      )}
    </div>
  );
};

export default SearchInterface;