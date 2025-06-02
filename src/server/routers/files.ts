import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '../trpc';
import { files, sharedLinks, FileCategory, ProcessingStatus } from '../../../database/schema';
import { canViewSite, canUploadToSite, getAccessibleSites } from '../../lib/permissions';
import { uploadFile, generateSignedUrl, deleteFile, validateFile } from '../../lib/storage';
import { analyzeImage, analyzeDocument } from '../../lib/ai';
import { nanoid } from 'nanoid';
import { db } from '../../lib/db';

export const filesRouter = createTRPCRouter({
  // Upload file procedure
  upload: protectedProcedure
    .input(
      z.object({
        siteId: z.string().min(1, 'Site ID is required'),
        category: z.nativeEnum(FileCategory),
        files: z.array(
          z.object({
            name: z.string(),
            size: z.number(),
            type: z.string(),
            data: z.string(), // Base64 encoded file data
          })
        ).min(1, 'At least one file is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check upload permissions
      const canUpload = await canUploadToSite(ctx.user.id, input.siteId);
      if (!canUpload && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have upload permissions for this site',
        });
      }

      const uploadResults = [];
      const errors = [];

      for (const fileData of input.files) {
        try {
          // Validate file
          const validation = validateFile({
            name: fileData.name,
            size: fileData.size,
            type: fileData.type,
          } as File);

          if (!validation.valid) {
            errors.push({
              filename: fileData.name,
              error: validation.error,
            });
            continue;
          }

          // Convert base64 to buffer
          const buffer = Buffer.from(fileData.data, 'base64');
          
          // Generate file path
          const fileId = nanoid();
          const timestamp = new Date().toISOString().slice(0, 10);
          const extension = fileData.name.split('.').pop();
          const filename = `${fileId}.${extension}`;
          const gcsPath = `sites/${input.siteId}/${input.category}/${timestamp}/${filename}`;

          // Upload to GCS
          const uploadResult = await uploadFile(buffer, gcsPath, {
            contentType: fileData.type,
            size: fileData.size,
            originalName: fileData.name,
            uploadedAt: new Date().toISOString(),
            uploadedBy: ctx.user.id,
            siteId: input.siteId,
            category: input.category,
          });

          // Save to database
          const now = new Date();
          const dbFile = {
            id: fileId,
            filename: uploadResult.filename,
            originalName: fileData.name,
            mimeType: fileData.type,
            size: fileData.size,
            category: input.category,
            siteId: input.siteId,
            uploadedBy: ctx.user.id,
            gcsPath: uploadResult.gcsPath,
            thumbnailPath: uploadResult.thumbnailPath,
            processingStatus: ProcessingStatus.PENDING,
            createdAt: now,
            updatedAt: now,
          };

          await ctx.db.insert(files).values(dbFile);

          // Queue for AI processing (async)
          processFileAsync(fileId, buffer, fileData.type, fileData.name);

          uploadResults.push({
            id: fileId,
            filename: uploadResult.filename,
            originalName: fileData.name,
            size: fileData.size,
            category: input.category,
            gcsPath: uploadResult.gcsPath,
            thumbnailPath: uploadResult.thumbnailPath,
          });

        } catch (error) {
          console.error(`Upload failed for ${fileData.name}:`, error);
          errors.push({
            filename: fileData.name,
            error: 'Upload failed',
          });
        }
      }

      return {
        uploaded: uploadResults,
        errors,
        message: `${uploadResults.length} file(s) uploaded successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
      };
    }),

  // Get files for a site
  getFiles: protectedProcedure
    .input(
      z.object({
        siteId: z.string().optional(),
        category: z.nativeEnum(FileCategory).optional(),
        page: z.number().min(1).default(1),
        // Increased max limit to allow larger fetches for 'All Files'
        limit: z.number().min(1).max(1000).default(20),
        sortBy: z.enum(['createdAt', 'name', 'size']).default('createdAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      })
    )
    .query(async ({ input, ctx }) => {
      // Get accessible sites
      const accessibleSites = await getAccessibleSites(ctx.user.id);
      
      if (accessibleSites.length === 0) {
        return {
          files: [],
          total: 0,
          page: input.page,
          limit: input.limit,
        };
      }

      // Build where conditions
      const conditions = [
        inArray(files.siteId, accessibleSites),
      ];

      if (input.siteId) {
        conditions.push(eq(files.siteId, input.siteId));
      }

      if (input.category) {
        conditions.push(eq(files.category, input.category));
      }

      // Get total count
      const [countResult] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(files)
        .where(and(...conditions));

      const total = countResult?.count || 0;

      // Get files
      const sortColumn = files[input.sortBy as keyof typeof files];
      const orderFn = input.sortOrder === 'desc' ? desc : undefined;

      const fileResults = await ctx.db
        .select({
          id: files.id,
          filename: files.filename,
          originalName: files.originalName,
          mimeType: files.mimeType,
          size: files.size,
          category: files.category,
          siteId: files.siteId,
          uploadedBy: files.uploadedBy,
          gcsPath: files.gcsPath,
          thumbnailPath: files.thumbnailPath,
          aiDescription: files.aiDescription,
          aiTags: files.aiTags,
          processingStatus: files.processingStatus,
          createdAt: files.createdAt,
          updatedAt: files.updatedAt,
        })
        .from(files)
        .where(and(...conditions))
        .orderBy(orderFn ? orderFn(sortColumn) : sortColumn)
        .limit(input.limit)
        .offset((input.page - 1) * input.limit);

      return {
        files: fileResults,
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  // Fetch all files without pagination, optional site filter
  allFiles: protectedProcedure
    .input(z.object({ siteId: z.string().optional() }).default({}))
    .query(async ({ input, ctx }) => {
      const accessibleSites = await getAccessibleSites(ctx.user.id);
      // Narrow sites if filter provided and accessible
      const siteFilter = input.siteId && accessibleSites.includes(input.siteId)
        ? [input.siteId]
        : accessibleSites;
      const fileResults = await ctx.db
        .select({ 
          id: files.id, 
          filename: files.filename, 
          originalName: files.originalName, 
          mimeType: files.mimeType, 
          size: files.size, 
          category: files.category, 
          siteId: files.siteId, 
          uploadedBy: files.uploadedBy, 
          gcsPath: files.gcsPath, 
          thumbnailPath: files.thumbnailPath, 
          aiDescription: files.aiDescription, 
          aiTags: files.aiTags, 
          processingStatus: files.processingStatus, 
          createdAt: files.createdAt, 
          updatedAt: files.updatedAt 
        })
        .from(files)
        .where(inArray(files.siteId, siteFilter))
        .orderBy(desc(files.createdAt));
      return { files: fileResults };
    }),

  // Get file by ID
  getFile: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const [file] = await ctx.db
        .select()
        .from(files)
        .where(eq(files.id, input.id))
        .limit(1);

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        });
      }

      // Check permissions
      const canView = await canViewSite(ctx.user.id, file.siteId);
      if (!canView && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this file',
        });
      }

      return file;
    }),

  // Generate download URL
  getDownloadUrl: protectedProcedure
    .input(z.object({
      id: z.string(),
      thumbnail: z.boolean().default(false),
      expiresInHours: z.number().min(1).max(168).default(24), // in hours
    }))
    .mutation(async ({ input, ctx }) => {
      const [file] = await ctx.db
        .select()
        .from(files)
        .where(eq(files.id, input.id))
        .limit(1);

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        });
      }

      // Check permissions
      const canView = await canViewSite(ctx.user.id, file.siteId);
      if (!canView && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to download this file',
        });
      }

      try {
        const path = input.thumbnail && file.thumbnailPath 
          ? file.thumbnailPath 
          : file.gcsPath;
          
        const signedUrl = await generateSignedUrl(path, 'read', input.expiresInHours * 60 * 60 * 1000);

        return {
          url: signedUrl,
          filename: file.originalName,
          size: file.size,
          mimeType: file.mimeType,
        };
      } catch (error) {
        console.error('Failed to generate download URL:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate download URL',
        });
      }
    }),

  // Generate a short-lived view URL valid for 5 minutes
  getViewUrl: protectedProcedure
    .input(z.object({
      id: z.string(),
      thumbnail: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const [file] = await ctx.db
        .select()
        .from(files)
        .where(eq(files.id, input.id))
        .limit(1);

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        });
      }

      const path = input.thumbnail && file.thumbnailPath ? file.thumbnailPath : file.gcsPath;
      const signedUrl = await generateSignedUrl(path, 'read', 5 * 60 * 1000); // 5 minutes

      return {
        url: signedUrl,
        filename: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
      };
    }),

  // Create shareable link
  createShareLink: protectedProcedure
    .input(z.object({ 
      fileId: z.string(),
      expiresInHours: z.number().min(1).max(168).default(24), // Max 7 days
    }))
    .mutation(async ({ input, ctx }) => {
      const [file] = await ctx.db
        .select()
        .from(files)
        .where(eq(files.id, input.fileId))
        .limit(1);

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        });
      }

      // Check permissions
      const canView = await canViewSite(ctx.user.id, file.siteId);
      if (!canView && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to share this file',
        });
      }

      try {
        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
        
        const shareLink = {
          id: nanoid(),
          fileId: input.fileId,
          createdBy: ctx.user.id,
          token,
          expiresAt,
          isActive: true,
          createdAt: new Date(),
        };

        await ctx.db.insert(sharedLinks).values(shareLink);

        const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/share/${token}`;

        return {
          url: shareUrl,
          token,
          expiresAt,
          expiresInHours: input.expiresInHours,
        };
      } catch (error) {
        console.error('Failed to create share link:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create share link',
        });
      }
    }),

  // Delete file
  deleteFile: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [file] = await ctx.db
        .select()
        .from(files)
        .where(eq(files.id, input.id))
        .limit(1);

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        });
      }

      // Check permissions (upload permission required to delete)
      const canUpload = await canUploadToSite(ctx.user.id, file.siteId);
      if (!canUpload && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this file',
        });
      }

      try {
        // Delete from GCS
        await deleteFile(file.gcsPath);

        // Delete from database
        await ctx.db.delete(files).where(eq(files.id, input.id));

        return {
          message: 'File deleted successfully',
        };
      } catch (error) {
        console.error('Failed to delete file:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete file',
        });
      }
    }),

  // Get upload statistics
  getUploadStats: protectedProcedure
    .query(async ({ ctx }) => {
      const accessibleSites = await getAccessibleSites(ctx.user.id);
      
      if (accessibleSites.length === 0) {
        return {
          totalFiles: 0,
          totalSize: 0,
          filesByCategory: {},
          recentUploads: [],
        };
      }

      // Get total files and size
      const [stats] = await ctx.db
        .select({
          count: sql<number>`count(*)`,
          totalSize: sql<number>`sum(${files.size})`,
        })
        .from(files)
        .where(inArray(files.siteId, accessibleSites));

      // Get files by category
      const categoryStats = await ctx.db
        .select({
          category: files.category,
          count: sql<number>`count(*)`,
          totalSize: sql<number>`sum(${files.size})`,
        })
        .from(files)
        .where(inArray(files.siteId, accessibleSites))
        .groupBy(files.category);

      // Get recent uploads
      const recentUploads = await ctx.db
        .select({
          id: files.id,
          filename: files.filename,
          originalName: files.originalName,
          size: files.size,
          category: files.category,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(inArray(files.siteId, accessibleSites))
        .orderBy(desc(files.createdAt))
        .limit(10);

      return {
        totalFiles: stats?.count || 0,
        totalSize: stats?.totalSize || 0,
        filesByCategory: categoryStats.reduce((acc, stat) => {
          acc[stat.category] = {
            count: stat.count,
            size: stat.totalSize,
          };
          return acc;
        }, {} as Record<string, { count: number; size: number }>),
        recentUploads,
      };
    }),

  // Update file metadata
  updateFile: protectedProcedure
    .input(z.object({
      id: z.string(),
      originalName: z.string().optional(),
      category: z.nativeEnum(FileCategory).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [file] = await ctx.db
        .select()
        .from(files)
        .where(eq(files.id, input.id))
        .limit(1);

      if (!file) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'File not found',
        });
      }

      // Check permissions
      const canUpload = await canUploadToSite(ctx.user.id, file.siteId);
      if (!canUpload && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to edit this file',
        });
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (input.originalName) {
        updateData.originalName = input.originalName;
      }

      if (input.category) {
        updateData.category = input.category;
      }

      await ctx.db
        .update(files)
        .set(updateData)
        .where(eq(files.id, input.id));

      return {
        message: 'File updated successfully',
      };
    }),
});

// Async function to process files with AI
async function processFileAsync(
  fileId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
) {
  try {
    // Update status to processing
    await db
      .update(files)
      .set({ 
        processingStatus: ProcessingStatus.PROCESSING,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));

    // Analyze file
    const result = mimeType.startsWith('image/')
      ? await analyzeImage(buffer, mimeType, filename)
      : await analyzeDocument(buffer, mimeType, filename);

    if ('error' in result) {
      // Processing failed
      await db
        .update(files)
        .set({ 
          processingStatus: ProcessingStatus.FAILED,
          updatedAt: new Date(),
        })
        .where(eq(files.id, fileId));
    } else {
      // Processing succeeded
      await db
        .update(files)
        .set({ 
          processingStatus: ProcessingStatus.COMPLETED,
          aiDescription: result.description,
          aiTags: JSON.stringify(result.tags),
          metadata: JSON.stringify(result),
          updatedAt: new Date(),
        })
        .where(eq(files.id, fileId));
    }
  } catch (error) {
    console.error(`AI processing failed for file ${fileId}:`, error);
    
    await db
      .update(files)
      .set({ 
        processingStatus: ProcessingStatus.FAILED,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));
  }
}