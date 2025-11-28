import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import apiClient from "../api/apiClient";
import AddressModal from "./AddressModal";

export default function LocationPicker({
    value,
    onSelect,
    error,
    required,
    label = "Location",
    placeholder = "Search location...",
    customerId = null,
    onCreateLocation = null,
    ...props
}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState({ groups: [] });
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const searchTimeoutRef = useRef();

    // Set initial value
    useEffect(() => {
        if (value) {
            setQuery(value.name || "");
        } else {
            setQuery("");
        }
    }, [value]);

    // Search locations when query changes
    const searchLocations = useCallback(async (searchQuery) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('q', searchQuery || '');
            if (customerId) {
                params.append('customer_id', customerId);
            }

            const response = await apiClient.get(`/api/service/api/locations/search/?${params.toString()}`);
            setResults(response.data);
            const groups = response.data?.groups || [];
            const hasItems = groups.some((group) => group.items && group.items.length > 0);
            setHighlightedIndex(hasItems ? 0 : -1);
        } catch (error) {
            console.error("Error searching locations:", error);
            setResults({ groups: [] });
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    const previousCustomerIdRef = useRef(customerId);

    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        const trimmedQuery = query.trim();
        const shouldSearch = trimmedQuery.length >= 2;
        const shouldLoadDefaults = trimmedQuery.length === 0;
        const customerChanged = previousCustomerIdRef.current !== customerId;
        previousCustomerIdRef.current = customerId;

        if (!shouldSearch && !shouldLoadDefaults && !customerChanged) {
            return undefined;
        }

        const delay = shouldSearch ? 300 : 0;
        const term = shouldSearch ? trimmedQuery : "";

        searchTimeoutRef.current = setTimeout(() => {
            searchLocations(term);
        }, delay);

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [query, customerId, searchLocations]);

    const handleItemSelect = (item) => {
        if (item.id === "new") {
            setShowAddressModal(true);
            setShowResults(false);
            setHighlightedIndex(-1);
            return;
        }

        setQuery(item.name);
        setShowResults(false);
        setHighlightedIndex(-1);
        onSelect(item);
    };

    const handleAddressModalSave = async (addressData) => {
        if (onCreateLocation) {
            try {
                const newLocation = await onCreateLocation(addressData);
                setQuery(newLocation.name);
                onSelect(newLocation);
            } catch (error) {
                console.error("Error creating location:", error);
                throw error;
            }
        }
    };

    const flattenedItems = useMemo(() => {
        const list = [];
        results.groups?.forEach((group, groupIndex) => {
            group.items?.forEach((item, itemIndex) => {
                list.push({ item, key: `${groupIndex}-${itemIndex}` });
            });
        });
        return list;
    }, [results]);

    const highlighted = highlightedIndex >= 0 ? flattenedItems[highlightedIndex] : null;

    useEffect(() => {
        if (highlightedIndex >= flattenedItems.length) {
            setHighlightedIndex(flattenedItems.length ? Math.max(0, flattenedItems.length - 1) : -1);
        }
    }, [flattenedItems, highlightedIndex]);

    const hasResults = results.groups && results.groups.some(group => group.items && group.items.length > 0);

    return (
        <div className="relative mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>

            <input
                type="text"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    error ? 'border-red-500' : 'border-gray-300'
                }`}
                value={query}
                placeholder={placeholder}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setShowResults(true);
                    setHighlightedIndex(-1);
                }}
                onFocus={() => {
                    setShowResults(true);
                    if (!query.trim()) {
                        searchLocations("");
                    }
                }}
                onKeyDown={(e) => {
                    const optionCount = flattenedItems.length;

                    if (e.key === "ArrowDown") {
                        if (!optionCount) return;
                        e.preventDefault();
                        setShowResults(true);
                        setHighlightedIndex((prev) => {
                            const next = prev + 1;
                            return next >= optionCount || prev === -1 ? 0 : next;
                        });
                    } else if (e.key === "ArrowUp") {
                        if (!optionCount) return;
                        e.preventDefault();
                        setShowResults(true);
                        setHighlightedIndex((prev) => {
                            if (prev <= 0) return optionCount - 1;
                            return prev - 1;
                        });
                    } else if (e.key === "Enter") {
                        if (highlighted?.item) {
                            e.preventDefault();
                            handleItemSelect(highlighted.item);
                        }
                    } else if (e.key === "Escape") {
                        setShowResults(false);
                        setHighlightedIndex(-1);
                    }
                }}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                autoComplete="off"
                {...props}
            />

            {showResults && (
                <div className="absolute top-full left-0 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto text-sm" style={{zIndex: 9999}}>
                    {loading && <div className="px-4 py-2 text-gray-500">Loading...</div>}

                    {!loading && hasResults && results.groups.map((group, groupIndex) =>
                        group.items && group.items.length > 0 ? (
                            <div key={group.label}>
                                <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b">
                                    {group.label}
                                </div>
                                {group.items.map((item, itemIndex) => {
                                    const flatKey = `${groupIndex}-${itemIndex}`;
                                    const isHighlighted = highlighted?.key === flatKey;
                                    return (
                                        <div
                                            key={`${group.label}-${item.id}`}
                                            onMouseDown={() => handleItemSelect(item)}
                                            onMouseEnter={() => {
                                                const idx = flattenedItems.findIndex((entry) => entry.key === flatKey);
                                                setHighlightedIndex(idx);
                                            }}
                                            className={`px-4 py-2 cursor-pointer transition-colors border-b border-gray-100 last:border-none ${
                                                isHighlighted ? 'bg-blue-100 text-blue-800' : 'bg-white hover:bg-blue-50'
                                            } ${item.id === "new" ? 'text-blue-600 font-medium' : ''}`}
                                        >
                                            <div className="font-medium text-sm">{item.name}</div>
                                            {item.address && (
                                                <div className="text-xs text-gray-500 mt-1">{item.address}</div>
                                            )}
                                            {item.shop_name && (
                                                <div className="text-xs text-blue-600 mt-1">Shop: {item.shop_name}</div>
                                            )}
                                            {item.customer_name && (
                                                <div className="text-xs text-green-600 mt-1">Customer: {item.customer_name}</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null
                    )}

                    {!loading && !hasResults && query.length >= 2 && (
                        <div className="px-4 py-2 text-gray-500">No locations found</div>
                    )}
                </div>
            )}

            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

            {/* Address Modal */}
            <AddressModal
                isOpen={showAddressModal}
                onClose={() => setShowAddressModal(false)}
                onSave={handleAddressModalSave}
                showSaveToCustomer={!!customerId}
                title="Add New Address"
            />
        </div>
    );
}
