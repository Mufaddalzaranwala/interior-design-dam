import { useState, useCallback, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { validateFileUpload, generateId } from '../lib/utils';
import type { 
  FileCategory, 
  DragDropFile, 
  UploadState, 
  FileUploadData,
  UploadResponse 
} from '../types';

interface UseUploadOptions {
  siteId?: string;
  category?: FileCategory;
  onUploadComplete?: (response: UploadResponse) => void;
  onUploadError?: (error: string) => void;
  onProgressUpdate?: (progress: number) => void;
  maxFiles?: number;
  autoUpload?: boolean;
}

export const useUpload = (options: UseUploadOptions = {}) => {
  const {
    siteId: defaultSiteId,
    category: defaultCategory,
    onUploadComplete,
    onUploadError,
    onProgressUpdate,
    maxFiles = 10,
    autoUpload = false,
  } = options;

  const [uploadState, setUploadState] = useState<UploadState>({
    files: [],
    isUploading: false,
    progress: 0,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // tRPC mutation for file upload
  const uploadMutation = trpc.files.upload.useMutation({
    onSuccess: (data) => {
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        progress: 100,
        error: null,
      }));
      onUploadComplete?.(data);
    },
    onError: (error) => {
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: error.message,
      }));
      onUploadError?.(error.message);
    },
  });

  // Convert File to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }, []);

  // Add files to upload queue
  const addFiles = useCallback(async (newFiles: File[]) => {
    const validFiles: DragDropFile[] = [];
    const errors: string[] = [];

    // Check if adding these files would exceed the limit
    if (uploadState.files.length + newFiles.length > maxFiles) {
      errors.push(`Cannot add more than ${maxFiles} files`);
      return { success: false, errors };
    }

    for (const file of newFiles) {
      // Validate file
      const validation = validateFileUpload(file);
      if (!validation.valid) {
        errors.push(`${file.name}: ${validation.error}`);
        continue;
      }

      // Check for duplicates
      const isDuplicate = uploadState.files.some(
        existing => existing.file.name === file.name && existing.file.size === file.size
      );

      if (isDuplicate) {
        errors.push(`${file.name}: File already added`);
        continue;
      }

      validFiles.push({
        id: generateId('file'),
        file,
        progress: 0,
        status: 'pending',
      });
    }

    if (validFiles.length > 0) {
      setUploadState(prev => ({
        ...prev,
        files: [...prev.files, ...validFiles],
        error: null,
      }));

      // Auto-upload if enabled and we have required params
      if (autoUpload && defaultSiteId && defaultCategory) {
        await startUpload(defaultSiteId, defaultCategory);
      }
    }

    return {
      success: validFiles.length > 0,
      errors,
      addedCount: validFiles.length,
    };
  }, [uploadState.files, maxFiles, autoUpload, defaultSiteId, defaultCategory]);

  // Remove file from queue
  const removeFile = useCallback((fileId: string) => {
    setUploadState(prev => ({
      ...prev,
      files: prev.files.filter(f => f.id !== fileId),
    }));
  }, []);

  // Clear all files
  const clearFiles = useCallback(() => {
    setUploadState(prev => ({
      ...prev,
      files: [],
      progress: 0,
      error: null,
    }));
  }, []);

  // Update file progress
  const updateFileProgress = useCallback((fileId: string, progress: number, status?: DragDropFile['status'], error?: string) => {
    setUploadState(prev => ({
      ...prev,
      files: prev.files.map(f =>
        f.id === fileId
          ? { ...f, progress, status: status || f.status, error }
          : f
      ),
    }));
  }, []);

  // Start upload process
  const startUpload = useCallback(async (siteId: string, category: FileCategory) => {
    if (uploadState.files.length === 0) {
      return { success: false, error: 'No files to upload' };
    }

    if (uploadState.isUploading) {
      return { success: false, error: 'Upload already in progress' };
    }

    setUploadState(prev => ({
      ...prev,
      isUploading: true,
      progress: 0,
      error: null,
    }));

    try {
      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // Convert files to upload format
      const uploadFiles: FileUploadData[] = [];
      const totalFiles = uploadState.files.length;

      for (let i = 0; i < uploadState.files.length; i++) {
        const dragFile = uploadState.files[i];
        
        try {
          // Update file status
          updateFileProgress(dragFile.id, 0, 'uploading');

          // Convert to base64
          const base64Data = await fileToBase64(dragFile.file);

          uploadFiles.push({
            name: dragFile.file.name,
            size: dragFile.file.size,
            type: dragFile.file.type,
            data: base64Data,
          });

          // Update progress
          const progress = Math.round(((i + 1) / totalFiles) * 50); // First 50% for processing files
          setUploadState(prev => ({ ...prev, progress }));
          onProgressUpdate?.(progress);

        } catch (error) {
          updateFileProgress(dragFile.id, 0, 'error', 'Failed to process file');
          console.error(`Failed to process file ${dragFile.file.name}:`, error);
        }
      }

      if (uploadFiles.length === 0) {
        throw new Error('No valid files to upload');
      }

      // Upload to server
      const response = await uploadMutation.mutateAsync({
        siteId,
        category,
        files: uploadFiles,
      });

      // Update file statuses based on response
      uploadState.files.forEach(dragFile => {
        const wasUploaded = response.uploaded.some(
          uploaded => uploaded.originalName === dragFile.file.name
        );
        const error = response.errors.find(
          error => error.filename === dragFile.file.name
        );

        if (wasUploaded) {
          updateFileProgress(dragFile.id, 100, 'completed');
        } else if (error) {
          updateFileProgress(dragFile.id, 0, 'error', error.error);
        }
      });

      setUploadState(prev => ({ ...prev, progress: 100 }));
      onProgressUpdate?.(100);

      return { 
        success: true, 
        response,
        uploadedCount: response.uploaded.length,
        errorCount: response.errors.length,
      };

    } catch (error: any) {
      console.error('Upload error:', error);
      
      // Update all files as failed
      uploadState.files.forEach(dragFile => {
        updateFileProgress(dragFile.id, 0, 'error', error.message || 'Upload failed');
      });

      const errorMessage = error.message || 'Upload failed';
      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        error: errorMessage,
      }));

      return { success: false, error: errorMessage };
    } finally {
      abortControllerRef.current = null;
    }
  }, [uploadState.files, uploadState.isUploading, updateFileProgress, fileToBase64, uploadMutation, onProgressUpdate]);

  // Cancel upload
  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setUploadState(prev => ({
      ...prev,
      isUploading: false,
      progress: 0,
      files: prev.files.map(f => ({
        ...f,
        status: f.status === 'uploading' ? 'pending' : f.status,
        progress: f.status === 'uploading' ? 0 : f.progress,
      })),
    }));
  }, []);

  // Retry failed uploads
  const retryFailedUploads = useCallback(async (siteId: string, category: FileCategory) => {
    const failedFiles = uploadState.files.filter(f => f.status === 'error');
    
    if (failedFiles.length === 0) {
      return { success: false, error: 'No failed uploads to retry' };
    }

    // Reset failed files to pending
    setUploadState(prev => ({
      ...prev,
      files: prev.files.map(f => 
        f.status === 'error' 
          ? { ...f, status: 'pending', progress: 0, error: undefined }
          : f
      ),
    }));

    return startUpload(siteId, category);
  }, [uploadState.files, startUpload]);

  // Get upload statistics
  const getUploadStats = useCallback(() => {
    const completed = uploadState.files.filter(f => f.status === 'completed').length;
    const failed = uploadState.files.filter(f => f.status === 'error').length;
    const pending = uploadState.files.filter(f => f.status === 'pending').length;
    const uploading = uploadState.files.filter(f => f.status === 'uploading').length;

    return {
      total: uploadState.files.length,
      completed,
      failed,
      pending,
      uploading,
      hasErrors: failed > 0,
      isComplete: completed + failed === uploadState.files.length && uploadState.files.length > 0,
    };
  }, [uploadState.files]);

  return {
    // State
    files: uploadState.files,
    isUploading: uploadState.isUploading,
    progress: uploadState.progress,
    error: uploadState.error,
    
    // Actions
    addFiles,
    removeFile,
    clearFiles,
    startUpload,
    cancelUpload,
    retryFailedUploads,
    
    // Utilities
    getUploadStats,
    canAddMore: uploadState.files.length < maxFiles,
    hasFiles: uploadState.files.length > 0,
    
    // Mutation state
    isUploading: uploadMutation.isLoading || uploadState.isUploading,
  };
};

// Hook for drag and drop functionality
export const useDragAndDrop = (onFilesAdded: (files: File[]) => void) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      onFilesAdded(droppedFiles);
    }
  }, [onFilesAdded]);

  return {
    isDragOver,
    dragHandlers: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
};

export default useUpload;