// Re-export database types
export type {
    User,
    NewUser,
    Site,
    NewSite,
    SitePermission,
    NewSitePermission,
    File,
    NewFile,
    SearchQuery,
    NewSearchQuery,
    SharedLink,
    NewSharedLink,
  } from '../../database/schema';
  
  export { UserRole, FileCategory, ProcessingStatus } from '../../database/schema';
  
  // Auth types
  export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'employee';
    isActive: boolean;
  }
  
  export interface LoginCredentials {
    email: string;
    password: string;
  }
  
  export interface RegisterData {
    email: string;
    password: string;
    name: string;
    role?: 'admin' | 'employee';
  }
  
  // File upload types
  export interface FileUploadData {
    name: string;
    size: number;
    type: string;
    data: string; // Base64 encoded
  }
  
  export interface UploadRequest {
    siteId: string;
    category: FileCategory;
    files: FileUploadData[];
  }
  
  export interface UploadResult {
    id: string;
    filename: string;
    originalName: string;
    size: number;
    category: string;
    gcsPath: string;
    thumbnailPath?: string;
  }
  
  export interface UploadResponse {
    uploaded: UploadResult[];
    errors: Array<{
      filename: string;
      error: string;
    }>;
    message: string;
  }
  
  // Search types
  export interface SearchFilters {
    siteIds?: string[];
    categories?: FileCategory[];
    dateFrom?: string;
    dateTo?: string;
    mimeTypes?: string[];
  }
  
  export interface SearchRequest {
    query: string;
    siteIds?: string[];
    categories?: FileCategory[];
    dateFrom?: string;
    dateTo?: string;
    mimeTypes?: string[];
    page?: number;
    limit?: number;
    sortBy?: 'relevance' | 'createdAt' | 'name' | 'size';
    sortOrder?: 'asc' | 'desc';
  }
  
  export interface SearchResult {
    files: FileWithDetails[];
    total: number;
    page: number;
    limit: number;
    searchTime: number;
    tier: 'structured' | 'fulltext' | 'semantic' | 'none';
  }
  
  // Extended file type with additional details
  export interface FileWithDetails extends File {
    siteName?: string;
    uploaderName?: string;
    canDownload?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    relevanceScore?: number;
  }
  
  // Site types
  export interface SiteWithStats extends Site {
    fileCount: number;
    canView: boolean;
    canUpload: boolean;
    stats?: {
      totalFiles: number;
      totalSize: number;
    };
    categoryStats?: Record<string, { count: number; size: number }>;
    recentFiles?: FileWithDetails[];
  }
  
  export interface SiteUser {
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    canView: boolean;
    canUpload: boolean;
    grantedAt: Date;
  }
  
  // Permission types
  export interface UserPermissions {
    siteId: string;
    siteName: string;
    canView: boolean;
    canUpload: boolean;
  }
  
  export interface PermissionRequest {
    siteId: string;
    userId: string;
    canView: boolean;
    canUpload: boolean;
  }
  
  // Analytics types
  export interface SystemStats {
    totalUsers: number;
    totalSites: number;
    totalFiles: number;
    totalSize: number;
  }
  
  export interface ProcessingStats {
    [ProcessingStatus.PENDING]: number;
    [ProcessingStatus.PROCESSING]: number;
    [ProcessingStatus.COMPLETED]: number;
    [ProcessingStatus.FAILED]: number;
  }
  
  export interface UploadStats {
    totalFiles: number;
    totalSize: number;
    filesByCategory: Record<string, { count: number; size: number }>;
    recentUploads: FileWithDetails[];
  }
  
  export interface SearchAnalytics {
    recentSearches: SearchQuery[];
    popularSearches: Array<{
      query: string;
      count: number;
      avgResponseTime: number;
    }>;
    stats: {
      totalSearches: number;
      avgResponseTime: number;
      avgResultsCount: number;
    };
  }
  
  export interface SystemHealth {
    database: boolean;
    storage: boolean;
    ai: boolean;
    overall: boolean;
    metrics: {
      failedProcessing: number;
      pendingProcessing: number;
    };
  }
  
  // UI component types
  export interface TableColumn<T> {
    key: keyof T;
    label: string;
    sortable?: boolean;
    render?: (value: any, row: T) => React.ReactNode;
    width?: string;
  }
  
  export interface FilterOption {
    value: string;
    label: string;
    count?: number;
  }
  
  export interface SortOption {
    value: string;
    label: string;
  }
  
  // Form types
  export interface FormField {
    name: string;
    label: string;
    type: 'text' | 'email' | 'password' | 'select' | 'textarea' | 'checkbox' | 'file';
    placeholder?: string;
    required?: boolean;
    options?: FilterOption[];
    validation?: {
      min?: number;
      max?: number;
      pattern?: RegExp;
      custom?: (value: any) => string | undefined;
    };
  }
  
  // Modal types
  export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
  }
  
  // Toast types
  export interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    description?: string;
    duration?: number;
  }
  
  // Pagination types
  export interface PaginationProps {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
    onLimitChange?: (limit: number) => void;
  }
  
  // File sharing types
  export interface ShareLinkRequest {
    fileId: string;
    expiresInHours: number;
  }
  
  export interface ShareLinkResponse {
    url: string;
    token: string;
    expiresAt: Date;
    expiresInHours: number;
  }
  
  // Drag and drop types
  export interface DragDropFile {
    file: File;
    id: string;
    progress?: number;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    error?: string;
  }
  
  // Navigation types
  export interface NavItem {
    label: string;
    href: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: string | number;
    children?: NavItem[];
    adminOnly?: boolean;
  }
  
  // State types for hooks
  export interface AuthState {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
  }
  
  export interface UploadState {
    files: DragDropFile[];
    isUploading: boolean;
    progress: number;
    error: string | null;
  }
  
  export interface SearchState {
    query: string;
    filters: SearchFilters;
    results: FileWithDetails[];
    isLoading: boolean;
    error: string | null;
    suggestions: string[];
    total: number;
    page: number;
    hasMore: boolean;
  }
  
  // API response types
  export interface ApiResponse<T = any> {
    data?: T;
    error?: string;
    message?: string;
    success: boolean;
  }
  
  export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }
  
  // Error types
  export interface AppError {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
  }
  
  // Theme types
  export interface ThemeConfig {
    colors: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
      foreground: string;
      muted: string;
      border: string;
    };
    spacing: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
    };
    borderRadius: {
      sm: string;
      md: string;
      lg: string;
    };
  }
  
  // Configuration types
  export interface AppConfig {
    maxFileSize: number;
    allowedFileTypes: string[];
    maxFilesPerUpload: number;
    searchResultsPerPage: number;
    shareUrlExpiryHours: number;
    thumbnailSize: {
      width: number;
      height: number;
    };
  }
  
  // Utility types
  export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
  };
  
  export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
  
  export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
  
  // Event handler types
  export type EventHandler<T = any> = (event: T) => void;
  export type AsyncEventHandler<T = any> = (event: T) => Promise<void>;
  
  // Component prop types
  export interface BaseComponentProps {
    className?: string;
    children?: React.ReactNode;
  }
  
  export interface InteractiveComponentProps extends BaseComponentProps {
    disabled?: boolean;
    loading?: boolean;
    onClick?: EventHandler<React.MouseEvent>;
  }
  
  // File type guards
  export const isImageFile = (file: File): boolean => {
    return file.mimeType.startsWith('image/');
  };
  
  export const isDocumentFile = (file: File): boolean => {
    return file.mimeType === 'application/pdf' || 
           file.mimeType.includes('dwg') || 
           file.mimeType.includes('dxf');
  };
  
  export const isProcessingComplete = (file: File): boolean => {
    return file.processingStatus === ProcessingStatus.COMPLETED;
  };
  
  export const isProcessingFailed = (file: File): boolean => {
    return file.processingStatus === ProcessingStatus.FAILED;
  };
  
  // Constants
  export const FILE_CATEGORIES = Object.values(FileCategory);
  export const PROCESSING_STATUSES = Object.values(ProcessingStatus);
  export const USER_ROLES = Object.values(UserRole);
  
  export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  export const SUPPORTED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
  ];
  export const SUPPORTED_DOCUMENT_TYPES = [
    'application/pdf',
    'application/x-autocad',
    'application/dwg',
    'application/dxf',
    'image/vnd.dwg',
    'image/x-dwg',
  ];
  export const SUPPORTED_FILE_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOCUMENT_TYPES];
  
  // Default values
  export const DEFAULT_SEARCH_FILTERS: SearchFilters = {};
  export const DEFAULT_PAGINATION = { page: 1, limit: 20 };
  export const DEFAULT_SORT = { sortBy: 'createdAt' as const, sortOrder: 'desc' as const };
  
  // Validation schemas (for client-side validation)
  export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  export const PASSWORD_MIN_LENGTH = 8;
  export const NAME_MIN_LENGTH = 1;
  export const SITE_NAME_MIN_LENGTH = 1;
  export const CLIENT_NAME_MIN_LENGTH = 1;