import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { resolveSKU, receiveDelivery, fetchInventoryLists, createInventoryItem, fetchMyDefaultLocation } from "../../api/inventory";

// ── Step 1: Intake Grid ─────────────────────────────────────────────

function IntakeGrid({ lines, setLines, onContinue }) {
    const skuRefs = useRef([]);
    const qtyRefs = useRef([]);
    const [resolving, setResolving] = useState({});
    const [creatingIdx, setCreatingIdx] = useState(null);
    const [newItemForm, setNewItemForm] = useState({ name: "", type: "PART" });
    const [creatingItem, setCreatingItem] = useState(false);

    const addRow = useCallback(() => {
        setLines((prev) => [
            ...prev,
            { sku: "", quantity: "", resolved: null, suggestions: [], error: "" },
        ]);
    }, [setLines]);

    useEffect(() => {
        if (lines.length === 0) addRow();
    }, [lines.length, addRow]);

    // Focus SKU of last added row
    useEffect(() => {
        const last = skuRefs.current[lines.length - 1];
        if (last) last.focus();
    }, [lines.length]);

    const updateLine = (idx, field, value) => {
        setLines((prev) => {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], [field]: value };
            return copy;
        });
    };

    const handleCreateItem = async (idx) => {
        const sku = lines[idx].sku.trim();
        if (!newItemForm.name.trim()) return;
        setCreatingItem(true);
        try {
            const created = await createInventoryItem({
                name: newItemForm.name.trim(),
                sku: sku,
                type: newItemForm.type,
            });
            setLines((prev) => {
                const copy = [...prev];
                copy[idx] = {
                    ...copy[idx],
                    resolved: {
                        id: created.id,
                        name: created.name,
                        sku: created.sku,
                        quantity_unit: created.quantity_unit,
                        type: created.type,
                        category_id: created.category || null,
                        category_name: created.category_name || null,
                    },
                    suggestions: [],
                    error: "",
                };
                return copy;
            });
            setCreatingIdx(null);
            setNewItemForm({ name: "", type: "PART" });
        } catch (err) {
            const detail = err?.response?.data;
            const msg = detail
                ? typeof detail === "object"
                    ? Object.values(detail).flat().join(", ")
                    : String(detail)
                : "Failed to create item";
            setLines((prev) => {
                const copy = [...prev];
                copy[idx] = { ...copy[idx], error: msg };
                return copy;
            });
        } finally {
            setCreatingItem(false);
        }
    };

    const handleSKUBlur = async (idx) => {
        const sku = lines[idx].sku.trim();
        if (!sku) return;

        // Check for duplicate SKU — merge qty
        const dupeIdx = lines.findIndex(
            (l, i) => i !== idx && l.sku.trim().toLowerCase() === sku.toLowerCase() && l.resolved
        );
        if (dupeIdx !== -1) {
            setLines((prev) => {
                const copy = [...prev];
                const existingQty = parseInt(copy[dupeIdx].quantity, 10) || 0;
                const newQty = parseInt(copy[idx].quantity, 10) || 1;
                copy[dupeIdx] = { ...copy[dupeIdx], quantity: String(existingQty + newQty) };
                copy.splice(idx, 1);
                return copy;
            });
            return;
        }

        setResolving((r) => ({ ...r, [idx]: true }));
        try {
            const data = await resolveSKU(sku);
            updateLine(idx, "resolved", data.found ? data.inventory_item : null);
            updateLine(idx, "suggestions", data.suggested_locations || []);
            updateLine(idx, "error", data.found ? "" : "SKU not found");
        } catch {
            updateLine(idx, "error", "Failed to resolve SKU");
        } finally {
            setResolving((r) => ({ ...r, [idx]: false }));
        }
    };

    const handleSKUKeyDown = (e, idx) => {
        if (e.key === "Enter" || e.key === "Tab") {
            if (e.key === "Enter") e.preventDefault();
            // Move to qty of same row
            qtyRefs.current[idx]?.focus();
            handleSKUBlur(idx);
        }
    };

    const handleQtyKeyDown = (e, idx) => {
        if (e.key === "Enter" || e.key === "Tab") {
            if (e.key === "Enter") e.preventDefault();
            // If last row, add new row; otherwise focus next SKU
            if (idx === lines.length - 1) {
                addRow();
            } else {
                skuRefs.current[idx + 1]?.focus();
            }
        }
    };

    const removeLine = (idx) => {
        setLines((prev) => prev.filter((_, i) => i !== idx));
    };

    const validLines = lines.filter(
        (l) => l.sku.trim() && l.resolved && parseInt(l.quantity, 10) > 0
    );
    const canContinue = validLines.length > 0;

    return (
        <div>
            <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">
                    Step 1: Intake — Scan / Enter SKUs
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Enter SKU and quantity for each item. Press Enter to move between fields. Enter on last quantity adds a new row.
                </p>
            </div>

            <div className="p-6">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            <th className="px-3 py-2 w-12">#</th>
                            <th className="px-3 py-2">SKU</th>
                            <th className="px-3 py-2 w-28">Qty</th>
                            <th className="px-3 py-2">Item</th>
                            <th className="px-3 py-2 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line, idx) => (
                            <tr key={idx} className="border-t border-gray-100">
                                <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                                <td className="px-3 py-2">
                                    <input
                                        ref={(el) => (skuRefs.current[idx] = el)}
                                        type="text"
                                        value={line.sku}
                                        onChange={(e) => updateLine(idx, "sku", e.target.value)}
                                        onBlur={() => handleSKUBlur(idx)}
                                        onKeyDown={(e) => handleSKUKeyDown(e, idx)}
                                        placeholder="Enter SKU..."
                                        className={`w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                            line.error ? "border-red-300 bg-red-50" : "border-gray-200"
                                        }`}
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    <input
                                        ref={(el) => (qtyRefs.current[idx] = el)}
                                        type="number"
                                        min="1"
                                        value={line.quantity}
                                        onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                                        onKeyDown={(e) => handleQtyKeyDown(e, idx)}
                                        placeholder="Qty"
                                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </td>
                                <td className="px-3 py-2">
                                    {resolving[idx] ? (
                                        <span className="text-gray-400 text-xs">Resolving...</span>
                                    ) : line.resolved ? (
                                        <span className="text-gray-700">
                                            {line.resolved.name}
                                            <span className="text-gray-400 text-xs ml-2">
                                                ({line.resolved.quantity_unit})
                                            </span>
                                        </span>
                                    ) : line.error === "SKU not found" ? (
                                        creatingIdx === idx ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Item name *"
                                                    value={newItemForm.name}
                                                    onChange={(e) => setNewItemForm((f) => ({ ...f, name: e.target.value }))}
                                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateItem(idx); } }}
                                                    autoFocus
                                                    className="px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 w-36"
                                                />
                                                <select
                                                    value={newItemForm.type}
                                                    onChange={(e) => setNewItemForm((f) => ({ ...f, type: e.target.value }))}
                                                    className="px-2 py-1 text-xs border border-gray-200 rounded-lg"
                                                >
                                                    <option value="PART">Part</option>
                                                    <option value="CONSUMABLE">Consumable</option>
                                                    <option value="ACCESSORY">Accessory</option>
                                                </select>
                                                <button
                                                    onClick={() => handleCreateItem(idx)}
                                                    disabled={creatingItem || !newItemForm.name.trim()}
                                                    className="px-2 py-1 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                                                >
                                                    {creatingItem ? "..." : "Create"}
                                                </button>
                                                <button
                                                    onClick={() => { setCreatingIdx(null); setNewItemForm({ name: "", type: "PART" }); }}
                                                    className="text-gray-400 hover:text-gray-600 text-xs"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-red-500 text-xs">
                                                SKU not found{" "}
                                                <button
                                                    onClick={() => { setCreatingIdx(idx); setNewItemForm({ name: "", type: "PART" }); }}
                                                    className="ml-1 text-blue-600 hover:text-blue-800 underline"
                                                >
                                                    Create new
                                                </button>
                                            </span>
                                        )
                                    ) : line.error ? (
                                        <span className="text-red-500 text-xs">{line.error}</span>
                                    ) : null}
                                </td>
                                <td className="px-3 py-2">
                                    {lines.length > 1 && (
                                        <button
                                            onClick={() => removeLine(idx)}
                                            className="text-gray-400 hover:text-red-500"
                                            title="Remove"
                                        >
                                            &times;
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="mt-4 flex items-center justify-between">
                    <button
                        onClick={addRow}
                        className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                        + Add Row
                    </button>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">
                            {validLines.length} valid line{validLines.length !== 1 ? "s" : ""}
                        </span>
                        <button
                            onClick={onContinue}
                            disabled={!canContinue}
                            className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Continue to Storage Assignment
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Step 2: Storage Assignment ──────────────────────────────────────

function StorageAssignment({ lines, setLines, locations, defaultLocationId, onBack, onFinalize, saving }) {
    const [globalLocationId, setGlobalLocationId] = useState(defaultLocationId || "");

    // On mount / when defaultLocationId arrives, pre-fill lines that have no location
    useEffect(() => {
        if (!globalLocationId) return;
        setLines((prev) => prev.map((l) =>
            l.inventory_list_id ? l : { ...l, inventory_list_id: String(globalLocationId) }
        ));
    }, [globalLocationId, setLines]);

    const handleGlobalLocationChange = (newLocId) => {
        setGlobalLocationId(newLocId);
        if (!newLocId) return;
        // Apply to all lines that don't already have a location set,
        // or where location matches the previous global (user hasn't manually changed it)
        setLines((prev) => prev.map((l) =>
            !l.inventory_list_id || l.inventory_list_id === String(globalLocationId)
                ? { ...l, inventory_list_id: String(newLocId) }
                : l
        ));
    };

    // Group by category
    const grouped = useMemo(() => {
        const groups = {};
        lines.forEach((line, idx) => {
            const cat = line.resolved?.category_name || "Uncategorized";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ ...line, _idx: idx });
        });
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [lines]);

    const updateLine = (idx, field, value) => {
        setLines((prev) => {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], [field]: value };
            return copy;
        });
    };

    const applySuggestion = (idx, suggestion) => {
        setLines((prev) => {
            const copy = [...prev];
            copy[idx] = {
                ...copy[idx],
                inventory_list_id: String(suggestion.inventory_list_id),
                rack: suggestion.rack || "",
                shelf_slot: suggestion.shelf_slot || "",
            };
            return copy;
        });
    };

    const applyToGroup = (categoryLines, field, value) => {
        setLines((prev) => {
            const copy = [...prev];
            categoryLines.forEach((cl) => {
                copy[cl._idx] = { ...copy[cl._idx], [field]: value };
            });
            return copy;
        });
    };

    const allValid = lines.every((l) => l.inventory_list_id);

    return (
        <div>
            <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">
                    Step 2: Storage Assignment
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Assign each item to a location, rack, and shelf. Use suggestion chips or bulk-apply per category.
                </p>
            </div>

            <div className="p-6 space-y-6">
                {/* Global default location picker */}
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="text-sm font-medium text-blue-800 whitespace-nowrap">
                        Default location for all items:
                    </label>
                    <select
                        value={globalLocationId}
                        onChange={(e) => handleGlobalLocationChange(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="">Select location...</option>
                        {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                    </select>
                    <span className="text-xs text-blue-600">
                        Applied to items without a specific location. Override per-item below.
                    </span>
                </div>

                {grouped.map(([category, catLines]) => (
                    <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Category header with bulk actions */}
                        <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700">
                                {category}
                                <span className="text-gray-400 font-normal ml-2">
                                    ({catLines.length} item{catLines.length !== 1 ? "s" : ""})
                                </span>
                            </h3>
                            <div className="flex items-center gap-2">
                                <select
                                    onChange={(e) => {
                                        if (e.target.value) applyToGroup(catLines, "inventory_list_id", e.target.value);
                                    }}
                                    defaultValue=""
                                    className="px-2 py-1 text-xs border border-gray-200 rounded-lg"
                                >
                                    <option value="">Bulk: Set location...</option>
                                    {locations.map((loc) => (
                                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                                    ))}
                                </select>
                                <input
                                    placeholder="Bulk rack"
                                    onBlur={(e) => {
                                        if (e.target.value) applyToGroup(catLines, "rack", e.target.value);
                                    }}
                                    className="px-2 py-1 text-xs border border-gray-200 rounded-lg w-20"
                                />
                                <input
                                    placeholder="Bulk shelf"
                                    onBlur={(e) => {
                                        if (e.target.value) applyToGroup(catLines, "shelf_slot", e.target.value);
                                    }}
                                    className="px-2 py-1 text-xs border border-gray-200 rounded-lg w-20"
                                />
                            </div>
                        </div>

                        {/* Line items */}
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                    <th className="px-4 py-2">Item</th>
                                    <th className="px-4 py-2 w-20">Qty</th>
                                    <th className="px-4 py-2">Location</th>
                                    <th className="px-4 py-2 w-24">Rack</th>
                                    <th className="px-4 py-2 w-24">Shelf</th>
                                    <th className="px-4 py-2 w-24">Unit Cost</th>
                                    <th className="px-4 py-2">Suggestions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {catLines.map((line) => (
                                    <tr key={line._idx} className="border-t border-gray-50 hover:bg-blue-50/30">
                                        <td className="px-4 py-2">
                                            <div className="font-medium text-gray-900">{line.resolved?.name}</div>
                                            <div className="text-xs text-gray-400">{line.sku}</div>
                                        </td>
                                        <td className="px-4 py-2 text-gray-700">
                                            {line.quantity} {line.resolved?.quantity_unit}
                                        </td>
                                        <td className="px-4 py-2">
                                            <select
                                                value={line.inventory_list_id || ""}
                                                onChange={(e) => updateLine(line._idx, "inventory_list_id", e.target.value)}
                                                className={`w-full px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                                    !line.inventory_list_id ? "border-orange-300 bg-orange-50" : "border-gray-200"
                                                }`}
                                            >
                                                <option value="">Select location *</option>
                                                {locations.map((loc) => (
                                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                value={line.rack || ""}
                                                onChange={(e) => updateLine(line._idx, "rack", e.target.value)}
                                                placeholder="Rack"
                                                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="text"
                                                value={line.shelf_slot || ""}
                                                onChange={(e) => updateLine(line._idx, "shelf_slot", e.target.value)}
                                                placeholder="Shelf"
                                                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={line.unit_cost || ""}
                                                onChange={(e) => updateLine(line._idx, "unit_cost", e.target.value)}
                                                placeholder="0.00"
                                                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="flex flex-wrap gap-1">
                                                {line.suggestions?.map((s, si) => (
                                                    <button
                                                        key={si}
                                                        onClick={() => applySuggestion(line._idx, s)}
                                                        className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                                        title={`Stock: ${s.current_quantity}`}
                                                    >
                                                        {s.inventory_list_name}
                                                        {s.rack ? ` / ${s.rack}` : ""}
                                                        {s.shelf_slot ? `-${s.shelf_slot}` : ""}
                                                    </button>
                                                ))}
                                                {(!line.suggestions || line.suggestions.length === 0) && (
                                                    <span className="text-xs text-gray-400">No history</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <button
                        onClick={onBack}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                    >
                        Back to Intake
                    </button>
                    <button
                        onClick={onFinalize}
                        disabled={!allValid || saving}
                        className="px-6 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Receiving..." : `Receive ${lines.length} Item${lines.length !== 1 ? "s" : ""}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Component ──────────────────────────────────────────────────

export default function ReceiveDelivery() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [lines, setLines] = useState([]);
    const [locations, setLocations] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);
    const [defaultLocationId, setDefaultLocationId] = useState("");

    useEffect(() => {
        fetchInventoryLists().then((data) => {
            const list = Array.isArray(data) ? data : data?.results || [];
            setLocations(list);
        });
        fetchMyDefaultLocation().then((data) => {
            if (data?.inventory_list_id) {
                setDefaultLocationId(String(data.inventory_list_id));
            }
        }).catch(() => {});
    }, []);

    const handleContinue = () => {
        // Filter to only valid lines and prepare step 2 fields
        const valid = lines
            .filter((l) => l.sku.trim() && l.resolved && parseInt(l.quantity, 10) > 0)
            .map((l) => ({
                ...l,
                inventory_list_id: l.inventory_list_id || "",
                rack: l.rack || "",
                shelf_slot: l.shelf_slot || "",
                unit_cost: l.unit_cost || "",
            }));
        setLines(valid);
        setStep(2);
        setError("");
    };

    const handleFinalize = async () => {
        setSaving(true);
        setError("");
        try {
            const payload = lines.map((l) => ({
                sku: l.sku.trim(),
                quantity: parseInt(l.quantity, 10),
                inventory_list_id: parseInt(l.inventory_list_id, 10),
                rack: l.rack || "",
                shelf_slot: l.shelf_slot || "",
                unit_cost: l.unit_cost || "0",
            }));
            const res = await receiveDelivery(payload);
            setResult(res);
            setStep(3);
        } catch (err) {
            const detail = err?.response?.data;
            if (detail?.errors) {
                const msgs = detail.errors.map(
                    (e) => `Line ${e.line + 1} (${e.sku}): ${e.errors.join(", ")}`
                );
                setError(msgs.join("\n"));
            } else if (typeof detail?.detail === "string") {
                setError(detail.detail);
            } else {
                setError("Failed to receive delivery.");
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
                    <h1 className="text-xl font-semibold text-gray-800">Receive Delivery</h1>
                    <div className="flex items-center gap-4 mt-1">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="flex items-center gap-1">
                                <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                        step === s
                                            ? "bg-blue-600 text-white"
                                            : step > s
                                            ? "bg-green-500 text-white"
                                            : "bg-gray-200 text-gray-500"
                                    }`}
                                >
                                    {step > s ? "\u2713" : s}
                                </div>
                                <span className={`text-xs ${step === s ? "text-gray-700 font-medium" : "text-gray-400"}`}>
                                    {s === 1 ? "Intake" : s === 2 ? "Storage" : "Done"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <button
                    onClick={() => navigate("/inventory")}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                >
                    Cancel
                </button>
            </div>

            {error && (
                <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
                    {error}
                </div>
            )}

            {step === 1 && (
                <IntakeGrid
                    lines={lines}
                    setLines={setLines}
                    onContinue={handleContinue}
                />
            )}

            {step === 2 && (
                <StorageAssignment
                    lines={lines}
                    setLines={setLines}
                    locations={locations}
                    defaultLocationId={defaultLocationId}
                    onBack={() => setStep(1)}
                    onFinalize={handleFinalize}
                    saving={saving}
                />
            )}

            {step === 3 && result && (
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800 mb-2">Delivery Received</h2>
                    <p className="text-gray-600">
                        {result.created_transactions_count} transaction{result.created_transactions_count !== 1 ? "s" : ""} created,{" "}
                        {result.updated_balances_count} balance{result.updated_balances_count !== 1 ? "s" : ""} updated.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <button
                            onClick={() => {
                                setStep(1);
                                setLines([]);
                                setResult(null);
                            }}
                            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                            Receive Another
                        </button>
                        <button
                            onClick={() => navigate("/inventory")}
                            className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                        >
                            Back to Inventory
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
