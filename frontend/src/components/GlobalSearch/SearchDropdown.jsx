import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';

const STATUS_COLORS = {
  'New': 'bg-blue-100 text-blue-800',
  'In Progress': 'bg-yellow-100 text-yellow-800',
  'Resolved': 'bg-green-100 text-green-800',
};

const SearchDropdown = ({
  results,
  isLoading,
  error,
  query,
  selectedIndex,
  onSelect,
  onClose,
  showSeeAll = true
}) => {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const selectedItemRef = useRef(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex]);

  if (!query || query.length < 2) {
    return null;
  }

  const { customers = [], work_items = [], total_count = 0 } = results;

  // Flatten results for keyboard navigation
  const allResults = [
    ...customers.map(c => ({ type: 'customer', data: c })),
    ...work_items.map(w => ({ type: 'work_item', data: w }))
  ];

  const handleCustomerClick = (customer) => {
    navigate(`/customers/${customer.id}`);
    onClose();
  };

  const handleWorkItemClick = (workItem) => {
    navigate(`/work-items/${workItem.id}`);
    onClose();
  };

  const handleSeeAllClick = () => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
    onClose();
  };

  const handleItemClick = (index) => {
    const item = allResults[index];
    if (!item) return;

    if (item.type === 'customer') {
      handleCustomerClick(item.data);
    } else if (item.type === 'work_item') {
      handleWorkItemClick(item.data);
    }
  };

  // Notify parent of selection
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < allResults.length) {
      onSelect(selectedIndex, () => handleItemClick(selectedIndex));
    }
  }, [selectedIndex]);

  const renderCustomerItem = (customer, index, isSelected) => {
    const customerName = `${customer.first_name} ${customer.last_name || ''}`.trim();
    const workItemCount = customer.active_work_item_count || 0;

    return (
      <div
        key={`customer-${customer.id}`}
        ref={isSelected ? selectedItemRef : null}
        onClick={() => handleCustomerClick(customer)}
        className={`px-4 py-3 cursor-pointer transition-colors ${
          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{customerName}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                  {customer.phone_number && (
                    <span className="truncate">{customer.phone_number}</span>
                  )}
                  {customer.email && (
                    <>
                      {customer.phone_number && <span>•</span>}
                      <span className="truncate">{customer.email}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          {workItemCount > 0 && (
            <span className="ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              {workItemCount} active
            </span>
          )}
        </div>
        {customer.recent_work_items && customer.recent_work_items.length > 0 && (
          <div className="mt-2 ml-7 space-y-1">
            {customer.recent_work_items.map((wi) => (
              <div key={wi.id} className="text-xs text-gray-600 flex items-center gap-2">
                <span className="font-medium">{wi.reference_id}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[wi.status] || 'bg-gray-100 text-gray-800'}`}>
                  {wi.status}
                </span>
                {wi.device_name && (
                  <span className="truncate">{wi.device_name}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderWorkItemItem = (workItem, index, isSelected) => {
    const customerName = workItem.customer
      ? `${workItem.customer.first_name} ${workItem.customer.last_name || ''}`.trim()
      : 'Unknown Customer';

    return (
      <div
        key={`workitem-${workItem.id}`}
        ref={isSelected ? selectedItemRef : null}
        onClick={() => handleWorkItemClick(workItem)}
        className={`px-4 py-3 cursor-pointer transition-colors ${
          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900">{workItem.reference_id}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[workItem.status] || 'bg-gray-100 text-gray-800'}`}>
                {workItem.status}
              </span>
              {workItem.priority === 'Express' && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                  Express
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1 truncate">{customerName}</p>
            {workItem.device_name && (
              <p className="text-xs text-gray-500 mt-0.5">{workItem.device_name}</p>
            )}
            {workItem.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{workItem.description}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[600px] overflow-hidden flex flex-col"
    >
      {isLoading && (
        <div className="px-4 py-8 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-sm text-gray-500 mt-2">Searching...</p>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 text-sm text-red-600 bg-red-50">
          {error}
        </div>
      )}

      {!isLoading && !error && total_count === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p>No results found for "{query}"</p>
          <p className="text-xs text-gray-400 mt-1">Try different keywords</p>
        </div>
      )}

      {!isLoading && !error && total_count > 0 && (
        <div className="overflow-y-auto">
          {customers.length > 0 && (
            <div className="border-b border-gray-100">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Customers ({customers.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {customers.map((customer, idx) => {
                  const globalIndex = idx;
                  const isSelected = selectedIndex === globalIndex;
                  return renderCustomerItem(customer, globalIndex, isSelected);
                })}
              </div>
            </div>
          )}

          {work_items.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Work Items ({work_items.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {work_items.map((workItem, idx) => {
                  const globalIndex = customers.length + idx;
                  const isSelected = selectedIndex === globalIndex;
                  return renderWorkItemItem(workItem, globalIndex, isSelected);
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showSeeAll && !isLoading && !error && total_count > 0 && (
        <div className="border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleSeeAllClick}
            className="w-full px-4 py-3 text-sm text-blue-600 hover:bg-gray-100 font-medium text-center transition-colors"
          >
            See all results ({total_count})
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchDropdown;
