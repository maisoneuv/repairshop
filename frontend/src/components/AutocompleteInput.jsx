import { useEffect, useState } from "react";

/**
 * AutocompleteInput
 *
 * A highly flexible autocomplete input for selecting related objects via search.
 *
 * Props:
 * @param {string} [label] - The label displayed above the input.
 * @param {function} searchFn - Function that accepts a query string and returns matching items. Must return a Promise of an array.
 * @param {function} [fetchAllFn] - Function that returns all items (for picklist behavior). Must return a Promise of an array.
 * @param {function} getDetailFn - Function that accepts an ID and returns the full object details. Must return a Promise.
 * @param {object|number} [value] - Currently selected object or ID.
 * @param {function} onSelect - Called when an item is selected from suggestions. Receives the item.
 * @param {function} [displayField] - Function to render an item as a string in the input and dropdown. Default: item.name || item.email || #id.
 * @param {function} [onCreateNewClick] - Handler when "Create new" button is clicked (for modal triggers, etc.).
 * @param {string} [error] - Validation error text to display.
 * @param {boolean} [allowCustomCreate] - Whether to show "Create <query>" option.
 * @param {function} [onCreateNewItem] - Handler when custom create option is selected.
 * @param {string} [placeholder] - Input placeholder text.
 */
export default function AutocompleteInput({
                                              label,
                                              required = false,
                                              searchFn,
                                              fetchAllFn,
                                              getDetailFn,
                                              value,
                                              onSelect,
                                              displayField = (item) => item.name || item.email || `#${item.id}`,
                                              onCreateNewClick = null,
                                              error = null,
                                              allowCustomCreate,
                                              onCreateNewItem,
                                              placeholder = 'Start typing...',
                                          }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [allItems, setAllItems] = useState(null); // Cache for all items

    // 🔁 Fetch full object from ID on mount
    useEffect(() => {
        if (!value) return;

        if (typeof value === "number" && getDetailFn) {
            getDetailFn(value)
                .then((data) => {
                    setSelectedItem(data);
                    setQuery(displayField(data));
                })
                .catch(console.error);
        } else if (typeof value === "object") {
            setSelectedItem(value);
            // Handle custom create objects specially
            if (value._customCreate) {
                setQuery(value.name || "");
            } else {
                setQuery(displayField(value));
            }
        }
    }, [value, getDetailFn, displayField]);

    // 📥 Fetch all items on mount (if fetchAllFn is provided)
    useEffect(() => {
        if (!fetchAllFn) return;

        setLoading(true);
        fetchAllFn()
            .then((data) => {
                setAllItems(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setLoading(false);
            });
    }, [fetchAllFn]);

    // 🔍 Search suggestions
    useEffect(() => {
        // If we have all items cached, use client-side filtering
        if (allItems && query.length < 2) {
            setResults(allItems);
            setHighlightedIndex(allItems.length ? 0 : -1);
            return;
        }

        // Client-side filtering for short queries when all items are available
        if (allItems && query.length >= 1) {
            const lowerQuery = query.toLowerCase();
            const filtered = allItems.filter((item) => {
                const displayText = displayField(item).toLowerCase();
                return displayText.includes(lowerQuery);
            });
            setResults(filtered);
            setHighlightedIndex(filtered.length ? 0 : -1);
            return;
        }

        // Server-side search for longer queries or when fetchAllFn is not provided
        if (query.length < 2 || !searchFn) return;

        setLoading(true);
        searchFn(query)
            .then((data) => {
                setResults(data);
                setHighlightedIndex(data.length ? 0 : -1);
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setLoading(false);
            });

    }, [query, searchFn, allItems, displayField]);

    useEffect(() => {
        if (highlightedIndex >= results.length) {
            setHighlightedIndex(results.length ? Math.max(0, results.length - 1) : -1);
        }
    }, [results, highlightedIndex]);

    const handleSelect = (item) => {
        setSelectedItem(item);
        setQuery(displayField(item));
        onSelect(item);
        setShowResults(false);
        setHighlightedIndex(-1);
    };

    return (
        <div className="mb-6">
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <div className="relative">
            <input
                type="text"
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={query}
                placeholder={placeholder}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setShowResults(true);
                    setHighlightedIndex(-1);
                }}
                onFocus={() => {
                    // Show all items on focus if fetchAllFn is provided (picklist behavior)
                    if (fetchAllFn && allItems) {
                        setShowResults(true);
                        if (query.length === 0) {
                            setResults(allItems);
                            setHighlightedIndex(allItems.length ? 0 : -1);
                        }
                    }
                }}
                onKeyDown={(e) => {
                    if (!showResults) {
                        if (e.key === 'ArrowDown' && results.length) {
                            setShowResults(true);
                            setHighlightedIndex(0);
                            e.preventDefault();
                        }
                        return;
                    }

                    if (e.key === 'ArrowDown' && results.length) {
                        e.preventDefault();
                        setHighlightedIndex((prev) => {
                            const next = prev + 1;
                            return next >= results.length ? 0 : next;
                        });
                    } else if (e.key === 'ArrowUp' && results.length) {
                        e.preventDefault();
                        setHighlightedIndex((prev) => {
                            if (prev <= 0) return results.length - 1;
                            return prev - 1;
                        });
                    } else if (e.key === 'Enter') {
                        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
                            e.preventDefault();
                            handleSelect(results[highlightedIndex]);
                        }
                    } else if (e.key === 'Escape') {
                        setShowResults(false);
                        setHighlightedIndex(-1);
                    }
                }}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
            />

            {showResults && (
                <div className="absolute top-full left-0 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto text-sm z-[9999]">
                    {loading && <div className="px-4 py-2 text-gray-500">Loading...</div>}

                    {!loading && results.length > 0 && results.map((item, index) => (
                        <div
                            key={item.id}
                            onMouseDown={() => handleSelect(item)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`px-4 py-2 cursor-pointer transition-colors border-b border-gray-100 last:border-none ${
                                highlightedIndex === index
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-white hover:bg-blue-50'
                            }`}
                        >
                            <div className="font-medium">{displayField(item)}</div>
                        </div>
                    ))}

                    {!loading && results.length === 0 && (
                        <div className="px-4 py-2 text-gray-500">
                            No results found.
                            {onCreateNewClick && (
                                <button
                                    type="button"
                                    onMouseDown={onCreateNewClick}
                                    className="ml-2 text-blue-600 underline hover:text-blue-800"
                                >
                                    Create new
                                </button>
                            )}
                            {allowCustomCreate && query && (
                                <div
                                    onMouseDown={() => onCreateNewItem(query)}
                                    className="mt-2 px-4 py-2 bg-blue-50 text-blue-800 font-medium cursor-pointer hover:bg-blue-100"
                                >
                                    Create "{query}"
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            </div>

            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        </div>
    );
}
