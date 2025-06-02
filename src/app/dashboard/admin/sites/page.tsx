'use client';

import React, { useState } from 'react';
import { 
  Building, 
  Plus, 
  Edit, 
  Trash2, 
  Users, 
  Files, 
  Eye, 
  Upload, 
  Search,
  MoreVertical,
  Settings,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SimpleModal } from '@/components/ui/modal';
import { Navigation, MobileNavigation } from '@/components/Navigation';
import { useRequireAdmin } from '@/hooks/useAuth';
import { useSitePermissions } from '@/hooks/useSites';
import { trpc } from '@/lib/trpc';
import { formatFileSize, formatDate, cn } from '@/lib/utils';
import type { SiteWithStats, SiteUser } from '@/types';

export default function AdminSitesPage() {
  useRequireAdmin();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedSite, setSelectedSite] = useState<SiteWithStats | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    clientName: '',
  });
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    clientName: '',
    isActive: true,
  });

  // Fetch sites data
  const { 
    data: sites, 
    isLoading: sitesLoading,
    refetch: refetchSites 
  } = trpc.sites.getSites.useQuery();

  const utils = trpc.useContext();

  // Site mutations
  const createSiteMutation = trpc.sites.createSite.useMutation({
    onSuccess: () => {
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', clientName: '' });
      refetchSites();
    },
  });

  const updateSiteMutation = trpc.sites.updateSite.useMutation({
    onSuccess: () => {
      setShowEditModal(false);
      setSelectedSite(null);
      refetchSites();
    },
  });

  const deleteSiteMutation = trpc.sites.deleteSite.useMutation({
    onSuccess: () => {
      setShowDeleteModal(false);
      setSelectedSite(null);
      refetchSites();
    },
  });

  // Site permissions hook
  const {
    siteUsers,
    unassignedUsers,
    grantAccess,
    revokeAccess,
    updatePermissions,
    isLoading: permissionsLoading,
  } = useSitePermissions(selectedSite?.id || '');

  // Filter sites based on search
  const filteredSites = sites?.filter(site =>
    site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    site.clientName.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleCreateSite = async () => {
    if (!createForm.name.trim() || !createForm.clientName.trim()) return;
    
    await createSiteMutation.mutateAsync(createForm);
  };

  const handleEditSite = async () => {
    if (!selectedSite || !editForm.name.trim() || !editForm.clientName.trim()) return;
    
    await updateSiteMutation.mutateAsync({
      id: selectedSite.id,
      ...editForm,
    });
  };

  const handleDeleteSite = async () => {
    if (!selectedSite) return;
    
    await deleteSiteMutation.mutateAsync({ id: selectedSite.id });
  };

  const openEditModal = (site: SiteWithStats) => {
    setSelectedSite(site);
    setEditForm({
      name: site.name,
      description: site.description || '',
      clientName: site.clientName,
      isActive: site.isActive,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (site: SiteWithStats) => {
    setSelectedSite(site);
    setShowDeleteModal(true);
  };

  const openPermissionsModal = (site: SiteWithStats) => {
    setSelectedSite(site);
    setShowPermissionsModal(true);
  };

  const handleGrantAccess = async (userId: string, canView: boolean, canUpload: boolean) => {
    if (!selectedSite) return;
    
    await grantAccess({
      siteId: selectedSite.id,
      userId,
      canView,
      canUpload,
    });
  };

  const handleRevokeAccess = async (userId: string) => {
    await revokeAccess(userId);
  };

  const handleUpdatePermissions = async (userId: string, canView: boolean, canUpload: boolean) => {
    if (!selectedSite) return;
    
    await updatePermissions({
      siteId: selectedSite.id,
      userId,
      canView,
      canUpload,
    });
  };

  if (sitesLoading) {
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
                <h1 className="text-2xl font-bold text-gray-900">Site Management</h1>
                <p className="text-sm text-gray-600">
                  Manage sites and user permissions
                </p>
              </div>
              
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Site
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="space-y-6">
            {/* Search and Filters */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <Input
                      type="text"
                      placeholder="Search sites by name or client..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sites Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSites.map((site) => (
                <Card key={site.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{site.name}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">{site.clientName}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {site.isActive ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <div className="relative group">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          <div className="absolute right-0 top-8 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                            <div className="py-1">
                              <button
                                onClick={() => openEditModal(site)}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center"
                              >
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Site
                              </button>
                              <button
                                onClick={() => openPermissionsModal(site)}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center"
                              >
                                <Settings className="w-4 h-4 mr-2" />
                                Manage Users
                              </button>
                              <button
                                onClick={() => openDeleteModal(site)}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Site
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {site.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                        {site.description}
                      </p>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center">
                        <Files className="w-4 h-4 mr-2 text-gray-400" />
                        <span>{site.fileCount} files</span>
                      </div>
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-2 text-gray-400" />
                        <span>Users</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Created {formatDate(site.createdAt)}</span>
                        <span className={cn(
                          "px-2 py-1 rounded-full",
                          site.isActive 
                            ? "bg-green-100 text-green-800" 
                            : "bg-red-100 text-red-800"
                        )}>
                          {site.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {filteredSites.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Building className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">
                    {searchQuery ? 'No sites match your search' : 'No sites created yet'}
                  </p>
                  {!searchQuery && (
                    <Button onClick={() => setShowCreateModal(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Site
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Create Site Modal */}
      <SimpleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Site"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Site Name *</label>
            <Input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g., Luxury Downtown Apartment"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Client Name *</label>
            <Input
              type="text"
              value={createForm.clientName}
              onChange={(e) => setCreateForm({ ...createForm, clientName: e.target.value })}
              placeholder="e.g., John Smith"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Brief description of the project..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
          
          <div className="flex space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowCreateModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSite}
              disabled={createSiteMutation.isLoading || !createForm.name.trim() || !createForm.clientName.trim()}
              className="flex-1"
            >
              {createSiteMutation.isLoading ? 'Creating...' : 'Create Site'}
            </Button>
          </div>
        </div>
      </SimpleModal>

      {/* Edit Site Modal */}
      <SimpleModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Site"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Site Name *</label>
            <Input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="e.g., Luxury Downtown Apartment"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Client Name *</label>
            <Input
              type="text"
              value={editForm.clientName}
              onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
              placeholder="e.g., John Smith"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="Brief description of the project..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActive"
              checked={editForm.isActive}
              onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="isActive" className="text-sm font-medium">
              Site is active
            </label>
          </div>
          
          <div className="flex space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowEditModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSite}
              disabled={updateSiteMutation.isLoading || !editForm.name.trim() || !editForm.clientName.trim()}
              className="flex-1"
            >
              {updateSiteMutation.isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </SimpleModal>

      {/* Delete Site Modal */}
      <SimpleModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Site"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete "{selectedSite?.name}"? This action cannot be undone.
          </p>
          {selectedSite?.fileCount > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                This site contains {selectedSite.fileCount} files. Please delete all files before deleting the site.
              </p>
            </div>
          )}
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSite}
              disabled={deleteSiteMutation.isLoading || selectedSite?.fileCount > 0}
              className="flex-1"
            >
              {deleteSiteMutation.isLoading ? 'Deleting...' : 'Delete Site'}
            </Button>
          </div>
        </div>
      </SimpleModal>

      {/* Permissions Modal */}
      <SimpleModal
        isOpen={showPermissionsModal}
        onClose={() => setShowPermissionsModal(false)}
        title={`Manage Users - ${selectedSite?.name}`}
        size="xl"
      >
        <div className="space-y-6">
          {/* Current Users */}
          <div>
            <h3 className="text-lg font-medium mb-4">Current Users</h3>
            {siteUsers.length > 0 ? (
              <div className="space-y-3">
                {siteUsers.map((user) => (
                  <div key={user.userId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{user.userName}</p>
                      <p className="text-sm text-gray-600">{user.userEmail}</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-1">
                          <input
                            type="checkbox"
                            checked={user.canView}
                            onChange={(e) => handleUpdatePermissions(user.userId, e.target.checked, user.canUpload)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">View</span>
                        </label>
                        <label className="flex items-center space-x-1">
                          <input
                            type="checkbox"
                            checked={user.canUpload}
                            onChange={(e) => handleUpdatePermissions(user.userId, user.canView, e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">Upload</span>
                        </label>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevokeAccess(user.userId)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No users assigned to this site</p>
            )}
          </div>

          {/* Add Users */}
          {unassignedUsers.length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-4">Add Users</h3>
              <div className="space-y-3">
                {unassignedUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGrantAccess(user.id, true, false)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View Only
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleGrantAccess(user.id, true, true)}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        Full Access
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SimpleModal>
    </div>
  );
}