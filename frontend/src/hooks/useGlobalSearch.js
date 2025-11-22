import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const RECENT_SEARCHES_KEY = 'globalSearch_recentSearches';
const MAX_RECENT_SEARCHES = 5;

/**
 * Custom hook for global search with debouncing and recent searches
 *
 * @param {number} debounceDelay - Delay in milliseconds for debouncing (default: 300ms)
 * @returns {Object} Search state and methods
 */
export const useGlobalSearch = (debounceDelay = 300) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({
    customers: [],
    work_items: [],
    total_count: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);

  const debounceTimerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load recent searches:', err);
    }
  }, []);

  // Save recent searches to localStorage
  const saveRecentSearch = useCallback((searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) return;

    setRecentSearches(prev => {
      // Remove duplicate if exists
      const filtered = prev.filter(item => item !== searchQuery);
      // Add to beginning
      const updated = [searchQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);

      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save recent search:', err);
      }

      return updated;
    });
  }, []);

  // Clear recent searches
  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (err) {
      console.error('Failed to clear recent searches:', err);
    }
  }, []);

  // Perform search API call
  const performSearch = useCallback(async (searchQuery, entityTypes = '') => {
    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Don't search if query is too short
    if (searchQuery.trim().length < 2) {
      setResults({
        customers: [],
        work_items: [],
        total_count: 0
      });
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const params = new URLSearchParams({ q: searchQuery });
      if (entityTypes) {
        params.append('entity_types', entityTypes);
      }

      const response = await axios.get(`/core/search/?${params.toString()}`, {
        signal: abortControllerRef.current.signal
      });

      setResults(response.data);

      // Save to recent searches only on successful search
      if (response.data.total_count > 0) {
        saveRecentSearch(searchQuery);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
        console.error('Search error:', err);
        setError(err.response?.data?.detail || 'Search failed. Please try again.');
        setResults({
          customers: [],
          work_items: [],
          total_count: 0
        });
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [saveRecentSearch]);

  // Debounced search effect
  useEffect(() => {
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer
    if (query.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        performSearch(query);
      }, debounceDelay);
    } else {
      // Clear results if query is too short
      setResults({
        customers: [],
        work_items: [],
        total_count: 0
      });
      setError(null);
      setIsLoading(false);
    }

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, debounceDelay, performSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    recentSearches,
    clearRecentSearches,
    performSearch, // Exposed for manual search (e.g., clicking recent search)
  };
};

export default useGlobalSearch;
