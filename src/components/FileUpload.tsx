import React, { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, File, Image, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { SimpleModal } from './ui/modal';
import { useUpload, useDragAndDrop } from '@/hooks/useUpload';
import { useSites } from '@/hooks/useSites';
import { formatFileSize, cn } from '@/lib/utils';
import type { FileCategory, DragDropFile } from '@/types';

interface FileUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete?: (uploadedCount: number) => void;
  defaultSiteId?: string;
  defaultCategory?: FileCategory;
}

const FILE_CATEGORIES: { value: FileCategory; label: string }[] = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'textiles', label: 'Textiles' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'finishes', label: 'Finishes' },
];

export const FileUpload: React.FC<FileUploadProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
  defaultSiteId,
  defaultCategory,
}) => {
  const [selectedSiteId, setSelectedSiteId] = useState(defaultSiteId || '');
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>(defaultCategory || 'furniture');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadableSites } = useSites();
  
  const {
    files,
    isUploading,
    progress,
    error,
    addFiles,
    removeFile,
    clearFiles,
    startUpload,
    cancelUpload,
    getUploadStats,
    hasFiles,
  } = useUpload({
    maxFiles: 20,
    onUploadComplete: (response) => {
      onUploadComplete?.(response.uploaded.length);
      if (response.uploaded.length > 0) {
        // Clear files and close modal after successful upload
        setTimeout(() => {
          clearFiles();
          onClose();
        }, 2000);
      }
    },
  });

  const { isDragOver, dragHandlers } = useDragAndDrop(handleFilesAdded);

  const stats = getUploadStats();

  async function handleFilesAdded(newFiles: File[]) {
    const result = await addFiles(newFiles);
    if (result.errors.length > 0) {
      console.warn('File validation errors:', result.errors);
    }
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      handleFilesAdded(files);
    }
    // Reset input value to allow selecting the same files again
    event.target.value = '';
  };

  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!selectedSiteId || !selectedCategory || !hasFiles) return;

    const result = await startUpload(selectedSiteId, selectedCategory);
    if (result.success) {
      console.log('Upload completed:', result);
    }
  };

  const handleCancel = () => {
    if (isUploading) {
      cancelUpload();
    } else {
      clearFiles();
      onClose();
    }
  };

  const getFileIcon = (file: DragDropFile) => {
    if (file.file.type.startsWith('image/')) {
      return <Image className="w-5 h-5 text-blue-500" />;
    } else if (file.file.type === 'application/pdf') {
      return <FileText className="w-5 h-5 text-red-500" />;
    } else {
      return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusIcon = (file: DragDropFile) => {
    switch (file.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'uploading':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  const canUpload = selectedSiteId && selectedCategory && hasFiles && !isUploading;

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={handleCancel}
      title="Upload Files"
      size="lg"
    >
      <div className="space-y-6">
        {/* Site and Category Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Site</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isUploading}
            >
              <option value="">Select a site</option>
              {uploadableSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name} - {site.clientName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as FileCategory)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isUploading}
            >
              {FILE_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Upload Area */}
        <Card>
          <CardContent className="p-6">
            <div
              {...dragHandlers}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                isDragOver
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400",
                isUploading && "opacity-50 pointer-events-none"
              )}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Drop files here or{' '}
                <button
                  type="button"
                  onClick={handleBrowseFiles}
                  className="text-blue-600 hover:text-blue-500 underline"
                  disabled={isUploading}
                >
                  browse
                </button>
              </p>
              <p className="text-sm text-gray-500">
                Supports images, PDFs, and CAD files (max 100MB each)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.dwg,.dxf"
                onChange={handleFileInputChange}
                className="hidden"
                disabled={isUploading}
              />
            </div>
          </CardContent>
        </Card>

        {/* File List */}
        {hasFiles && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Files ({stats.total})
                {stats.completed > 0 && (
                  <span className="text-green-600 ml-2">
                    {stats.completed} completed
                  </span>
                )}
                {stats.failed > 0 && (
                  <span className="text-red-600 ml-2">
                    {stats.failed} failed
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      {getFileIcon(file)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.file.size)}
                        </p>
                        {file.error && (
                          <p className="text-xs text-red-500 mt-1">{file.error}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {file.status === 'uploading' && (
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      )}
                      
                      {getStatusIcon(file)}
                      
                      {!isUploading && file.status !== 'completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Overall Progress */}
              {isUploading && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Upload Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3" />
              <div>
                <p className="text-sm font-medium text-red-800">Upload Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isUploading}
          >
            {isUploading ? 'Cancel Upload' : 'Cancel'}
          </Button>
          
          {hasFiles && !stats.isComplete && (
            <Button
              onClick={clearFiles}
              variant="outline"
              disabled={isUploading}
            >
              Clear All
            </Button>
          )}
          
          <Button
            onClick={handleUpload}
            disabled={!canUpload}
            loading={isUploading}
          >
            {isUploading ? 'Uploading...' : `Upload ${stats.total} File${stats.total !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </SimpleModal>
  );
};

export default FileUpload;