'use client';

import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Search,
  Shield,
  User,
  MoreVertical,
  Key,
  CheckCircle,
  XCircle,
  Building,
  Upload,
  Eye,
  Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SimpleModal } from '@/components/ui/modal';
import { Navigation, MobileNavigation } from '@/components/Navigation';
import { useRequireAdmin } from '@/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { formatFileSize, formatDate, cn } from '@/lib/utils';

interface UserWithStats {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  siteCount: number;
  uploadCount: number;
}

export default function AdminUsersPage() {
  useRequireAdmin();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showUserDetailsModal, setShowUserDetailsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [createForm, setCreateForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'employee' as 'admin' | 'employee',
  });
  const [editForm, setEditForm] = useState({
    email: '',
    name: '',
    role: 'employee' as 'admin' | 'employee',
    isActive: true,
  });
  const [resetPasswordForm, setResetPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });

  // Fetch users data
  const { 
    data: usersData, 
    isLoading: usersLoading,
    refetch: refetchUsers 
  } = trpc.users.getUsers.useQuery({
    includeInactive: true,
    page: 1,
    limit: 100,
  });

  // Fetch detailed user data for modal
  const { 
    data: userDetails,
    isLoading: userDetailsLoading,
  } = trpc.users.getUser.useQuery(
    { id: selectedUser?.id || '' },
    { enabled: !!selectedUser?.id && showUserDetailsModal }
  );

  const utils = trpc.useContext();

  // User mutations
  const createUserMutation = trpc.users.createUser.useMutation({
    onSuccess: () => {
      setShowCreateModal(false);
      setCreateForm({ email: '', name: '', password: '', role: 'employee' });
      refetchUsers();
    },
  });

  const updateUserMutation = trpc.users.updateUser.useMutation({
    onSuccess: () => {
      setShowEditModal(false);
      setSelectedUser(null);
      refetchUsers();
    },
  });

  const deactivateUserMutation = trpc.users.deactivateUser.useMutation({
    onSuccess: () => {
      setShowDeleteModal(false);
      setSelectedUser(null);
      refetchUsers();
    },
  });

  const resetPasswordMutation = trpc.users.resetPassword.useMutation({
    onSuccess: () => {
      setShowResetPasswordModal(false);
      setSelectedUser(null);
      setResetPasswordForm({ newPassword: '', confirmPassword: '' });
    },
  });

  // Filter users based on search
  const filteredUsers = usersData?.users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleCreateUser = async () => {
    if (!createForm.email.trim() || !createForm.name.trim() || !createForm.password.trim()) return;
    
    await createUserMutation.mutateAsync(createForm);
  };

  const handleEditUser = async () => {
    if (!selectedUser || !editForm.email.trim() || !editForm.name.trim()) return;
    
    await updateUserMutation.mutateAsync({
      id: selectedUser.id,
      ...editForm,
    });
  };

  const handleDeactivateUser = async () => {
    if (!selectedUser) return;
    
    await deactivateUserMutation.mutateAsync({ id: selectedUser.id });
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !resetPasswordForm.newPassword || 
        resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword) return;
    
    await resetPasswordMutation.mutateAsync({
      userId: selectedUser.id,
      newPassword: resetPasswordForm.newPassword,
    });
  };

  const openEditModal = (user: UserWithStats) => {
    setSelectedUser(user);
    setEditForm({
      email: user.email,
      name: user.name,
      role: user.role as 'admin' | 'employee',
      isActive: user.isActive,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (user: UserWithStats) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const openResetPasswordModal = (user: UserWithStats) => {
    setSelectedUser(user);
    setResetPasswordForm({ newPassword: '', confirmPassword: '' });
    setShowResetPasswordModal(true);
  };

  const openUserDetailsModal = (user: UserWithStats) => {
    setSelectedUser(user);
    setShowUserDetailsModal(true);
  };

  if (usersLoading) {
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
                <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                <p className="text-sm text-gray-600">
                  Manage user accounts and permissions
                </p>
              </div>
              
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create User
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="space-y-6">
            {/* Search and Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-2">
                <Card>
                  <CardContent className="p-6">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <Input
                        type="text"
                        placeholder="Search users by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Users</p>
                      <p className="text-xl font-bold text-gray-900">{usersData?.total || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Active Users</p>
                      <p className="text-xl font-bold text-gray-900">
                        {usersData?.users.filter(u => u.isActive).length || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Users Table */}
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">User</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Role</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Sites</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Uploads</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Created</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-4 px-4">
                            <div className="flex items-center">
                              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                                <User className="w-4 h-4 text-gray-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{user.name}</p>
                                <p className="text-sm text-gray-600">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className={cn(
                              "px-2 py-1 text-xs rounded-full capitalize",
                              user.role === 'admin' 
                                ? "bg-purple-100 text-purple-800" 
                                : "bg-blue-100 text-blue-800"
                            )}>
                              {user.role}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center">
                              {user.isActive ? (
                                <>
                                  <CheckCircle className="w-4 h-4 text-green-500 mr-1" />
                                  <span className="text-sm text-green-600">Active</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-4 h-4 text-red-500 mr-1" />
                                  <span className="text-sm text-red-600">Inactive</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-sm text-gray-900">{user.siteCount}</span>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-sm text-gray-900">{user.uploadCount}</span>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-sm text-gray-600">{formatDate(user.createdAt)}</span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <div className="relative group">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                              <div className="absolute right-0 top-8 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                <div className="py-1">
                                  <button
                                    onClick={() => openUserDetailsModal(user)}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center"
                                  >
                                    <Eye className="w-4 h-4 mr-2" />
                                    View Details
                                  </button>
                                  <button
                                    onClick={() => openEditModal(user)}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center"
                                  >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit User
                                  </button>
                                  <button
                                    onClick={() => openResetPasswordModal(user)}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center"
                                  >
                                    <Key className="w-4 h-4 mr-2" />
                                    Reset Password
                                  </button>
                                  <button
                                    onClick={() => openDeleteModal(user)}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Deactivate User
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {filteredUsers.length === 0 && (
                    <div className="text-center py-12">
                      <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-gray-600 mb-2">
                        {searchQuery ? 'No users match your search' : 'No users found'}
                      </p>
                      {!searchQuery && (
                        <Button onClick={() => setShowCreateModal(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Create Your First User
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Create User Modal */}
      <SimpleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New User"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name *</label>
            <Input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g., John Smith"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Email *</label>
            <Input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="e.g., john@example.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Password *</label>
            <Input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              placeholder="Minimum 8 characters"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Role *</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as 'admin' | 'employee' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="employee">Employee</option>
              <option value="admin">Administrator</option>
            </select>
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
              onClick={handleCreateUser}
              disabled={createUserMutation.isLoading || !createForm.email.trim() || !createForm.name.trim() || !createForm.password.trim()}
              className="flex-1"
            >
              {createUserMutation.isLoading ? 'Creating...' : 'Create User'}
            </Button>
          </div>
        </div>
      </SimpleModal>

      {/* Edit User Modal */}
      <SimpleModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit User"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name *</label>
            <Input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="e.g., John Smith"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Email *</label>
            <Input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              placeholder="e.g., john@example.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Role *</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as 'admin' | 'employee' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="employee">Employee</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActiveEdit"
              checked={editForm.isActive}
              onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="isActiveEdit" className="text-sm font-medium">
              User is active
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
              onClick={handleEditUser}
              disabled={updateUserMutation.isLoading || !editForm.email.trim() || !editForm.name.trim()}
              className="flex-1"
            >
              {updateUserMutation.isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </SimpleModal>

      {/* Reset Password Modal */}
      <SimpleModal
        isOpen={showResetPasswordModal}
        onClose={() => setShowResetPasswordModal(false)}
        title="Reset Password"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Reset password for {selectedUser?.name}
          </p>
          
          <div>
            <label className="block text-sm font-medium mb-2">New Password *</label>
            <Input
              type="password"
              value={resetPasswordForm.newPassword}
              onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, newPassword: e.target.value })}
              placeholder="Minimum 8 characters"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Confirm Password *</label>
            <Input
              type="password"
              value={resetPasswordForm.confirmPassword}
              onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, confirmPassword: e.target.value })}
              placeholder="Confirm new password"
            />
          </div>
          
          {resetPasswordForm.newPassword && resetPasswordForm.confirmPassword && 
           resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword && (
            <p className="text-sm text-red-600">Passwords do not match</p>
          )}
          
          <div className="flex space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowResetPasswordModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={
                resetPasswordMutation.isLoading || 
                !resetPasswordForm.newPassword || 
                resetPasswordForm.newPassword !== resetPasswordForm.confirmPassword ||
                resetPasswordForm.newPassword.length < 8
              }
              className="flex-1"
            >
              {resetPasswordMutation.isLoading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </div>
        </div>
      </SimpleModal>

      {/* Deactivate User Modal */}
      <SimpleModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Deactivate User"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to deactivate {selectedUser?.name}? They will lose access to the system.
          </p>
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
              onClick={handleDeactivateUser}
              disabled={deactivateUserMutation.isLoading}
              className="flex-1"
            >
              {deactivateUserMutation.isLoading ? 'Deactivating...' : 'Deactivate User'}
            </Button>
          </div>
        </div>
      </SimpleModal>

      {/* User Details Modal */}
      <SimpleModal
        isOpen={showUserDetailsModal}
        onClose={() => setShowUserDetailsModal(false)}
        title={`User Details - ${selectedUser?.name}`}
        size="xl"
      >
        {userDetailsLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : userDetails ? (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Name</label>
                <p className="text-sm text-gray-900">{userDetails.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-sm text-gray-900">{userDetails.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Role</label>
                <p className="text-sm text-gray-900 capitalize">{userDetails.role}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <p className={cn(
                  "text-sm",
                  userDetails.isActive ? "text-green-600" : "text-red-600"
                )}>
                  {userDetails.isActive ? 'Active' : 'Inactive'}
                </p>
              </div>
            </div>

            {/* Statistics */}
            <div>
              <h3 className="text-lg font-medium mb-4">Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {userDetails.stats.totalUploads}
                      </div>
                      <div className="text-sm text-gray-600">Total Uploads</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {formatFileSize(userDetails.stats.totalSize)}
                      </div>
                      <div className="text-sm text-gray-600">Total Size</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Site Permissions */}
            {userDetails.sitePermissions.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-4">Site Access</h3>
                <div className="space-y-2">
                  {userDetails.sitePermissions.map((perm: { siteId: string; siteName: string; canView: boolean; canUpload: boolean }) => (
                    <div key={perm.siteId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex items-center space-x-3">
                        <Building className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">{perm.siteName}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {perm.canView && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </span>
                        )}
                        {perm.canUpload && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                            <Upload className="w-3 h-3 mr-1" />
                            Upload
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Uploads */}
            {userDetails.recentUploads.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-4">Recent Uploads</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {userDetails.recentUploads.map((file) => (
                    <div key={file.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                      <div className="text-lg">
                        {file.category === 'furniture' ? '🪑' :
                         file.category === 'lighting' ? '💡' :
                         file.category === 'textiles' ? '🧵' :
                         file.category === 'accessories' ? '🎨' : '🏠'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{file.originalName}</div>
                        <div className="text-xs text-gray-500">
                          {file.siteName} • {formatFileSize(file.size)} • {formatDate(file.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>Failed to load user details</p>
          </div>
        )}
      </SimpleModal>
    </div>
  );
}