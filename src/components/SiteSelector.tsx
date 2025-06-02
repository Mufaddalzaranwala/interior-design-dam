import React, { useState, useMemo } from 'react';
import { ChevronDown, Building, Users, Upload, Eye, Plus, Settings, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { SimpleModal } from './ui/modal';
import { useSites } from '@/hooks/useSites';
import { formatFileSize, cn } from '@/lib/utils';
import type { SiteWithStats } from '@/types';

interface SiteSelectorProps {
  selectedSiteId?: string;
  onSiteSelect?: (siteId: string | null) => void;
  showAllOption?: boolean;
  showStats?: boolean;
  showPermissions?: boolean;
  onCreateSite?: () => void;
  onManageSite?: (siteId: string) => void;
  compact?: boolean;
  filter?: 'all' | 'uploadable' | 'viewOnly';
}

export const SiteSelector: React.FC<SiteSelectorProps> = ({
  selectedSiteId,
  onSiteSelect,
  showAllOption = true,
  showStats = true,
  showPermissions = true,
  onCreateSite,
  onManageSite,
  compact = false,
  filter = 'all',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [selectedSiteForDetails, setSelectedSiteForDetails] = useState<SiteWithStats | null>(null);

  const { 
    sites, 
    uploadableSites, 
    viewOnlySites, 
    siteStats, 
    isLoading, 
    error 
  } = useSites({ includeStats: showStats });

  // Filter sites based on the filter prop
  const filteredSites = useMemo(() => {
    let sitesToShow = sites;
    
    switch (filter) {
      case 'uploadable':
        sitesToShow = uploadableSites;
        break;
      case 'viewOnly':
        sitesToShow = viewOnlySites;
        break;
      default:
        sitesToShow = sites;
    }

    // Apply search filter
    if (searchQuery) {
      sitesToShow = sitesToShow.filter(site =>
        site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.clientName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return sitesToShow;
  }, [sites, uploadableSites, viewOnlySites, filter, searchQuery]);

  const selectedSite = useMemo(() => {
    return sites.find(site => site.id === selectedSiteId);
  }, [sites, selectedSiteId]);

  const handleSiteSelect = (siteId: string | null) => {
    onSiteSelect?.(siteId);
    setIsOpen(false);
  };

  const handleSiteDetails = (site: SiteWithStats) => {
    setSelectedSiteForDetails(site);
    setShowSiteModal(true);
  };

  const getPermissionBadge = (site: SiteWithStats) => {
    if (site.canUpload) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
          <Upload className="w-3 h-3 mr-1" />
          Upload
        </span>
      );
    } else if (site.canView) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
          <Eye className="w-3 h-3 mr-1" />
          View
        </span>
      );
    }
    return null;
  };

  const getSiteIcon = (site: SiteWithStats) => {
    return <Building className="w-5 h-5 text-gray-500" />;
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded border"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 p-2 bg-red-50 border border-red-200 rounded">
        Error loading sites: {error}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Site Selector Button */}
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full justify-between',
          compact ? 'h-9' : 'h-10'
        )}
      >
        <div className="flex items-center space-x-2 truncate">
          {selectedSite ? (
            <>
              {getSiteIcon(selectedSite)}
              <div className="text-left truncate">
                <div className="font-medium truncate">{selectedSite.name}</div>
                {!compact && (
                  <div className="text-xs text-gray-500 truncate">{selectedSite.clientName}</div>
                )}
              </div>
            </>
          ) : (
            <>
              <Building className="w-5 h-5 text-gray-400" />
              <span className="text-gray-500">
                {showAllOption ? 'All Sites' : 'Select a site'}
              </span>
            </>
          )}
        </div>
        <ChevronDown className={cn(
          'w-4 h-4 transition-transform',
          isOpen && 'transform rotate-180'
        )} />
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search sites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-8"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {/* All Sites Option */}
            {showAllOption && (
              <button
                onClick={() => handleSiteSelect(null)}
                className={cn(
                  'w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100',
                  !selectedSiteId && 'bg-blue-50 text-blue-700'
                )}
              >
                <div className="flex items-center space-x-3">
                  <Building className="w-5 h-5 text-gray-400" />
                  <div className="flex-1">
                    <div className="font-medium">All Sites</div>
                    <div className="text-xs text-gray-500">
                      View files from all accessible sites
                    </div>
                  </div>
                  {showStats && siteStats && (
                    <div className="text-xs text-gray-500">
                      {siteStats.totalFiles} files
                    </div>
                  )}
                </div>
              </button>
            )}

            {/* Site List */}
            {filteredSites.length > 0 ? (
              filteredSites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => handleSiteSelect(site.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0',
                    selectedSiteId === site.id && 'bg-blue-50 text-blue-700'
                  )}
                >
                  <div className="flex items-center space-x-3">
                    {getSiteIcon(site)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <div className="font-medium truncate">{site.name}</div>
                        {showPermissions && getPermissionBadge(site)}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{site.clientName}</div>
                      {showStats && site.fileCount > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {site.fileCount} file{site.fileCount !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    
                    {!compact && (
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSiteDetails(site);
                          }}
                          className="h-6 w-6 p-0"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                        {onManageSite && site.canUpload && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              onManageSite(site.id);
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <Settings className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-gray-500">
                <Building className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm">
                  {searchQuery ? 'No sites match your search' : 'No sites available'}
                </p>
              </div>
            )}
          </div>

          {/* Create Site Button */}
          {onCreateSite && (
            <div className="p-3 border-t bg-gray-50">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onCreateSite();
                  setIsOpen(false);
                }}
                className="w-full justify-start"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New Site
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Site Details Modal */}
      {selectedSiteForDetails && (
        <SimpleModal
          isOpen={showSiteModal}
          onClose={() => setShowSiteModal(false)}
          title={selectedSiteForDetails.name}
          size="lg"
        >
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Client</label>
                <p className="text-sm text-gray-900">{selectedSiteForDetails.clientName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Your Access</label>
                <div className="mt-1">
                  {getPermissionBadge(selectedSiteForDetails)}
                </div>
              </div>
            </div>

            {selectedSiteForDetails.description && (
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="text-sm text-gray-900 mt-1">{selectedSiteForDetails.description}</p>
              </div>
            )}

            {/* Statistics */}
            {selectedSiteForDetails.stats && (
              <div>
                <h3 className="text-lg font-medium mb-4">Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {selectedSiteForDetails.stats.totalFiles}
                        </div>
                        <div className="text-sm text-gray-600">Total Files</div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {formatFileSize(selectedSiteForDetails.stats.totalSize)}
                        </div>
                        <div className="text-sm text-gray-600">Total Size</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Category Breakdown */}
            {selectedSiteForDetails.categoryStats && Object.keys(selectedSiteForDetails.categoryStats).length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-4">Files by Category</h3>
                <div className="space-y-2">
                  {Object.entries(selectedSiteForDetails.categoryStats).map(([category, stats]) => (
                    <div key={category} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="font-medium capitalize">{category}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{stats.count} files</div>
                        <div className="text-xs text-gray-500">{formatFileSize(stats.size)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Files */}
            {selectedSiteForDetails.recentFiles && selectedSiteForDetails.recentFiles.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-4">Recent Files</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedSiteForDetails.recentFiles.map((file) => (
                    <div key={file.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                      <div className="text-lg">
                        {file.mimeType.startsWith('image/') ? '🖼️' : 
                         file.mimeType === 'application/pdf' ? '📄' : '📁'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{file.originalName}</div>
                        <div className="text-xs text-gray-500">
                          {file.category} • {formatFileSize(file.size)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-2">
              <Button
                onClick={() => handleSiteSelect(selectedSiteForDetails.id)}
                className="flex-1"
              >
                View Files
              </Button>
              {onManageSite && selectedSiteForDetails.canUpload && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onManageSite(selectedSiteForDetails.id);
                    setShowSiteModal(false);
                  }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Manage
                </Button>
              )}
            </div>
          </div>
        </SimpleModal>
      )}
    </div>
  );
};

// Compact version for use in headers/toolbars
export const CompactSiteSelector: React.FC<Omit<SiteSelectorProps, 'compact'>> = (props) => {
  return <SiteSelector {...props} compact showStats={false} showPermissions={false} />;
};

export default SiteSelector;