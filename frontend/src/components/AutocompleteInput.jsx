import { useEffect, useState } from "react";

/**
 * AutocompleteInput
 *
 * A highly flexible autocomplete input for selecting related objects via search.
 *
 * Props:
 * @param {string} [label] - The label displayed above the input.
 * @param {function} searchFn - Function that accepts a query string and returns matching items. Must return a Promise of an array.
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
                                              searchFn,
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
            setQuery(displayField(value));
        }
    }, [value, getDetailFn, displayField]);

    // 🔍 Search suggestions
    useEffect(() => {
        if (query.length < 2 || !searchFn) return;

        setLoading(true);
        searchFn(query)
            .then((data) => {
                setResults(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setLoading(false);
            });

    }, [query, searchFn]);

    const handleSelect = (item) => {
        setSelectedItem(item);
        setQuery(displayField(item));
        onSelect(item);
        setShowResults(false);
    };

    return (
        <div className="relative z-10 mb-6">
            {label && <label className="block font-semibold mb-1">{label}</label>}
            <input
                type="text"
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={query}
                placeholder={placeholder}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setShowResults(true);
                }}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
            />

            {showResults && (
                <div className="absolute top-full left-0 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto text-sm z-50">
                    {loading && <div className="px-4 py-2 text-gray-500">Loading...</div>}

                    {!loading && results.length > 0 && results.map((item) => (
                        <div
                            key={item.id}
                            onMouseDown={() => handleSelect(item)}
                            className="px-4 py-2 bg-white hover:bg-blue-100 hover:text-blue-800 cursor-pointer transition-colors border-b border-gray-100 last:border-none"
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
                                    Create “{query}”
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        </div>
    );
}
