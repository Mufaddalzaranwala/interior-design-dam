import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '../lib/trpc';
import type { AuthUser, LoginCredentials, RegisterData, AuthState } from '../types';

export const useAuth = () => {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // tRPC queries and mutations
  const { data: checkAuthData, isLoading: checkAuthLoading, refetch: refetchAuth } = 
    trpc.auth.checkAuth.useQuery(undefined, {
      retry: false,
      refetchOnWindowFocus: false,
    });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      setAuthState({
        user: data.user,
        isLoading: false,
        isAuthenticated: true,
      });
      router.push('/dashboard');
    },
    onError: (error) => {
      console.error('Login error:', error);
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
      router.push('/login');
    },
    onError: (error) => {
      console.error('Logout error:', error);
      // Force logout even if server call fails
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
      router.push('/login');
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      // Registration successful, but user needs to login
      router.push('/login?message=User created successfully');
    },
    onError: (error) => {
      console.error('Registration error:', error);
    },
  });

  const changePasswordMutation = trpc.auth.changePassword.useMutation();

  // Update auth state when check auth data changes
  useEffect(() => {
    if (checkAuthData) {
      setAuthState({
        user: checkAuthData.user,
        isLoading: false,
        isAuthenticated: checkAuthData.isAuthenticated,
      });
    } else if (!checkAuthLoading) {
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, [checkAuthData, checkAuthLoading]);

  // Login function
  const login = useCallback(async (credentials: LoginCredentials) => {
    return loginMutation.mutateAsync(credentials);
  }, [loginMutation]);

  // Logout function
  const logout = useCallback(async () => {
    return logoutMutation.mutateAsync();
  }, [logoutMutation]);

  // Register function (admin only)
  const register = useCallback(async (userData: RegisterData) => {
    return registerMutation.mutateAsync(userData);
  }, [registerMutation]);

  // Change password function
  const changePassword = useCallback(async (passwordData: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    return changePasswordMutation.mutateAsync(passwordData);
  }, [changePasswordMutation]);

  // Refresh auth state
  const refreshAuth = useCallback(() => {
    refetchAuth();
  }, [refetchAuth]);

  // Check if user has specific role
  const hasRole = useCallback((role: 'admin' | 'employee') => {
    return authState.user?.role === role;
  }, [authState.user]);

  // Check if user is admin
  const isAdmin = useCallback(() => {
    return authState.user?.role === 'admin';
  }, [authState.user]);

  // Require authentication (redirect to login if not authenticated)
  const requireAuth = useCallback(() => {
    if (!authState.isLoading && !authState.isAuthenticated) {
      router.push('/login');
      return false;
    }
    return authState.isAuthenticated;
  }, [authState, router]);

  // Require admin role (redirect if not admin)
  const requireAdmin = useCallback(() => {
    if (!authState.isLoading) {
      if (!authState.isAuthenticated) {
        router.push('/login');
        return false;
      }
      if (!isAdmin()) {
        router.push('/dashboard');
        return false;
      }
    }
    return isAdmin();
  }, [authState, router, isAdmin]);

  return {
    // State
    user: authState.user,
    isLoading: authState.isLoading || checkAuthLoading,
    isAuthenticated: authState.isAuthenticated,
    
    // Actions
    login,
    logout,
    register,
    changePassword,
    refreshAuth,
    
    // Utilities
    hasRole,
    isAdmin,
    requireAuth,
    requireAdmin,
    
    // Mutation states
    isLoggingIn: loginMutation.isLoading,
    isLoggingOut: logoutMutation.isLoading,
    isRegistering: registerMutation.isLoading,
    isChangingPassword: changePasswordMutation.isLoading,
    
    // Errors
    loginError: loginMutation.error?.message,
    logoutError: logoutMutation.error?.message,
    registerError: registerMutation.error?.message,
    changePasswordError: changePasswordMutation.error?.message,
  };
};

// Hook for protecting routes that require authentication
export const useRequireAuth = () => {
  const { requireAuth, isLoading } = useAuth();
  
  useEffect(() => {
    if (!isLoading) {
      requireAuth();
    }
  }, [requireAuth, isLoading]);
};

// Hook for protecting routes that require admin access
export const useRequireAdmin = () => {
  const { requireAdmin, isLoading } = useAuth();
  
  useEffect(() => {
    if (!isLoading) {
      requireAdmin();
    }
  }, [requireAdmin, isLoading]);
};

// Hook for getting current user permissions
export const useUserPermissions = () => {
  const { user, isAuthenticated } = useAuth();
  
  const { data: profile, isLoading } = trpc.users.getProfile.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      refetchOnWindowFocus: false,
    }
  );

  return {
    permissions: profile?.sitePermissions || [],
    isLoading,
    isAdmin: user?.role === 'admin',
    canUploadToSites: profile?.sitePermissions?.filter(p => p.canUpload).map(p => p.siteId) || [],
    canViewSites: profile?.sitePermissions?.filter(p => p.canView).map(p => p.siteId) || [],
  };
};

export default useAuth;