import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '../lib/trpc';
import { debounce, parseSearchQuery } from '../lib/utils';
import type { 
  SearchState, 
  SearchFilters, 
  FileWithDetails, 
  FileCategory,
  SearchResult,
  SearchRequest 
} from '../types';

interface UseSearchOptions {
  initialQuery?: string;
  initialFilters?: SearchFilters;
  debounceMs?: number;
  autoSearch?: boolean;
  saveToUrl?: boolean;
  pageSize?: number;
}

export const useSearch = (options: UseSearchOptions = {}) => {
  const {
    initialQuery = '',
    initialFilters = {},
    debounceMs = 300,
    autoSearch = true,
    saveToUrl = true,
    pageSize = 20,
  } = options;

  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from URL params if available
  const [searchState, setSearchState] = useState<SearchState>(() => {
    if (saveToUrl && searchParams) {
      const urlQuery = searchParams.get('q') || initialQuery;
      const urlSiteIds = searchParams.get('sites')?.split(',').filter(Boolean) || initialFilters.siteIds;
      const urlCategories = searchParams.get('categories')?.split(',').filter(Boolean) as FileCategory[] || initialFilters.categories;
      const urlPage = parseInt(searchParams.get('page') || '1');

      return {
        query: urlQuery,
        filters: {
          siteIds: urlSiteIds,
          categories: urlCategories,
          dateFrom: searchParams.get('dateFrom') || initialFilters.dateFrom,
          dateTo: searchParams.get('dateTo') || initialFilters.dateTo,
          mimeTypes: searchParams.get('mimeTypes')?.split(',').filter(Boolean) || initialFilters.mimeTypes,
        },
        results: [],
        isLoading: false,
        error: null,
        suggestions: [],
        total: 0,
        page: urlPage,
        hasMore: false,
      };
    }

    return {
      query: initialQuery,
      filters: initialFilters,
      results: [],
      isLoading: false,
      error: null,
      suggestions: [],
      total: 0,
      page: 1,
      hasMore: false,
    };
  });

  // tRPC queries and mutations
  const searchMutation = trpc.search.search.useMutation({
    onSuccess: (data: SearchResult) => {
      setSearchState(prev => ({
        ...prev,
        results: prev.page === 1 ? data.files : [...prev.results, ...data.files],
        total: data.total,
        isLoading: false,
        error: null,
        hasMore: data.files.length === pageSize && data.total > prev.results.length + data.files.length,
      }));
    },
    onError: (error) => {
      setSearchState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message,
      }));
    },
  });

  const { data: suggestions, refetch: refetchSuggestions } = trpc.search.getSuggestions.useQuery(
    { 
      query: searchState.query,
      limit: 10,
    },
    {
      enabled: false, // We'll trigger this manually
      refetchOnWindowFocus: false,
    }
  );

  // Update suggestions when data changes
  useEffect(() => {
    if (suggestions) {
      setSearchState(prev => ({
        ...prev,
        suggestions,
      }));
    }
  }, [suggestions]);

  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce((query: string, filters: SearchFilters, page: number) => {
      if (query.trim()) {
        performSearch(query, filters, page);
      } else {
        clearResults();
      }
    }, debounceMs),
    [debounceMs]
  );

  // Debounced suggestions fetch
  const debouncedSuggestions = useMemo(
    () => debounce((query: string) => {
      if (query.trim().length >= 2) {
        refetchSuggestions();
      }
    }, 200),
    []
  );

  // Perform search
  const performSearch = useCallback(async (
    query: string,
    filters: SearchFilters = {},
    page: number = 1
  ) => {
    if (!query.trim()) {
      clearResults();
      return;
    }

    setSearchState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      page,
    }));

    const searchRequest: SearchRequest = {
      query: query.trim(),
      siteIds: filters.siteIds,
      categories: filters.categories,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      mimeTypes: filters.mimeTypes,
      page,
      limit: pageSize,
      sortBy: 'relevance',
      sortOrder: 'desc',
    };

    try {
      await searchMutation.mutateAsync(searchRequest);
    } catch (error) {
      console.error('Search error:', error);
    }
  }, [searchMutation, pageSize]);

  // Update search query
  const setQuery = useCallback((query: string) => {
    setSearchState(prev => ({
      ...prev,
      query,
      page: 1,
    }));

    // Update URL if enabled
    if (saveToUrl) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      if (query.trim()) {
        params.set('q', query);
      } else {
        params.delete('q');
      }
      params.set('page', '1');
      router.push(`?${params.toString()}`);
    }

    // Trigger search if auto-search is enabled
    if (autoSearch) {
      debouncedSearch(query, searchState.filters, 1);
    }

    // Fetch suggestions
    debouncedSuggestions(query);
  }, [searchState.filters, saveToUrl, autoSearch, debouncedSearch, debouncedSuggestions, router, searchParams]);

  // Update search filters
  const setFilters = useCallback((filters: Partial<SearchFilters>) => {
    const newFilters = { ...searchState.filters, ...filters };
    
    setSearchState(prev => ({
      ...prev,
      filters: newFilters,
      page: 1,
    }));

    // Update URL if enabled
    if (saveToUrl) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      
      if (newFilters.siteIds?.length) {
        params.set('sites', newFilters.siteIds.join(','));
      } else {
        params.delete('sites');
      }
      
      if (newFilters.categories?.length) {
        params.set('categories', newFilters.categories.join(','));
      } else {
        params.delete('categories');
      }
      
      if (newFilters.dateFrom) {
        params.set('dateFrom', newFilters.dateFrom);
      } else {
        params.delete('dateFrom');
      }
      
      if (newFilters.dateTo) {
        params.set('dateTo', newFilters.dateTo);
      } else {
        params.delete('dateTo');
      }
      
      if (newFilters.mimeTypes?.length) {
        params.set('mimeTypes', newFilters.mimeTypes.join(','));
      } else {
        params.delete('mimeTypes');
      }
      
      params.set('page', '1');
      router.push(`?${params.toString()}`);
    }

    // Trigger search if auto-search is enabled and we have a query
    if (autoSearch && searchState.query.trim()) {
      debouncedSearch(searchState.query, newFilters, 1);
    }
  }, [searchState.filters, searchState.query, saveToUrl, autoSearch, debouncedSearch, router, searchParams]);

  // Load more results (pagination)
  const loadMore = useCallback(() => {
    if (!searchState.isLoading && searchState.hasMore && searchState.query.trim()) {
      const nextPage = searchState.page + 1;
      setSearchState(prev => ({ ...prev, page: nextPage }));
      
      // Update URL if enabled
      if (saveToUrl) {
        const params = new URLSearchParams(searchParams?.toString() || '');
        params.set('page', nextPage.toString());
        router.push(`?${params.toString()}`, { scroll: false });
      }

      performSearch(searchState.query, searchState.filters, nextPage);
    }
  }, [searchState, saveToUrl, performSearch, router, searchParams]);

  // Search with current params
  const search = useCallback(() => {
    if (searchState.query.trim()) {
      performSearch(searchState.query, searchState.filters, 1);
    }
  }, [searchState.query, searchState.filters, performSearch]);

  // Clear search results
  const clearResults = useCallback(() => {
    setSearchState(prev => ({
      ...prev,
      results: [],
      total: 0,
      page: 1,
      hasMore: false,
      error: null,
    }));
  }, []);

  // Clear everything (query, filters, results)
  const clearAll = useCallback(() => {
    setSearchState({
      query: '',
      filters: {},
      results: [],
      isLoading: false,
      error: null,
      suggestions: [],
      total: 0,
      page: 1,
      hasMore: false,
    });

    // Clear URL params if enabled
    if (saveToUrl) {
      router.push(window.location.pathname);
    }
  }, [saveToUrl, router]);

  // Quick search with a specific query
  const quickSearch = useCallback(async (query: string) => {
    setQuery(query);
    await performSearch(query, searchState.filters, 1);
  }, [setQuery, performSearch, searchState.filters]);

  // Get parsed search query (terms and filters)
  const parsedQuery = useMemo(() => {
    return parseSearchQuery(searchState.query);
  }, [searchState.query]);

  // Check if search has any filters applied
  const hasFilters = useMemo(() => {
    return !!(
      searchState.filters.siteIds?.length ||
      searchState.filters.categories?.length ||
      searchState.filters.dateFrom ||
      searchState.filters.dateTo ||
      searchState.filters.mimeTypes?.length
    );
  }, [searchState.filters]);

  // Check if search is active
  const hasActiveSearch = useMemo(() => {
    return !!(searchState.query.trim() || hasFilters);
  }, [searchState.query, hasFilters]);

  return {
    // State
    query: searchState.query,
    filters: searchState.filters,
    results: searchState.results,
    suggestions: searchState.suggestions,
    isLoading: searchState.isLoading,
    error: searchState.error,
    total: searchState.total,
    page: searchState.page,
    hasMore: searchState.hasMore,
    
    // Actions
    setQuery,
    setFilters,
    search,
    loadMore,
    clearResults,
    clearAll,
    quickSearch,
    
    // Utilities
    parsedQuery,
    hasFilters,
    hasActiveSearch,
    hasResults: searchState.results.length > 0,
    
    // Mutation states
    isSearching: searchMutation.isLoading,
  };
};

// Hook for search analytics
export const useSearchAnalytics = (dateFrom?: string, dateTo?: string) => {
  const { data, isLoading, error, refetch } = trpc.search.getSearchAnalytics.useQuery({
    dateFrom,
    dateTo,
    limit: 50,
  });

  return {
    analytics: data,
    isLoading,
    error: error?.message,
    refetch,
  };
};

// Hook for clearing search history
export const useClearSearchHistory = () => {
  const clearMutation = trpc.search.clearSearchHistory.useMutation();

  const clearHistory = useCallback(async () => {
    return clearMutation.mutateAsync();
  }, [clearMutation]);

  return {
    clearHistory,
    isClearing: clearMutation.isLoading,
    error: clearMutation.error?.message,
  };
};

export default useSearch;