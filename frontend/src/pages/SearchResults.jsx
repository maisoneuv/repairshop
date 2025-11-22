import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const STATUS_COLORS = {
  'New': 'bg-blue-100 text-blue-800',
  'In Progress': 'bg-yellow-100 text-yellow-800',
  'Resolved': 'bg-green-100 text-green-800',
};

const SearchResults = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  const entityTypeParam = searchParams.get('type') || 'all';

  const [results, setResults] = useState({ customers: [], work_items: [], total_count: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(entityTypeParam);

  useEffect(() => {
    if (query.length >= 2) {
      performSearch(query, activeTab);
    } else {
      setResults({ customers: [], work_items: [], total_count: 0 });
    }
  }, [query, activeTab]);

  const performSearch = async (searchQuery, type) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: searchQuery });
      if (type !== 'all') {
        params.append('entity_types', type === 'customers' ? 'customers' : 'work_items');
      }

      const response = await axios.get(`/core/search/?${params.toString()}`);
      setResults(response.data);
    } catch (err) {
      console.error('Search error:', err);
      setError(err.response?.data?.detail || 'Search failed. Please try again.');
      setResults({ customers: [], work_items: [], total_count: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ q: query, type: tab });
  };

  const handleCustomerClick = (customerId) => {
    navigate(`/customers/${customerId}`);
  };

  const handleWorkItemClick = (workItemId) => {
    navigate(`/work-items/${workItemId}`);
  };

  const renderCustomerCard = (customer) => {
    const customerName = `${customer.first_name} ${customer.last_name || ''}`.trim();
    const workItemCount = customer.active_work_item_count || 0;

    return (
      <div
        key={customer.id}
        onClick={() => handleCustomerClick(customer.id)}
        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{customerName}</h3>
              <div className="mt-1 space-y-1">
                {customer.phone_number && (
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {customer.phone_number}
                  </p>
                )}
                {customer.email && (
                  <p className="text-sm text-gray-600 flex items-center gap-2 truncate">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{customer.email}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          {workItemCount > 0 && (
            <span className="ml-2 flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-blue-100 text-blue-800">
              {workItemCount} active work {workItemCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        {customer.recent_work_items && customer.recent_work_items.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Work Items</p>
            <div className="space-y-2">
              {customer.recent_work_items.map((wi) => (
                <div key={wi.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium text-gray-900">{wi.reference_id}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[wi.status] || 'bg-gray-100 text-gray-800'}`}>
                      {wi.status}
                    </span>
                    {wi.device_name && (
                      <span className="text-gray-500 truncate">{wi.device_name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderWorkItemCard = (workItem) => {
    const customerName = workItem.customer
      ? `${workItem.customer.first_name} ${workItem.customer.last_name || ''}`.trim()
      : 'Unknown Customer';

    return (
      <div
        key={workItem.id}
        onClick={() => handleWorkItemClick(workItem.id)}
        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="text-lg font-semibold text-gray-900">{workItem.reference_id}</h3>
              <span className={`px-2.5 py-1 rounded-md text-sm font-medium ${STATUS_COLORS[workItem.status] || 'bg-gray-100 text-gray-800'}`}>
                {workItem.status}
              </span>
              {workItem.priority === 'Express' && (
                <span className="px-2.5 py-1 rounded-md text-sm font-medium bg-red-100 text-red-800">
                  Express
                </span>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="font-medium">{customerName}</span>
                {workItem.customer?.phone_number && (
                  <>
                    <span className="text-gray-400">•</span>
                    <span>{workItem.customer.phone_number}</span>
                  </>
                )}
              </p>
              {workItem.device_name && (
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  {workItem.device_name}
                </p>
              )}
              {workItem.description && (
                <p className="text-sm text-gray-600 line-clamp-2 mt-2">{workItem.description}</p>
              )}
              {workItem.created_date && (
                <p className="text-xs text-gray-500 mt-2">
                  Created {new Date(workItem.created_date).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const customerCount = results.customers?.length || 0;
  const workItemCount = results.work_items?.length || 0;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Search Results</h1>
        {query && (
          <p className="text-gray-600">
            Found <span className="font-semibold">{results.total_count}</span> results for "{query}"
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => handleTabChange('all')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'all'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            All Results ({results.total_count})
          </button>
          <button
            onClick={() => handleTabChange('customers')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'customers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Customers ({customerCount})
          </button>
          <button
            onClick={() => handleTabChange('work_items')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'work_items'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Work Items ({workItemCount})
          </button>
        </nav>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="ml-3 text-gray-600">Searching...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && results.total_count === 0 && query.length >= 2 && (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-600">Try different keywords or check your spelling</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && !error && results.total_count > 0 && (
        <div className="space-y-8">
          {/* Customers section */}
          {(activeTab === 'all' || activeTab === 'customers') && customerCount > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Customers ({customerCount})
              </h2>
              <div className="grid gap-4">
                {results.customers.map(renderCustomerCard)}
              </div>
            </div>
          )}

          {/* Work Items section */}
          {(activeTab === 'all' || activeTab === 'work_items') && workItemCount > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Work Items ({workItemCount})
              </h2>
              <div className="grid gap-4">
                {results.work_items.map(renderWorkItemCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchResults;
