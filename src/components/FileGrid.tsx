import React, { useState, useMemo, useEffect } from 'react';
import { 
  Grid, 
  List, 
  Download, 
  Share2, 
  Eye, 
  MoreVertical, 
  Edit, 
  Trash2,
  Calendar,
  User,
  Folder,
  Filter,
  SortAsc,
  SortDesc,
  Image,
  File,
  FileText
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { SimpleModal } from './ui/modal';
import { trpc } from '@/lib/trpc';
import { formatFileSize, formatDate, formatDateTime, cn, formatCategoryLabel } from '@/lib/utils';
import type { FileWithDetails, FileCategory } from '@/types';

interface FileGridProps {
  files: FileWithDetails[];
  isLoading?: boolean;
  onFileSelect?: (file: FileWithDetails) => void;
  onDownload?: (file: FileWithDetails) => void;
  onShare?: (file: FileWithDetails) => void;
  onEdit?: (file: FileWithDetails) => void;
  onDelete?: (file: FileWithDetails) => void;
  selectable?: boolean;
  selectedFiles?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  sortBy?: 'name' | 'date' | 'size' | 'category';
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  showActions?: boolean;
  compact?: boolean;
}

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'date', label: 'Date' },
  { value: 'size', label: 'Size' },
  { value: 'category', label: 'Category' },
];

export const FileGrid: React.FC<FileGridProps> = ({
  files,
  isLoading = false,
  onFileSelect,
  onDownload,
  onShare,
  onEdit,
  onDelete,
  selectable = false,
  selectedFiles = [],
  onSelectionChange,
  viewMode = 'grid',
  onViewModeChange,
  sortBy = 'date',
  sortOrder = 'desc',
  onSortChange,
  showActions = true,
  compact = false,
}) => {
  const [selectedFile, setSelectedFile] = useState<FileWithDetails | null>(null);
  const [showFileModal, setShowFileModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<FileWithDetails | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  // Generate download URL mutation
  const downloadUrlMutation = trpc.files.getDownloadUrl.useMutation();

  // Create share link mutation
  const shareLinkMutation = trpc.files.createShareLink.useMutation();

  // Create view URL mutation
  const viewUrlMutation = trpc.files.getViewUrl.useMutation();

  useEffect(() => {
    files.forEach(async file => {
      if (file.thumbnailPath && !thumbUrls[file.id]) {
        try {
          const res = await viewUrlMutation.mutateAsync({ id: file.id, thumbnail: true });
          setThumbUrls(prev => ({ ...prev, [file.id]: res.url }));
        } catch {
          // ignore errors
        }
      }
    });
  }, [files]);

  // Sort files based on current sort settings
  const sortedFiles = useMemo(() => {
    const sorted = [...files].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'name':
          aValue = a.originalName.toLowerCase();
          bValue = b.originalName.toLowerCase();
          break;
        case 'date':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'size':
          aValue = a.size;
          bValue = b.size;
          break;
        case 'category':
          aValue = a.category;
          bValue = b.category;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [files, sortBy, sortOrder]);

  const handleFileClick = (file: FileWithDetails) => {
    if (selectable && onSelectionChange) {
      const isSelected = selectedFiles.includes(file.id);
      const newSelection = isSelected
        ? selectedFiles.filter(id => id !== file.id)
        : [...selectedFiles, file.id];
      onSelectionChange(newSelection);
    } else if (onFileSelect) {
      onFileSelect(file);
    } else {
      setSelectedFile(file);
      setShowFileModal(true);
    }
  };

  const handleDownload = async (file: FileWithDetails, thumbnail = false) => {
    if (onDownload) {
      onDownload(file);
      return;
    }

    try {
      const result = await downloadUrlMutation.mutateAsync({
        id: file.id,
        thumbnail,
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
    if (onShare) {
      onShare(file);
      return;
    }

    try {
      const result = await downloadUrlMutation.mutateAsync({
        id: file.id,
        thumbnail: false,
      });
      const url = result.url;
      // Try Clipboard API, with fallback on error or absence
      const writeTextFn = navigator.clipboard?.writeText;
      if (typeof writeTextFn === 'function') {
        try {
          await writeTextFn.call(navigator.clipboard, url);
        } catch {
          // Fallback to textarea copy
          const textarea = document.createElement('textarea');
          textarea.value = url;
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
      } else {
        // Clipboard API unavailable, use textarea fallback
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      alert('Share link copied to clipboard!');
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const handleView = async (file: FileWithDetails, thumbnail = false) => {
    try {
      const result = await viewUrlMutation.mutateAsync({ id: file.id, thumbnail });
      window.open(result.url, '_blank');
    } catch (error) {
      console.error('View failed:', error);
    }
  };

  const handleEdit = (file: FileWithDetails) => {
    if (onEdit) {
      onEdit(file);
    }
  };

  const handleDeleteClick = (file: FileWithDetails) => {
    setFileToDelete(file);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (fileToDelete && onDelete) {
      onDelete(fileToDelete);
    }
    setShowDeleteConfirm(false);
    setFileToDelete(null);
  };

  const toggleSort = (newSortBy: string) => {
    if (onSortChange) {
      const newSortOrder = sortBy === newSortBy && sortOrder === 'asc' ? 'desc' : 'asc';
      onSortChange(newSortBy, newSortOrder);
    }
  };

  const selectAll = () => {
    if (onSelectionChange) {
      const allSelected = selectedFiles.length === files.length;
      onSelectionChange(allSelected ? [] : files.map(f => f.id));
    }
  };

  const getFileIcon = (file: FileWithDetails) => {
    if (file.mimeType.startsWith('image/')) {
      return <Image className="w-5 h-5 text-blue-500" />;
    } else if (file.mimeType === 'application/pdf') {
      return <FileText className="w-5 h-5 text-red-500" />;
    } else {
      return <File className="w-5 h-5 text-gray-500" />;
    }
  };

  const getProcessingStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-32 bg-gray-200 rounded mb-4"></div>
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-12">
        <Folder className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-600 mb-2">No files found</p>
        <p className="text-sm text-gray-500">Upload some files to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Selection */}
          {selectable && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedFiles.length === files.length && files.length > 0}
                onChange={selectAll}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">
                {selectedFiles.length > 0 ? `${selectedFiles.length} selected` : 'Select all'}
              </span>
            </div>
          )}

          {/* Sort */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Sort by:</span>
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => toggleSort(option.value)}
                className={cn(
                  'text-sm px-2 py-1 rounded hover:bg-gray-100',
                  sortBy === option.value ? 'bg-blue-100 text-blue-700' : 'text-gray-600'
                )}
              >
                {option.label}
                {sortBy === option.value && (
                  sortOrder === 'asc' ? <SortAsc className="w-3 h-3 inline ml-1" /> : <SortDesc className="w-3 h-3 inline ml-1" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode */}
        {onViewModeChange && (
          <div className="flex items-center space-x-1 border rounded-md">
            <button
              onClick={() => onViewModeChange('grid')}
              className={cn(
                'p-2 rounded-l',
                viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={cn(
                'p-2 rounded-r',
                viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className={cn(
          'grid gap-4',
          compact 
            ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
            : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
        )}>
          {sortedFiles.map((file) => (
            <Card
              key={file.id}
              className={cn(
                'cursor-pointer hover:shadow-md transition-all',
                selectable && selectedFiles.includes(file.id) && 'ring-2 ring-blue-500',
                'group'
              )}
              onClick={() => handleFileClick(file)}
            >
              <CardContent className={cn('p-4', compact && 'p-3')}>
                {/* File Icon/Thumbnail */}
                <div className={cn(
                  'flex items-center justify-center bg-gray-50 rounded-lg mb-3',
                  compact ? 'h-24' : 'h-32'
                )}>
                  {thumbUrls[file.id] ? (
                    <img
                      src={thumbUrls[file.id]}
                      alt={file.originalName}
                      className="max-h-full max-w-full object-contain rounded"
                      loading="lazy"
                    />
                  ) : file.thumbnailPath ? (
                    <div className="text-sm text-gray-500">Loading...</div>
                  ) : (
                    <div className="text-4xl">{getFileIcon(file)}</div>
                  )}
                </div>

                {/* File Info */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-medium text-sm truncate flex-1 pr-2">
                      {file.originalName}
                    </h3>
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.id)}
                        onChange={() => {}}
                        className="rounded border-gray-300"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{formatFileSize(file.size)}</span>
                    <span className={cn(
                      'px-2 py-1 rounded-full',
                      getProcessingStatusColor(file.processingStatus)
                    )}>
                      {file.processingStatus}
                    </span>
                  </div>

                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {formatDate(file.createdAt)}
                    </div>
                    <div className="flex items-center">
                      <Folder className="w-3 h-3 mr-1" />
                      {formatCategoryLabel(file.category)}
                    </div>
                  </div>

                  {/* Actions */}
                  {showActions && (
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file);
                        }}
                        disabled={downloadUrlMutation.isLoading}
                        className="h-7 w-7 p-0"
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(file);
                        }}
                        disabled={shareLinkMutation.isLoading}
                        className="h-7 w-7 p-0"
                      >
                        <Share2 className="w-3 h-3" />
                      </Button>
                      {onEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(file);
                          }}
                          className="h-7 w-7 p-0"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(file);
                          }}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {sortedFiles.map((file) => (
            <Card
              key={file.id}
              className={cn(
                'cursor-pointer hover:shadow-sm transition-all',
                selectable && selectedFiles.includes(file.id) && 'ring-2 ring-blue-500'
              )}
              onClick={() => handleFileClick(file)}
            >
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={selectedFiles.includes(file.id)}
                      onChange={() => {}}
                      className="rounded border-gray-300"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {getFileIcon(file)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{file.originalName}</p>
                      <p className="text-xs text-gray-500">{formatCategoryLabel(file.category)}</p>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 hidden md:block">
                    {formatFileSize(file.size)}
                  </div>

                  <div className="text-sm text-gray-600 hidden lg:block">
                    {formatDateTime(file.createdAt)}
                  </div>

                  <div className="hidden sm:block">
                    <span className={cn(
                      'px-2 py-1 text-xs rounded-full',
                      getProcessingStatusColor(file.processingStatus)
                    )}>
                      {file.processingStatus}
                    </span>
                  </div>

                  {showActions && (
                    <div className="flex items-center space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(file);
                        }}
                        disabled={downloadUrlMutation.isLoading}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(file);
                        }}
                        disabled={shareLinkMutation.isLoading}
                        className="h-8 w-8 p-0"
                      >
                        <Share2 className="w-4 h-4" />
                      </Button>
                      {onEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(file);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(file);
                          }}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* File Detail Modal */}
      {selectedFile && (
        <SimpleModal
          isOpen={showFileModal}
          onClose={() => setShowFileModal(false)}
          title="File Details"
          size="lg"
        >
          {thumbUrls[selectedFile.id] && (
            <div className="mb-4 text-center">
              <img src={thumbUrls[selectedFile.id]} alt="Thumbnail" className="mx-auto max-h-40 object-contain" />
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-medium">Name:</span> {selectedFile.originalName}</div>
              <div><span className="font-medium">Size:</span> {formatFileSize(selectedFile.size)}</div>
              <div><span className="font-medium">Category:</span> {formatCategoryLabel(selectedFile.category)}</div>
              <div><span className="font-medium">Type:</span> {selectedFile.mimeType}</div>
              <div><span className="font-medium">Uploaded:</span> {formatDateTime(selectedFile.createdAt)}</div>
              <div><span className="font-medium">Status:</span> 
                <span className={cn(
                  'ml-2 px-2 py-1 text-xs rounded-full',
                  getProcessingStatusColor(selectedFile.processingStatus)
                )}>
                  {selectedFile.processingStatus}
                </span>
              </div>
            </div>

            {selectedFile.aiDescription && (
              <div>
                <h4 className="font-medium mb-2">AI Description</h4>
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
              <Button onClick={() => handleDownload(selectedFile)}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button variant="outline" onClick={() => handleShare(selectedFile)} disabled={shareLinkMutation.isLoading}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" onClick={() => handleView(selectedFile)} disabled={viewUrlMutation.isLoading}>
                <Eye className="w-4 h-4 mr-2" />
                View
              </Button>
            </div>
          </div>
        </SimpleModal>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && fileToDelete && (
        <SimpleModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Confirm Delete"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete "{fileToDelete.originalName}"? This action cannot be undone.
            </p>
            <div className="flex space-x-2 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </SimpleModal>
      )}
    </div>
  );
};

export default FileGrid;