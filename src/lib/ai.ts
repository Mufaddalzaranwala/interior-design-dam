import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export interface AIAnalysisResult {
  description: string;
  tags: string[];
  roomType?: string;
  styleElements?: string[];
  colors?: string[];
  materials?: string[];
  objects?: string[];
  confidence?: number;
}

export interface ProcessingError {
  error: string;
  code: 'UNSUPPORTED_FORMAT' | 'API_ERROR' | 'INVALID_IMAGE' | 'QUOTA_EXCEEDED';
  retryable: boolean;
}

// Image analysis prompt for interior design context
const ANALYSIS_PROMPT = `
You are an expert interior design analyst. Analyze this image and provide detailed information for a digital asset management system used by interior designers.

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

Focus on:
1. Interior design elements and styles
2. Furniture and fixtures
3. Color schemes and materials
4. Room layout and functionality
5. Design trends and aesthetic qualities

Be specific and use terminology that interior designers would search for.
`;

// Convert file buffer to base64 for Gemini API
const bufferToBase64 = (buffer: Buffer, mimeType: string): string => {
  const base64Data = buffer.toString('base64');
  return `data:${mimeType};base64,${base64Data}`;
};

// Analyze image with Gemini AI
export const analyzeImage = async (
  imageBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<AIAnalysisResult | ProcessingError> => {
  try {
    // Validate image format
    if (!mimeType.startsWith('image/')) {
      return {
        error: 'File is not an image',
        code: 'UNSUPPORTED_FORMAT',
        retryable: false,
      };
    }

    // Convert to base64
    const base64Image = bufferToBase64(imageBuffer, mimeType);

    // Prepare the request
    const prompt = ANALYSIS_PROMPT;
    const imagePart = {
      inlineData: {
        data: base64Image.split(',')[1], // Remove data URL prefix
        mimeType: mimeType,
      },
    };

    // Generate content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const rawText = await response.text();
    const text = rawText.trim();
    // Strip markdown code fences for JSON parsing
    const jsonText = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

    // Parse JSON response
    try {
      const analysisResult = JSON.parse(jsonText);
      
      // Validate and clean the response
      const cleanedResult: AIAnalysisResult = {
        description: analysisResult.description || 'Interior design asset',
        tags: Array.isArray(analysisResult.tags) ? 
          analysisResult.tags.filter((tag: any) => typeof tag === 'string').slice(0, 20) : 
          [],
        roomType: analysisResult.roomType || undefined,
        styleElements: Array.isArray(analysisResult.styleElements) ? 
          analysisResult.styleElements.filter((el: any) => typeof el === 'string').slice(0, 10) : 
          [],
        colors: Array.isArray(analysisResult.colors) ? 
          analysisResult.colors.filter((color: any) => typeof color === 'string').slice(0, 10) : 
          [],
        materials: Array.isArray(analysisResult.materials) ? 
          analysisResult.materials.filter((mat: any) => typeof mat === 'string').slice(0, 10) : 
          [],
        objects: Array.isArray(analysisResult.objects) ? 
          analysisResult.objects.filter((obj: any) => typeof obj === 'string').slice(0, 15) : 
          [],
        confidence: typeof analysisResult.confidence === 'number' ? 
          Math.max(0, Math.min(1, analysisResult.confidence)) : 
          0.8,
      };

      // Add filename-based tags
      const filenameTags = extractFilenameKeywords(filename);
      cleanedResult.tags = [...new Set([...cleanedResult.tags, ...filenameTags])];

      return cleanedResult;
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Original AI Response:', text);
      console.error('Sanitized JSON:', jsonText);
      
      // Fallback to basic analysis
      return createFallbackAnalysis(filename, mimeType);
    }
  } catch (error: any) {
    console.error('AI analysis failed:', error);

    if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
      return {
        error: 'AI service quota exceeded',
        code: 'QUOTA_EXCEEDED',
        retryable: true,
      };
    }

    if (error.message?.includes('invalid image') || error.message?.includes('unsupported')) {
      return {
        error: 'Invalid or unsupported image format',
        code: 'INVALID_IMAGE',
        retryable: false,
      };
    }

    return {
      error: 'AI analysis service temporarily unavailable',
      code: 'API_ERROR',
      retryable: true,
    };
  }
};

// Extract keywords from filename
const extractFilenameKeywords = (filename: string): string[] => {
  const name = filename.toLowerCase()
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[_-]/g, ' ') // Replace underscores and hyphens with spaces
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .trim();

  const words = name.split(/\s+/).filter(word => word.length > 2);
  
  // Common interior design terms to preserve
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
};

// Create fallback analysis when AI fails
const createFallbackAnalysis = (filename: string, mimeType: string): AIAnalysisResult => {
  const filenameTags = extractFilenameKeywords(filename);
  
  return {
    description: `Interior design asset: ${filename}`,
    tags: filenameTags.length > 0 ? filenameTags : ['interior', 'design', 'asset'],
    confidence: 0.3,
  };
};

// Analyze PDF or CAD file (text extraction and basic analysis)
export const analyzeDocument = async (
  documentBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<AIAnalysisResult | ProcessingError> => {
  try {
    // For now, create basic analysis from filename and metadata
    // In a more advanced implementation, you could:
    // 1. Extract text from PDFs using pdf-parse
    // 2. Read CAD file metadata
    // 3. Generate thumbnails for documents

    const filenameTags = extractFilenameKeywords(filename);
    const extension = filename.split('.').pop()?.toLowerCase();

    let documentType = 'document';
    let additionalTags: string[] = [];

    switch (extension) {
      case 'pdf':
        documentType = 'PDF document';
        additionalTags = ['pdf', 'document', 'specification'];
        break;
      case 'dwg':
      case 'dxf':
        documentType = 'CAD drawing';
        additionalTags = ['cad', 'drawing', 'technical', 'blueprint'];
        break;
      default:
        additionalTags = ['document'];
    }

    return {
      description: `${documentType}: ${filename}`,
      tags: [...new Set([...filenameTags, ...additionalTags])],
      confidence: 0.7,
    };
  } catch (error) {
    console.error('Document analysis failed:', error);
    return {
      error: 'Document analysis failed',
      code: 'API_ERROR',
      retryable: true,
    };
  }
};

// Batch processing for multiple files
export const batchAnalyzeFiles = async (
  files: Array<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
    id: string;
  }>,
  batchSize: number = 5
): Promise<Array<{
  id: string;
  result: AIAnalysisResult | ProcessingError;
}>> => {
  const results: Array<{
    id: string;
    result: AIAnalysisResult | ProcessingError;
  }> = [];

  // Process in batches to avoid rate limiting
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (file) => {
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 200 * (i % batchSize)));
      
      const result = file.mimeType.startsWith('image/') 
        ? await analyzeImage(file.buffer, file.mimeType, file.filename)
        : await analyzeDocument(file.buffer, file.mimeType, file.filename);

      return {
        id: file.id,
        result,
      };
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Wait between batches to respect rate limits
    if (i + batchSize < files.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
};

// Semantic search using AI (fallback when full-text search returns few results)
export const semanticSearch = async (
  query: string,
  existingDescriptions: string[]
): Promise<Array<{ index: number; score: number }>> => {
  try {
    const prompt = `
Given the search query: "${query}"

Rate how relevant each of these descriptions is to the search query on a scale of 0.0 to 1.0.
Return a JSON array of objects with "index" (0-based) and "score" properties.
Only include items with a score of 0.3 or higher.

Descriptions:
${existingDescriptions.map((desc, index) => `${index}: ${desc}`).join('\n')}

Response format: [{"index": 0, "score": 0.85}, {"index": 2, "score": 0.67}]
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    try {
      const scores = JSON.parse(text);
      return Array.isArray(scores) ? scores.filter(s => s.score >= 0.3) : [];
    } catch (parseError) {
      console.error('Failed to parse semantic search results:', parseError);
      return [];
    }
  } catch (error) {
    console.error('Semantic search failed:', error);
    return [];
  }
};

// Check AI service health
export const checkAIService = async (): Promise<boolean> => {
  try {
    const testPrompt = 'Respond with just the word "OK" if you can read this.';
    const result = await model.generateContent(testPrompt);
    const response = await result.response;
    const text = response.text().trim();
    
    return text.toLowerCase().includes('ok');
  } catch (error) {
    console.error('AI service health check failed:', error);
    return false;
  }
};

export default {
  analyzeImage,
  analyzeDocument,
  batchAnalyzeFiles,
  semanticSearch,
  checkAIService,
};