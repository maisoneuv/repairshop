import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchInventoryItems, createInventoryItem, fetchInventoryLists, adjustStock } from "../../api/inventory";

const COLUMNS = [
    { key: "name", label: "Name" },
    { key: "sku", label: "SKU" },
    { key: "type", label: "Type" },
    { key: "category_name", label: "Category" },
    { key: "total_quantity", label: "Total Qty" },
];

const TYPE_OPTIONS = [
    { value: "", label: "All Types" },
    { value: "PART", label: "Part" },
    { value: "CONSUMABLE", label: "Consumable" },
    { value: "ACCESSORY", label: "Accessory" },
];

export default function InventoryItemList() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sortField, setSortField] = useState("name");
    const [sortDirection, setSortDirection] = useState("asc");
    const [typeFilter, setTypeFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showAddForm, setShowAddForm] = useState(false);
    const [newItem, setNewItem] = useState({ name: "", sku: "", type: "PART", description: "" });
    const [initialStock, setInitialStock] = useState({ inventory_list: "", quantity: "", rack: "", shelf_slot: "" });
    const [locations, setLocations] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchInventoryLists().then((data) => {
            setLocations(Array.isArray(data) ? data : data?.results || []);
        });
    }, []);

    const loadItems = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = {};
            if (typeFilter) params.type = typeFilter;
            if (searchQuery) params.search = searchQuery;
            const data = await fetchInventoryItems(params);
            setItems(Array.isArray(data) ? data : data?.results || []);
        } catch (err) {
            setError(err.message || "Failed to load inventory items");
        } finally {
            setLoading(false);
        }
    }, [typeFilter, searchQuery]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const sortedItems = useMemo(() => {
        const data = [...items];
        const dir = sortDirection === "asc" ? 1 : -1;
        data.sort((a, b) => {
            let aVal = a[sortField] ?? "";
            let bVal = b[sortField] ?? "";
            if (sortField === "total_quantity") {
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
    }, [items, sortField, sortDirection]);

    const handleSort = (column) => {
        if (sortField === column) {
            setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortField(column);
            setSortDirection("asc");
        }
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const created = await createInventoryItem(newItem);
            // If location and quantity provided, create initial stock
            if (initialStock.inventory_list && initialStock.quantity) {
                await adjustStock({
                    inventory_item: created.id,
                    inventory_list: parseInt(initialStock.inventory_list, 10),
                    quantity: parseInt(initialStock.quantity, 10),
                    rack: initialStock.rack,
                    shelf_slot: initialStock.shelf_slot,
                });
            }
            setNewItem({ name: "", sku: "", type: "PART", description: "" });
            setInitialStock({ inventory_list: "", quantity: "", rack: "", shelf_slot: "" });
            setShowAddForm(false);
            loadItems();
        } catch (err) {
            const detail = err?.response?.data;
            if (typeof detail === "object") {
                const msg = Object.values(detail).flat().join(", ");
                setError(msg || "Failed to create item");
            } else {
                setError("Failed to create item");
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Inventory Items</h1>
                    <p className="text-sm text-gray-500">Parts catalog for your repair shop</p>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                    {showAddForm ? "Cancel" : "New Item"}
                </button>
            </div>

            {/* Add form */}
            {showAddForm && (
                <form onSubmit={handleAddItem} className="px-6 py-4 border-b border-gray-100 bg-blue-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <input
                            type="text"
                            placeholder="Part name *"
                            value={newItem.name}
                            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                            required
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            type="text"
                            placeholder="SKU"
                            value={newItem.sku}
                            onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                            value={newItem.type}
                            onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="PART">Part</option>
                            <option value="CONSUMABLE">Consumable</option>
                            <option value="ACCESSORY">Accessory</option>
                        </select>
                        <div>{/* spacer for alignment */}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
                        <select
                            value={initialStock.inventory_list}
                            onChange={(e) => setInitialStock({ ...initialStock, inventory_list: e.target.value })}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            value={initialStock.quantity}
                            onChange={(e) => setInitialStock({ ...initialStock, quantity: e.target.value })}
                            disabled={!initialStock.inventory_list}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <input
                            type="text"
                            placeholder="Rack"
                            value={initialStock.rack}
                            onChange={(e) => setInitialStock({ ...initialStock, rack: e.target.value })}
                            disabled={!initialStock.inventory_list}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <input
                            type="text"
                            placeholder="Shelf/Slot"
                            value={initialStock.shelf_slot}
                            onChange={(e) => setInitialStock({ ...initialStock, shelf_slot: e.target.value })}
                            disabled={!initialStock.inventory_list}
                            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={saving || !newItem.name}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Add Item"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Optionally set a location and initial quantity to stock the part immediately.
                    </p>
                </form>
            )}

            {/* Filters */}
            <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-4 bg-gray-50">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">Type:</label>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-600">Search:</label>
                    <input
                        type="text"
                        placeholder="Name or SKU..."
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
                                        Loading items...
                                    </td>
                                </tr>
                            ) : sortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-gray-500">
                                        No inventory items found. Add your first part above.
                                    </td>
                                </tr>
                            ) : (
                                sortedItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-blue-50/50">
                                        <td className="px-4 py-3 text-sm font-medium text-blue-600">
                                            <Link to={`/inventory/${item.id}`} className="hover:underline">
                                                {item.name}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{item.sku || "—"}</td>
                                        <td className="px-4 py-3 text-sm">
                                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                                {item.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{item.category_name || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 font-medium">{item.total_quantity}</td>
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
