const RecentSearches = ({ searches, onSearchClick, onClear }) => {
  if (!searches || searches.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Recent Searches
        </h3>
        <button
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
        {searches.map((search, index) => (
          <button
            key={index}
            onClick={() => onSearchClick(search)}
            className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 group"
          >
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors flex-1">
              {search}
            </span>
            <svg
              className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors opacity-0 group-hover:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RecentSearches;
