import { useEffect, useState, useCallback } from "react";
import {
    fetchWorkItemParts,
    consumePart,
    returnPart,
    searchInventoryItems,
    fetchInventoryItem,
    fetchInventoryBalances,
} from "../../api/inventory";
import AutocompleteInput from "../../components/AutocompleteInput";

export default function WorkItemInventoryTab({ workItemId }) {
    const [parts, setParts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Add part form
    const [showForm, setShowForm] = useState(false);
    const [selectedItemObj, setSelectedItemObj] = useState(null);
    const [selectedItem, setSelectedItem] = useState("");
    const [availableLocations, setAvailableLocations] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [saving, setSaving] = useState(false);
    const [availableQty, setAvailableQty] = useState(null);

    const searchItems = useCallback((query) => searchInventoryItems(query), []);
    const getItemDetail = useCallback((id) => fetchInventoryItem(id), []);

    const loadParts = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await fetchWorkItemParts(workItemId);
            setParts(Array.isArray(data) ? data : []);
        } catch (err) {
            setError("Failed to load used parts");
        } finally {
            setLoading(false);
        }
    }, [workItemId]);

    useEffect(() => {
        loadParts();
    }, [loadParts]);

    // When an item is selected, load locations that have stock for it
    useEffect(() => {
        if (!selectedItem) {
            setAvailableLocations([]);
            setSelectedLocation("");
            setAvailableQty(null);
            return;
        }
        fetchInventoryBalances({ inventory_item: selectedItem }).then((data) => {
            const balances = Array.isArray(data) ? data : data?.results || [];
            const withStock = balances.filter((b) => b.current_quantity > 0);
            setAvailableLocations(withStock);
            setSelectedLocation("");
            setAvailableQty(null);
        });
    }, [selectedItem]);

    // When location is selected, show available quantity
    useEffect(() => {
        if (!selectedLocation) {
            setAvailableQty(null);
            return;
        }
        const loc = availableLocations.find((b) => String(b.inventory_list) === String(selectedLocation));
        setAvailableQty(loc ? loc.current_quantity : 0);
    }, [selectedLocation, availableLocations]);

    const handleConsume = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            await consumePart(workItemId, {
                inventory_item: parseInt(selectedItem, 10),
                inventory_list: parseInt(selectedLocation, 10),
                quantity: parseInt(quantity, 10),
            });
            setSelectedItem("");
            setSelectedItemObj(null);
            setSelectedLocation("");
            setQuantity(1);
            setShowForm(false);
            loadParts();
        } catch (err) {
            const detail = err?.response?.data || err;
            if (typeof detail === "object") {
                const msg = Object.values(detail).flat().join(", ");
                setError(msg || "Failed to consume part");
            } else {
                setError("Failed to consume part");
            }
        } finally {
            setSaving(false);
        }
    };

    const handleReturn = async (transactionId) => {
        setError("");
        try {
            await returnPart(workItemId, transactionId);
            loadParts();
        } catch {
            setError("Failed to return part");
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">Parts Used</h2>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                    {showForm ? "Cancel" : "Add Part"}
                </button>
            </div>

            {/* Add part form */}
            {showForm && (
                <form onSubmit={handleConsume} className="px-6 py-4 border-b border-gray-100 bg-blue-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                        <AutocompleteInput
                            searchFn={searchItems}
                            getDetailFn={getItemDetail}
                            value={selectedItemObj}
                            onSelect={(item) => {
                                setSelectedItemObj(item);
                                setSelectedItem(String(item.id));
                            }}
                            displayField={(item) => item.name + (item.sku ? ` (${item.sku})` : "")}
                            placeholder="Search part *"
                            className=""
                            inputClassName="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <select
                            value={selectedLocation}
                            onChange={(e) => setSelectedLocation(e.target.value)}
                            required
                            disabled={!selectedItem || availableLocations.length === 0}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            <option value="">
                                {!selectedItem
                                    ? "Select a part first"
                                    : availableLocations.length === 0
                                        ? "No stock available"
                                        : "Select location *"}
                            </option>
                            {availableLocations.map((bal) => (
                                <option key={bal.inventory_list} value={bal.inventory_list}>
                                    {bal.location_name} (qty: {bal.current_quantity})
                                </option>
                            ))}
                        </select>

                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min="1"
                                max={availableQty || undefined}
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                required
                                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Qty *"
                            />
                            {availableQty !== null && (
                                <span className="text-xs text-gray-500 whitespace-nowrap">
                                    / {availableQty}
                                </span>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={saving || !selectedItem || !selectedLocation || !quantity}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? "Adding..." : "Use Part"}
                        </button>
                    </div>
                </form>
            )}

            {/* Error */}
            {error && (
                <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Parts table */}
            <div className="p-6">
                {loading ? (
                    <p className="text-center text-sm text-gray-500 py-6">Loading parts...</p>
                ) : parts.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-gray-400 mb-3">
                            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M12 11V7" />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-500">No parts used yet. Click "Add Part" to consume inventory.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Part</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Location</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Qty</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {parts.map((txn) => (
                                    <tr key={txn.id} className="hover:bg-blue-50/50">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{txn.item_name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{txn.location_name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{Math.abs(txn.quantity)}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {new Date(txn.transaction_date).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right">
                                            <button
                                                onClick={() => handleReturn(txn.id)}
                                                className="text-red-600 hover:text-red-800 text-xs font-medium"
                                            >
                                                Return
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
