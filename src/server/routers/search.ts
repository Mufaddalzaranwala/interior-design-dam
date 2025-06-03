import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, inArray, sql, like, or } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { files, searchQueries, sites, FileCategory } from '../../../database/schema';
import { getAccessibleSites } from '../../lib/permissions';
import { searchFiles } from '../../lib/db';
import { semanticSearch } from '../../lib/ai';
import { parseSearchQuery } from '../../lib/utils';
import { nanoid } from 'nanoid';

export const searchRouter = createTRPCRouter({
  // Main search procedure - implements multi-tier search
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1, 'Search query is required'),
        siteIds: z.array(z.string()).optional(),
        categories: z.array(z.nativeEnum(FileCategory)).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        mimeTypes: z.array(z.string()).optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        sortBy: z.enum(['relevance', 'createdAt', 'name', 'size']).default('relevance'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const startTime = Date.now();
      
      try {
        // Get accessible sites
        const accessibleSites = await getAccessibleSites(ctx.user.id);
        
        if (accessibleSites.length === 0) {
          return {
            files: [],
            total: 0,
            page: input.page,
            limit: input.limit,
            searchTime: Date.now() - startTime,
            tier: 'none',
          };
        }

        // Filter by accessible sites
        const filteredSiteIds = input.siteIds 
          ? input.siteIds.filter(id => accessibleSites.includes(id))
          : accessibleSites;

        if (filteredSiteIds.length === 0) {
          return {
            files: [],
            total: 0,
            page: input.page,
            limit: input.limit,
            searchTime: Date.now() - startTime,
            tier: 'none',
          };
        }

        // Parse search query
        const { terms, filters } = parseSearchQuery(input.query);
        
        // TIER 1: Structured filters + basic text matching
        let results = await performTier1Search({
          terms,
          filters,
          siteIds: filteredSiteIds,
          categories: input.categories,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          mimeTypes: input.mimeTypes,
          page: input.page,
          limit: input.limit,
          sortBy: input.sortBy,
          sortOrder: input.sortOrder,
          db: ctx.db,
        });

        let tier = 'structured';

        // TIER 2: Full-text search if not enough results
        if (results.files.length < 10 && terms.length > 0) {
          const ftsResults = await performTier2Search({
            query: terms.join(' '),
            siteIds: filteredSiteIds,
            categories: input.categories,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            mimeTypes: input.mimeTypes,
            limit: input.limit,
          });

          if (ftsResults.length > results.files.length) {
            results = {
              files: ftsResults,
              total: ftsResults.length,
              page: 1,
              limit: input.limit,
            };
            tier = 'fulltext';
          }
        }

        // TIER 3: AI semantic search if still not enough results
        if (results.files.length < 5 && terms.length > 0) {
          const semanticResults = await performTier3Search({
            query: input.query,
            siteIds: filteredSiteIds,
            categories: input.categories,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            mimeTypes: input.mimeTypes,
            limit: input.limit,
            db: ctx.db,
          });

          if (semanticResults.length > results.files.length) {
            results = {
              files: semanticResults,
              total: semanticResults.length,
              page: 1,
              limit: input.limit,
            };
            tier = 'semantic';
          }
        }

        const searchTime = Date.now() - startTime;

        // Normalize legacy categories
        const validCategories = Object.values(FileCategory) as string[];
        results.files = results.files.map(file =>
          validCategories.includes(file.category)
            ? file
            : { ...file, category: validCategories[Math.floor(Math.random() * validCategories.length)] }
        );

        // Log search query for analytics
        await logSearchQuery({
          userId: ctx.user.id,
          query: input.query,
          filters: {
            siteIds: input.siteIds,
            categories: input.categories,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            mimeTypes: input.mimeTypes,
          },
          resultsCount: results.total,
          responseTime: searchTime,
          db: ctx.db,
        });

        return {
          ...results,
          searchTime,
          tier,
        };

      } catch (error) {
        console.error('Search error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Search failed',
        });
      }
    }),

  // Get search suggestions
  getSuggestions: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const accessibleSites = await getAccessibleSites(ctx.user.id);
        
        if (accessibleSites.length === 0) {
          return [];
        }

        // Get suggestions from filenames and AI descriptions
        const suggestions = await ctx.db
          .select({
            filename: files.filename,
            originalName: files.originalName,
            aiDescription: files.aiDescription,
            aiTags: files.aiTags,
            siteName: sites.name,
            clientName: sites.clientName,
          })
          .from(files)
          .innerJoin(sites, eq(files.siteId, sites.id))
          .where(
            and(
              inArray(files.siteId, accessibleSites),
              or(
                like(files.filename, `%${input.query}%`),
                like(files.originalName, `%${input.query}%`),
                like(files.aiDescription, `%${input.query}%`),
                like(files.aiTags, `%${input.query}%`)
              )
            )
          )
          .limit(input.limit);

        // Extract unique suggestions
        const suggestionSet = new Set<string>();
        
        suggestions.forEach(file => {
          // Add filename words
          file.filename.toLowerCase().split(/[_\-\s]+/).forEach(word => {
            if (word.length > 2 && word.includes(input.query.toLowerCase())) {
              suggestionSet.add(word);
            }
          });

          // Add original name words
          file.originalName.toLowerCase().split(/[_\-\s]+/).forEach(word => {
            if (word.length > 2 && word.includes(input.query.toLowerCase())) {
              suggestionSet.add(word);
            }
          });

          // Add AI tags
          if (file.aiTags) {
            try {
              const tags = JSON.parse(file.aiTags);
              tags.forEach((tag: string) => {
                if (tag.toLowerCase().includes(input.query.toLowerCase())) {
                  suggestionSet.add(tag);
                }
              });
            } catch (e) {
              // Ignore JSON parse errors
            }
          }

          // Add site name as suggestion
          if (file.siteName && file.siteName.toLowerCase().includes(input.query.toLowerCase())) {
            suggestionSet.add(file.siteName);
          }
          // Add client name as suggestion
          if (file.clientName && file.clientName.toLowerCase().includes(input.query.toLowerCase())) {
            suggestionSet.add(file.clientName);
          }
        });

        return Array.from(suggestionSet)
          .slice(0, input.limit)
          .sort((a, b) => a.localeCompare(b));

      } catch (error) {
        console.error('Suggestions error:', error);
        return [];
      }
    }),

  // Get search analytics
  getSearchAnalytics: protectedProcedure
    .input(
      z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const conditions = [eq(searchQueries.userId, ctx.user.id)];

        if (input.dateFrom) {
          conditions.push(sql`${searchQueries.createdAt} >= ${new Date(input.dateFrom)}`);
        }

        if (input.dateTo) {
          conditions.push(sql`${searchQueries.createdAt} <= ${new Date(input.dateTo)}`);
        }

        // Get recent searches
        const recentSearches = await ctx.db
          .select()
          .from(searchQueries)
          .where(and(...conditions))
          .orderBy(desc(searchQueries.createdAt))
          .limit(input.limit);

        // Get popular searches
        const popularSearches = await ctx.db
          .select({
            query: searchQueries.query,
            count: sql<number>`count(*)`,
            avgResponseTime: sql<number>`avg(${searchQueries.responseTime})`,
          })
          .from(searchQueries)
          .where(and(...conditions))
          .groupBy(searchQueries.query)
          .orderBy(sql`count(*) DESC`)
          .limit(10);

        // Get search stats
        const [stats] = await ctx.db
          .select({
            totalSearches: sql<number>`count(*)`,
            avgResponseTime: sql<number>`avg(${searchQueries.responseTime})`,
            avgResultsCount: sql<number>`avg(${searchQueries.resultsCount})`,
          })
          .from(searchQueries)
          .where(and(...conditions));

        return {
          recentSearches,
          popularSearches,
          stats: stats || {
            totalSearches: 0,
            avgResponseTime: 0,
            avgResultsCount: 0,
          },
        };

      } catch (error) {
        console.error('Search analytics error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get search analytics',
        });
      }
    }),

  // Clear search history
  clearSearchHistory: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        await ctx.db
          .delete(searchQueries)
          .where(eq(searchQueries.userId, ctx.user.id));

        return {
          message: 'Search history cleared successfully',
        };
      } catch (error) {
        console.error('Clear search history error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to clear search history',
        });
      }
    }),
});

// TIER 1: Structured search with basic text matching
async function performTier1Search(params: {
  terms: string[];
  filters: Record<string, string>;
  siteIds: string[];
  categories?: FileCategory[];
  dateFrom?: string;
  dateTo?: string;
  mimeTypes?: string[];
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
  db: any;
}) {
  const conditions = [inArray(files.siteId, params.siteIds)];

  // Add category filter
  if (params.categories && params.categories.length > 0) {
    conditions.push(inArray(files.category, params.categories));
  }

  // Add date range filter
  if (params.dateFrom) {
    conditions.push(sql`${files.createdAt} >= ${new Date(params.dateFrom)}`);
  }
  if (params.dateTo) {
    conditions.push(sql`${files.createdAt} <= ${new Date(params.dateTo)}`);
  }

  // Add mime type filter
  if (params.mimeTypes && params.mimeTypes.length > 0) {
    conditions.push(inArray(files.mimeType, params.mimeTypes));
  }

  // Add text search conditions
  if (params.terms.length > 0) {
    const textConditions = params.terms.map(term =>
      or(
        like(files.filename, `%${term}%`),
        like(files.originalName, `%${term}%`),
        like(files.aiDescription, `%${term}%`),
        like(files.aiTags, `%${term}%`)
      )
    );
    conditions.push(and(...textConditions));
  }

  // Apply filters from parsed query
  Object.entries(params.filters).forEach(([key, value]) => {
    switch (key) {
      case 'category':
        if (Object.values(FileCategory).includes(value as FileCategory)) {
          conditions.push(eq(files.category, value));
        }
        break;
      case 'type':
        conditions.push(like(files.mimeType, `%${value}%`));
        break;
      case 'site':
        conditions.push(like(files.siteId, `%${value}%`));
        break;
    }
  });

  // Get total count
  const [countResult] = await params.db
    .select({ count: sql<number>`count(*)` })
    .from(files)
    .where(and(...conditions));

  const total = countResult?.count || 0;

  // Get files
  const sortColumn = files[params.sortBy as keyof typeof files] || files.createdAt;
  const orderFn = params.sortOrder === 'desc' ? desc : undefined;

  const fileResults = await params.db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(orderFn ? orderFn(sortColumn) : sortColumn)
    .limit(params.limit)
    .offset((params.page - 1) * params.limit);

  return {
    files: fileResults,
    total,
    page: params.page,
    limit: params.limit,
  };
}

// TIER 2: Full-text search
async function performTier2Search(params: {
  query: string;
  siteIds: string[];
  categories?: FileCategory[];
  dateFrom?: string;
  dateTo?: string;
  mimeTypes?: string[];
  limit: number;
}) {
  try {
    return await searchFiles(params.query, params.siteIds);
  } catch (error) {
    console.error('Full-text search error:', error);
    return [];
  }
}

// TIER 3: AI semantic search
async function performTier3Search(params: {
  query: string;
  siteIds: string[];
  categories?: FileCategory[];
  dateFrom?: string;
  dateTo?: string;
  mimeTypes?: string[];
  limit: number;
  db: any;
}) {
  try {
    // Get all files with AI descriptions in accessible sites
    const allFiles = await params.db
      .select()
      .from(files)
      .where(
        and(
          inArray(files.siteId, params.siteIds),
          sql`${files.aiDescription} IS NOT NULL AND ${files.aiDescription} != ''`
        )
      )
      .limit(1000); // Limit to prevent too much data

    if (allFiles.length === 0) {
      return [];
    }

    // Extract descriptions for semantic search
    const descriptions = allFiles.map(file => file.aiDescription || '');
    
    // Perform semantic search
    const semanticResults = await semanticSearch(params.query, descriptions);
    
    // Map results back to files
    const rankedFiles = semanticResults
      .map(result => ({
        ...allFiles[result.index],
        relevanceScore: result.score,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, params.limit);

    return rankedFiles;

  } catch (error) {
    console.error('Semantic search error:', error);
    return [];
  }
}

// Log search query for analytics
async function logSearchQuery(params: {
  userId: string;
  query: string;
  filters: any;
  resultsCount: number;
  responseTime: number;
  db: any;
}) {
  try {
    await params.db.insert(searchQueries).values({
      id: nanoid(),
      userId: params.userId,
      query: params.query,
      filters: JSON.stringify(params.filters),
      resultsCount: params.resultsCount,
      responseTime: params.responseTime,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to log search query:', error);
    // Don't throw error, just log it
  }
}