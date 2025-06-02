import { Storage, StorageOptions } from '@google-cloud/storage';
import { nanoid } from 'nanoid';
import path from 'path';
import sharp from 'sharp';

const storageConfig: StorageOptions = {
  projectId: process.env.GCS_PROJECT_ID,
};

// Use service account key locally or in development
if (process.env.NODE_ENV !== 'production' && process.env.GCS_KEY_FILE) {
  storageConfig.keyFilename = process.env.GCS_KEY_FILE;
}

const storage = new Storage(storageConfig);

const bucketName = process.env.GCS_BUCKET_NAME;
if (!bucketName) {
  throw new Error('GCS_BUCKET_NAME environment variable is required');
}

const bucket = storage.bucket(bucketName);

export interface UploadResult {
  filename: string;
  gcsPath: string;
  publicUrl: string;
  size: number;
  thumbnailPath?: string;
}

export interface FileMetadata {
  contentType: string;
  size: number;
  originalName: string;
  uploadedAt: string;
  uploadedBy: string;
  siteId: string;
  category: string;
}

// File type validation
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  // Documents
  'application/pdf',
  // CAD files
  'application/x-autocad',
  'application/dwg',
  'application/dxf',
  'image/vnd.dwg',
  'image/x-dwg',
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not supported`,
    };
  }

  return { valid: true };
};

// Generate organized file path
export const generateFilePath = (
  siteId: string,
  category: string,
  originalName: string,
  userId: string
): string => {
  const fileId = nanoid();
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  const safeName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  
  return `sites/${siteId}/${category}/${timestamp}/${fileId}_${safeName}${extension}`;
};

// Upload file to GCS
export const uploadFile = async (
  file: Buffer,
  filePath: string,
  metadata: FileMetadata
): Promise<UploadResult> => {
  try {
    const gcsFile = bucket.file(filePath);
    
    // Upload file
    await gcsFile.save(file, {
      metadata: {
        contentType: metadata.contentType,
        metadata: {
          originalName: metadata.originalName,
          uploadedAt: metadata.uploadedAt,
          uploadedBy: metadata.uploadedBy,
          siteId: metadata.siteId,
          category: metadata.category,
        },
      },
      resumable: false,
    });

    const publicUrl = `gs://${bucketName}/${filePath}`;

    const result: UploadResult = {
      filename: path.basename(filePath),
      gcsPath: filePath,
      publicUrl,
      size: file.length,
    };

    // Generate thumbnail for images
    if (metadata.contentType.startsWith('image/')) {
      try {
        const thumbnailPath = await generateThumbnail(file, filePath);
        if (thumbnailPath) {
          result.thumbnailPath = thumbnailPath;
        }
      } catch (error) {
        console.error('Thumbnail generation failed:', error);
        // Continue without thumbnail
      }
    }

    return result;
  } catch (error) {
    console.error('File upload failed:', error);
    throw new Error('Failed to upload file to storage');
  }
};

// Generate thumbnail for images
export const generateThumbnail = async (
  imageBuffer: Buffer,
  originalPath: string
): Promise<string | null> => {
  try {
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbnailPath = originalPath.replace(
      path.extname(originalPath),
      '_thumb.jpg'
    );

    const thumbnailFile = bucket.file(thumbnailPath);
    await thumbnailFile.save(thumbnailBuffer, {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          type: 'thumbnail',
          originalPath,
        },
      },
    });

    return thumbnailPath;
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return null;
  }
};

// Generate signed URL for file access
export const generateSignedUrl = async (
  filePath: string,
  action: 'read' | 'write' = 'read',
  expiresIn: number = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
): Promise<string> => {
  try {
    const file = bucket.file(filePath);
    const [url] = await file.getSignedUrl({
      action,
      expires: Date.now() + expiresIn,
      responseType: action === 'read' ? 'application/octet-stream' : undefined,
    });

    return url;
  } catch (error) {
    console.error('Signed URL generation failed:', error);
    throw new Error('Failed to generate file access URL');
  }
};

// Get file metadata
export const getFileMetadata = async (filePath: string) => {
  try {
    const file = bucket.file(filePath);
    const [metadata] = await file.getMetadata();
    return metadata;
  } catch (error) {
    console.error('Get file metadata failed:', error);
    throw new Error('Failed to get file metadata');
  }
};

// Delete file from GCS
export const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    const file = bucket.file(filePath);
    await file.delete();
    
    // Also delete thumbnail if it exists
    const thumbnailPath = filePath.replace(
      path.extname(filePath),
      '_thumb.jpg'
    );
    
    try {
      const thumbnailFile = bucket.file(thumbnailPath);
      await thumbnailFile.delete();
    } catch (error) {
      // Thumbnail might not exist, ignore error
    }

    return true;
  } catch (error) {
    console.error('File deletion failed:', error);
    return false;
  }
};

// Copy file to new location
export const copyFile = async (
  sourcePath: string,
  destinationPath: string
): Promise<boolean> => {
  try {
    const sourceFile = bucket.file(sourcePath);
    const destinationFile = bucket.file(destinationPath);
    
    await sourceFile.copy(destinationFile);
    return true;
  } catch (error) {
    console.error('File copy failed:', error);
    return false;
  }
};

// List files in a directory
export const listFiles = async (
  prefix: string,
  maxResults: number = 1000
): Promise<any[]> => {
  try {
    const [files] = await bucket.getFiles({
      prefix,
      maxResults,
    });

    return files.map(file => ({
      name: file.name,
      size: file.metadata.size,
      contentType: file.metadata.contentType,
      timeCreated: file.metadata.timeCreated,
      updated: file.metadata.updated,
    }));
  } catch (error) {
    console.error('List files failed:', error);
    return [];
  }
};

// Check if bucket exists and is accessible
export const checkBucketAccess = async (): Promise<boolean> => {
  try {
    const [exists] = await bucket.exists();
    if (!exists) {
      console.error(`Bucket ${bucketName} does not exist`);
      return false;
    }

    // Test write access
    const testFile = bucket.file(`test/${nanoid()}.txt`);
    await testFile.save('test', { resumable: false });
    await testFile.delete();

    return true;
  } catch (error) {
    console.error('Bucket access check failed:', error);
    return false;
  }
};

// Cleanup old files (for scheduled cleanup)
export const cleanupOldFiles = async (
  daysOld: number = 30,
  dryRun: boolean = true
): Promise<{ deleted: number; errors: number }> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  let deleted = 0;
  let errors = 0;

  try {
    const [files] = await bucket.getFiles();

    for (const file of files) {
      const metadata = file.metadata;
      const createdDate = new Date(metadata.timeCreated);

      if (createdDate < cutoffDate) {
        try {
          if (!dryRun) {
            await file.delete();
          }
          deleted++;
          console.log(`${dryRun ? '[DRY RUN] ' : ''}Deleted: ${file.name}`);
        } catch (error) {
          errors++;
          console.error(`Failed to delete ${file.name}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Cleanup operation failed:', error);
    errors++;
  }

  return { deleted, errors };
};

// Get storage usage statistics
export const getStorageStats = async (): Promise<{
  totalFiles: number;
  totalSize: number;
  sizeByCategory: Record<string, number>;
}> => {
  try {
    const [files] = await bucket.getFiles();
    
    let totalSize = 0;
    const sizeByCategory: Record<string, number> = {};

    for (const file of files) {
      const size = parseInt(file.metadata.size || '0');
      totalSize += size;

      // Extract category from file path
      const pathParts = file.name.split('/');
      if (pathParts.length >= 3 && pathParts[0] === 'sites') {
        const category = pathParts[2];
        sizeByCategory[category] = (sizeByCategory[category] || 0) + size;
      }
    }

    return {
      totalFiles: files.length,
      totalSize,
      sizeByCategory,
    };
  } catch (error) {
    console.error('Storage stats failed:', error);
    return {
      totalFiles: 0,
      totalSize: 0,
      sizeByCategory: {},
    };
  }
};

export default {
  validateFile,
  generateFilePath,
  uploadFile,
  generateThumbnail,
  generateSignedUrl,
  getFileMetadata,
  deleteFile,
  copyFile,
  listFiles,
  checkBucketAccess,
  cleanupOldFiles,
  getStorageStats,
};