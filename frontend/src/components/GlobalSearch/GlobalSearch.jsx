import { useState, useRef, useEffect } from 'react';
import useGlobalSearch from '../../hooks/useGlobalSearch';
import SearchDropdown from './SearchDropdown';
import RecentSearches from './RecentSearches';

const GlobalSearch = () => {
  const {
    query,
    setQuery,
    results,
    isLoading,
    error,
    recentSearches,
    clearRecentSearches,
  } = useGlobalSearch(300); // 300ms debounce

  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [onSelectCallback, setOnSelectCallback] = useState(null);

  const searchContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Calculate total number of results for keyboard navigation
  const totalResults = (results.customers?.length || 0) + (results.work_items?.length || 0);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsOpen(false);
        setIsFocused(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Open dropdown when results change or when focusing
  useEffect(() => {
    if (isFocused && (query.length >= 2 || recentSearches.length > 0)) {
      setIsOpen(true);
    }
  }, [results, query, isFocused, recentSearches]);

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setSelectedIndex(-1); // Reset selection when typing
    if (e.target.value.trim().length >= 2) {
      setIsOpen(true);
    }
  };

  const handleInputFocus = () => {
    setIsFocused(true);
    if (query.length >= 2 || recentSearches.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Small delay to allow click events to register
    setTimeout(() => {
      setIsFocused(false);
    }, 200);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedIndex(-1);
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  const handleRecentSearchClick = (searchTerm) => {
    setQuery(searchTerm);
    setIsOpen(true);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleClearRecent = () => {
    clearRecentSearches();
  };

  const handleSelect = (index, callback) => {
    setOnSelectCallback(() => callback);
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) return;

    // Show recent searches if input is empty/short
    const showingRecent = query.length < 2 && recentSearches.length > 0;
    const maxIndex = showingRecent ? recentSearches.length - 1 : totalResults - 1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < maxIndex ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : maxIndex
        );
        break;

      case 'Enter':
        e.preventDefault();
        if (showingRecent && selectedIndex >= 0 && selectedIndex < recentSearches.length) {
          // Select recent search
          handleRecentSearchClick(recentSearches[selectedIndex]);
        } else if (selectedIndex >= 0 && onSelectCallback) {
          // Select result
          onSelectCallback();
        } else if (query.length >= 2) {
          // No selection, just search (navigate to results page)
          handleClose();
        }
        break;

      case 'Escape':
        e.preventDefault();
        handleClose();
        break;

      case 'Tab':
        // Allow tab to work normally but close dropdown
        handleClose();
        break;

      default:
        break;
    }
  };

  return (
    <div ref={searchContainerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search customers, work items..."
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-2 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {isLoading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
          ) : (
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setSelectedIndex(-1);
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <SearchDropdown
          results={results}
          isLoading={isLoading}
          error={error}
          query={query}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onClose={handleClose}
        />
      )}

      {isOpen && query.length < 2 && recentSearches.length > 0 && (
        <RecentSearches
          searches={recentSearches}
          onSearchClick={handleRecentSearchClick}
          onClear={handleClearRecent}
        />
      )}
    </div>
  );
};

export default GlobalSearch;
