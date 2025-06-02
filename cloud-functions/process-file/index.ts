/**
 * Google Cloud Function for processing uploaded files
 * Triggered by Google Cloud Storage events
 */

import { CloudFunction } from '@google-cloud/functions-framework';
import { Storage } from '@google-cloud/storage';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from 'pg';
import sharp from 'sharp';

// Environment variables
const DATABASE_URL = process.env.DATABASE_URL!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME!;

// Initialize services
const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET_NAME);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

interface GCSEvent {
  bucket: string;
  name: string;
  metageneration: string;
  timeCreated: string;
  updated: string;
  contentType: string;
  size: string;
}

interface FileRecord {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  gcs_path: string;
  processing_status: string;
}

/**
 * Cloud Function entry point
 * Processes files when they are uploaded to Google Cloud Storage
 */
export const processFile: CloudFunction = async (data: GCSEvent, context: any) => {
  const filePath = data.name;
  const mimeType = data.contentType;
  
  console.log(`Processing file: ${filePath} (${mimeType})`);

  try {
    // Extract file ID from the path (assuming format: sites/{siteId}/{category}/{date}/{fileId}_{name}.ext)
    const pathParts = filePath.split('/');
    if (pathParts.length < 4 || pathParts[0] !== 'sites') {
      console.log('Ignoring non-file upload:', filePath);
      return;
    }

    const filename = pathParts[pathParts.length - 1];
    const fileId = filename.split('_')[0];

    if (!fileId) {
      console.error('Could not extract file ID from path:', filePath);
      return;
    }

    // Get database connection
    const db = new Client({ connectionString: DATABASE_URL });
    await db.connect();

    try {
      // Get file record from database
      const fileQuery = 'SELECT * FROM files WHERE id = $1';
      const fileResult = await db.query(fileQuery, [fileId]);
      
      if (fileResult.rows.length === 0) {
        console.error('File record not found in database:', fileId);
        return;
      }

      const fileRecord: FileRecord = fileResult.rows[0];

      // Update status to processing
      await updateFileStatus(db, fileId, 'processing');

      // Download file from GCS
      const file = bucket.file(filePath);
      const [fileBuffer] = await file.download();

      let processingResult: any = {};

      // Process based on file type
      if (mimeType.startsWith('image/')) {
        processingResult = await processImage(fileBuffer, mimeType, fileRecord.original_name);
        
        // Generate thumbnail
        const thumbnailPath = await generateThumbnail(fileBuffer, filePath);
        if (thumbnailPath) {
          processingResult.thumbnailPath = thumbnailPath;
        }
      } else if (mimeType === 'application/pdf' || mimeType.includes('dwg') || mimeType.includes('dxf')) {
        processingResult = await processDocument(fileRecord.original_name, mimeType);
      }

      // Update database with results
      if (processingResult.error) {
        await updateFileStatus(db, fileId, 'failed', processingResult.error);
      } else {
        await updateFileWithResults(db, fileId, processingResult);
      }

      console.log(`Successfully processed file: ${fileId}`);

    } finally {
      await db.end();
    }

  } catch (error) {
    console.error('Error processing file:', error);
    
    // Try to update status to failed if we can
    try {
      const db = new Client({ connectionString: DATABASE_URL });
      await db.connect();
      
      const pathParts = filePath.split('/');
      const filename = pathParts[pathParts.length - 1];
      const fileId = filename.split('_')[0];
      
      if (fileId) {
        await updateFileStatus(db, fileId, 'failed', error.message);
      }
      
      await db.end();
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }
  }
};

/**
 * Process image files with AI analysis
 */
async function processImage(buffer: Buffer, mimeType: string, filename: string) {
  try {
    console.log(`Analyzing image: ${filename}`);

    const base64Data = buffer.toString('base64');
    
    const prompt = `
You are an expert interior design analyst. Analyze this image and provide detailed information for a digital asset management system.

Please provide a JSON response with the following structure:
{
  "description": "A detailed description of what's shown in the image (2-3 sentences)",
  "tags": ["relevant", "searchable", "keywords"],
  "roomType": "living room|bedroom|kitchen|bathroom|dining room|office|hallway|outdoor|other",
  "styleElements": ["modern", "traditional", "minimalist", "industrial", etc.],
  "colors": ["primary", "color", "palette"],
  "materials": ["wood", "metal", "fabric", "stone", etc.],
  "objects": ["furniture", "lighting", "accessories", "etc."],
  "confidence": 0.95
}

Focus on interior design elements, furniture, lighting, materials, and style characteristics.
`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    try {
      const analysisResult = JSON.parse(text);
      
      // Clean and validate the response
      const cleanedResult = {
        description: analysisResult.description || `Interior design image: ${filename}`,
        tags: Array.isArray(analysisResult.tags) ? analysisResult.tags.slice(0, 20) : [],
        roomType: analysisResult.roomType || null,
        styleElements: Array.isArray(analysisResult.styleElements) ? analysisResult.styleElements.slice(0, 10) : [],
        colors: Array.isArray(analysisResult.colors) ? analysisResult.colors.slice(0, 10) : [],
        materials: Array.isArray(analysisResult.materials) ? analysisResult.materials.slice(0, 10) : [],
        objects: Array.isArray(analysisResult.objects) ? analysisResult.objects.slice(0, 15) : [],
        confidence: typeof analysisResult.confidence === 'number' ? analysisResult.confidence : 0.8,
      };

      return {
        aiDescription: cleanedResult.description,
        aiTags: JSON.stringify(cleanedResult.tags),
        metadata: JSON.stringify(cleanedResult),
      };

    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      
      // Return fallback analysis
      return {
        aiDescription: `Interior design image: ${filename}`,
        aiTags: JSON.stringify(['interior', 'design']),
        metadata: JSON.stringify({ confidence: 0.3 }),
      };
    }

  } catch (error) {
    console.error('AI image analysis failed:', error);
    return {
      error: `AI analysis failed: ${error.message}`,
    };
  }
}

/**
 * Process document files (PDFs, CAD files)
 */
async function processDocument(filename: string, mimeType: string) {
  try {
    console.log(`Processing document: ${filename} (${mimeType})`);

    const extension = filename.split('.').pop()?.toLowerCase();
    let documentType = 'document';
    let tags = ['document'];

    switch (extension) {
      case 'pdf':
        documentType = 'PDF document';
        tags = ['pdf', 'document', 'specification'];
        break;
      case 'dwg':
      case 'dxf':
        documentType = 'CAD drawing';
        tags = ['cad', 'drawing', 'technical', 'blueprint'];
        break;
    }

    // Extract keywords from filename
    const nameKeywords = extractFilenameKeywords(filename);
    tags = [...new Set([...tags, ...nameKeywords])];

    return {
      aiDescription: `${documentType}: ${filename}`,
      aiTags: JSON.stringify(tags),
      metadata: JSON.stringify({
        documentType,
        confidence: 0.7,
      }),
    };

  } catch (error) {
    console.error('Document processing failed:', error);
    return {
      error: `Document processing failed: ${error.message}`,
    };
  }
}

/**
 * Generate thumbnail for images
 */
async function generateThumbnail(imageBuffer: Buffer, originalPath: string): Promise<string | null> {
  try {
    console.log(`Generating thumbnail for: ${originalPath}`);

    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbnailPath = originalPath.replace(
      /\.[^/.]+$/,
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
      resumable: false,
    });

    console.log(`Thumbnail generated: ${thumbnailPath}`);
    return thumbnailPath;

  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    return null;
  }
}

/**
 * Extract keywords from filename
 */
function extractFilenameKeywords(filename: string): string[] {
  const name = filename.toLowerCase()
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[_-]/g, ' ') // Replace underscores and hyphens with spaces
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .trim();

  const words = name.split(/\s+/).filter(word => word.length > 2);
  
  // Common interior design terms
  const designTerms = [
    'modern', 'contemporary', 'traditional', 'rustic', 'industrial',
    'minimalist', 'vintage', 'classic', 'luxury', 'bohemian',
    'living', 'bedroom', 'kitchen', 'bathroom', 'dining',
    'furniture', 'lighting', 'decor', 'textile', 'accessory',
    'chair', 'table', 'sofa', 'lamp', 'cabinet', 'shelf',
  ];

  return words.filter(word => 
    designTerms.includes(word) || word.length >= 4
  ).slice(0, 5);
}

/**
 * Update file processing status
 */
async function updateFileStatus(db: Client, fileId: string, status: string, error?: string) {
  const updateQuery = `
    UPDATE files 
    SET processing_status = $1, updated_at = NOW()
    WHERE id = $2
  `;
  
  await db.query(updateQuery, [status, fileId]);
  
  if (error) {
    console.error(`File ${fileId} processing failed:`, error);
  } else {
    console.log(`File ${fileId} status updated to: ${status}`);
  }
}

/**
 * Update file with AI processing results
 */
async function updateFileWithResults(db: Client, fileId: string, results: any) {
  const updateQuery = `
    UPDATE files 
    SET 
      ai_description = $1,
      ai_tags = $2,
      metadata = $3,
      thumbnail_path = $4,
      processing_status = 'completed',
      updated_at = NOW()
    WHERE id = $5
  `;
  
  await db.query(updateQuery, [
    results.aiDescription,
    results.aiTags,
    results.metadata,
    results.thumbnailPath || null,
    fileId,
  ]);
  
  console.log(`File ${fileId} processing completed successfully`);
}