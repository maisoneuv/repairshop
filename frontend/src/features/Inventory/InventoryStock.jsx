import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    fetchInventoryBalances,
    fetchInventoryLists,
    searchInventoryItems,
    fetchInventoryItem,
    createInventoryItem,
    adjustStock,
} from "../../api/inventory";
import AutocompleteInput from "../../components/AutocompleteInput";

const COLUMNS = [
    { key: "item_name", label: "Part" },
    { key: "item_sku", label: "SKU" },
    { key: "location_name", label: "Location" },
    { key: "current_quantity", label: "Qty" },
    { key: "rack", label: "Rack" },
    { key: "shelf_slot", label: "Shelf" },
];

export default function InventoryStock() {
    const navigate = useNavigate();
    const [balances, setBalances] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sortField, setSortField] = useState("item_name");
    const [sortDirection, setSortDirection] = useState("asc");
    const [locationFilter, setLocationFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [locations, setLocations] = useState([]);

    // New item form
    const [showNewItemForm, setShowNewItemForm] = useState(false);
    const [newItem, setNewItem] = useState({ name: "", sku: "", type: "PART" });
    const [newItemStock, setNewItemStock] = useState({ inventory_list: "", quantity: "", rack: "", shelf_slot: "" });
    const [savingNewItem, setSavingNewItem] = useState(false);

    // Adjustment form
    const [showAdjustForm, setShowAdjustForm] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [adjustData, setAdjustData] = useState({
        inventory_item: "", inventory_list: "", quantity: "", rack: "", shelf_slot: "",
    });
    const [saving, setSaving] = useState(false);

    const searchItems = useCallback((query) => searchInventoryItems(query), []);
    const getItemDetail = useCallback((id) => fetchInventoryItem(id), []);

    useEffect(() => {
        fetchInventoryLists().then((data) => {
            setLocations(Array.isArray(data) ? data : data?.results || []);
        });
    }, []);

    const loadBalances = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = {};
            if (locationFilter) params.inventory_list = locationFilter;
            const data = await fetchInventoryBalances(params);
            setBalances(Array.isArray(data) ? data : data?.results || []);
        } catch (err) {
            setError(err.message || "Failed to load stock levels");
        } finally {
            setLoading(false);
        }
    }, [locationFilter]);

    useEffect(() => {
        loadBalances();
    }, [loadBalances]);

    const sortedBalances = useMemo(() => {
        let data = [...balances];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            data = data.filter((b) =>
                (b.item_name || "").toLowerCase().includes(q) ||
                (b.item_sku || "").toLowerCase().includes(q) ||
                (b.rack || "").toLowerCase().includes(q) ||
                (b.shelf_slot || "").toLowerCase().includes(q)
            );
        }
        const dir = sortDirection === "asc" ? 1 : -1;
        data.sort((a, b) => {
            let aVal = a[sortField] ?? "";
            let bVal = b[sortField] ?? "";
            if (sortField === "current_quantity") {
                aVal = Number(aVal) || 0;
                bVal = Number(bVal) || 0;
            } else if (typeof aVal === "string") {
                aVal = aVal.toLowerCase();
                bVal = (bVal || "").toLowerCase();
            }
            if (aVal < bVal) return -1 * dir;
            if (aVal > bVal) return 1 * dir;
            return 0;
        });
        return data;
    }, [balances, sortField, sortDirection, searchQuery]);

    const handleSort = (column) => {
        if (sortField === column) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(column);
            setSortDirection("asc");
        }
    };

    const handleAdjust = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            await adjustStock({
                ...adjustData,
                quantity: parseInt(adjustData.quantity, 10),
            });
            setAdjustData({ inventory_item: "", inventory_list: "", quantity: "", rack: "", shelf_slot: "" });
            setSelectedItem(null);
            setShowAdjustForm(false);
            loadBalances();
        } catch (err) {
            const detail = err?.response?.data?.detail || err?.detail || "Failed to adjust stock";
            setError(typeof detail === "string" ? detail : JSON.stringify(detail));
        } finally {
            setSaving(false);
        }
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        setSavingNewItem(true);
        setError("");
        try {
            const created = await createInventoryItem(newItem);
            if (newItemStock.inventory_list && newItemStock.quantity) {
                await adjustStock({
                    inventory_item: created.id,
                    inventory_list: parseInt(newItemStock.inventory_list, 10),
                    quantity: parseInt(newItemStock.quantity, 10),
                    rack: newItemStock.rack,
                    shelf_slot: newItemStock.shelf_slot,
                });
            }
            setNewItem({ name: "", sku: "", type: "PART" });
            setNewItemStock({ inventory_list: "", quantity: "", rack: "", shelf_slot: "" });
            setShowNewItemForm(false);
            loadBalances();
        } catch (err) {
            const detail = err?.response?.data;
            if (typeof detail === "object") {
                const msg = Object.values(detail).flat().join(", ");
                setError(msg || "Failed to create item");
            } else {
                setError("Failed to create item");
            }
        } finally {
            setSavingNewItem(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Inventory</h1>
                    <p className="text-sm text-gray-500">Parts and stock levels per location</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate("/inventory/receive")}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
                    >
                        Receive Delivery
                    </button>
                    <button
                        onClick={() => { setShowNewItemForm(!showNewItemForm); if (!showNewItemForm) setShowAdjustForm(false); }}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700"
                    >
                        {showNewItemForm ? "Cancel" : "New Item"}
                    </button>
                    <button
                        onClick={() => { setShowAdjustForm(!showAdjustForm); if (!showAdjustForm) setShowNewItemForm(false); }}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                        {showAdjustForm ? "Cancel" : "Adjust Stock"}
                    </button>
                </div>
            </div>

            {/* New item form */}
            {showNewItemForm && (
                <form onSubmit={handleAddItem} className="px-6 py-4 border-b border-gray-100 bg-green-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <input
                            type="text"
                            placeholder="Part name *"
                            value={newItem.name}
                            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                            required
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <input
                            type="text"
                            placeholder="SKU"
                            value={newItem.sku}
                            onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <select
                            value={newItem.type}
                            onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                            <option value="PART">Part</option>
                            <option value="CONSUMABLE">Consumable</option>
                            <option value="ACCESSORY">Accessory</option>
                        </select>
                        <div />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
                        <select
                            value={newItemStock.inventory_list}
                            onChange={(e) => setNewItemStock({ ...newItemStock, inventory_list: e.target.value })}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                            <option value="">Location (optional)</option>
                            {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            min="1"
                            placeholder="Initial qty"
                            value={newItemStock.quantity}
                            onChange={(e) => setNewItemStock({ ...newItemStock, quantity: e.target.value })}
                            disabled={!newItemStock.inventory_list}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        />
                        <input
                            type="text"
                            placeholder="Rack"
                            value={newItemStock.rack}
                            onChange={(e) => setNewItemStock({ ...newItemStock, rack: e.target.value })}
                            disabled={!newItemStock.inventory_list}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        />
                        <input
                            type="text"
                            placeholder="Shelf/Slot"
                            value={newItemStock.shelf_slot}
                            onChange={(e) => setNewItemStock({ ...newItemStock, shelf_slot: e.target.value })}
                            disabled={!newItemStock.inventory_list}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={savingNewItem || !newItem.name}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        >
                            {savingNewItem ? "Saving..." : "Add Item"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Optionally set a location and initial quantity to stock the part immediately.
                    </p>
                </form>
            )}

            {/* Adjustment form */}
            {showAdjustForm && (
                <form onSubmit={handleAdjust} className="px-6 py-4 border-b border-gray-100 bg-blue-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-start">
                        <AutocompleteInput
                            searchFn={searchItems}
                            getDetailFn={getItemDetail}
                            value={selectedItem}
                            onSelect={(item) => {
                                setSelectedItem(item);
                                setAdjustData({ ...adjustData, inventory_item: item.id });
                            }}
                            displayField={(item) => item.name + (item.sku ? ` (${item.sku})` : "")}
                            placeholder="Search part *"
                            className=""
                            inputClassName="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                            value={adjustData.inventory_list}
                            onChange={(e) => setAdjustData({ ...adjustData, inventory_list: e.target.value })}
                            required
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Select location *</option>
                            {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            placeholder="Qty (+/-) *"
                            value={adjustData.quantity}
                            onChange={(e) => setAdjustData({ ...adjustData, quantity: e.target.value })}
                            required
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            type="text"
                            placeholder="Rack"
                            value={adjustData.rack}
                            onChange={(e) => setAdjustData({ ...adjustData, rack: e.target.value })}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            type="text"
                            placeholder="Shelf/Slot"
                            value={adjustData.shelf_slot}
                            onChange={(e) => setAdjustData({ ...adjustData, shelf_slot: e.target.value })}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Apply"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Use positive numbers to add stock, negative to remove.
                    </p>
                </form>
            )}

            {/* Filters */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-4 bg-gray-50">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">Location:</label>
                    <select
                        value={locationFilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All Locations</option>
                        {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">Search:</label>
                    <input
                        type="text"
                        placeholder="Name, SKU, rack..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="p-6">
                {error && (
                    <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                {COLUMNS.map((col) => (
                                    <th
                                        key={col.key}
                                        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer"
                                        onClick={() => handleSort(col.key)}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {col.label}
                                            {sortField === col.key && (
                                                <svg className={`h-3 w-3 ${sortDirection === "asc" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            )}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-gray-500">
                                        Loading stock levels...
                                    </td>
                                </tr>
                            ) : sortedBalances.length === 0 ? (
                                <tr>
                                    <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-gray-500">
                                        No stock records found. Use "Adjust Stock" to add inventory.
                                    </td>
                                </tr>
                            ) : (
                                sortedBalances.map((bal) => (
                                    <tr key={bal.id} className="hover:bg-blue-50/50">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{bal.item_name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{bal.item_sku || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{bal.location_name}</td>
                                        <td className="px-4 py-3 text-sm font-medium">
                                            <span className={bal.current_quantity <= 0 ? "text-red-600" : "text-gray-900"}>
                                                {bal.current_quantity}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{bal.rack || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{bal.shelf_slot || "—"}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
