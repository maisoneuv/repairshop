import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchCashRegisters } from "../../api/cashRegisters";
import apiClient from "../../api/apiClient";
import { getShopSearchPath } from "../../api/autocompleteApi";

const COLUMNS = [
  { key: "name", label: "Register" },
  { key: "shop_name", label: "Shop" },
  { key: "default_owner_name", label: "Default Owner" },
  { key: "current_balance", label: "Balance" },
  { key: "is_active", label: "Status" },
];

export default function CashRegisterList() {
  const [registers, setRegisters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  // Filter state
  const [shopFilter, setShopFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("true");
  const [shopOptions, setShopOptions] = useState([]);

  useEffect(() => {
    const loadShops = async () => {
      try {
        const res = await apiClient.get(getShopSearchPath(""));
        const shops = res.data?.results || res.data || [];
        setShopOptions(Array.isArray(shops) ? shops : []);
      } catch (err) {
        console.error("Failed to load shops:", err);
      }
    };
    loadShops();
  }, []);

  const loadRegisters = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (shopFilter) params.shop = shopFilter;
      if (activeFilter !== "all") params.is_active = activeFilter;
      const data = await fetchCashRegisters(params);
      setRegisters(Array.isArray(data) ? data : data?.results || []);
    } catch (err) {
      setError(err.message || "Failed to load registers");
    } finally {
      setLoading(false);
    }
  }, [shopFilter, activeFilter]);

  useEffect(() => {
    loadRegisters();
  }, [loadRegisters]);

  const sortedRegisters = useMemo(() => {
    const data = [...registers];
    const direction = sortDirection === "asc" ? 1 : -1;
    data.sort((a, b) => {
      let aVal = a[sortField] ?? "";
      let bVal = b[sortField] ?? "";
      if (sortField === "current_balance") {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = (bVal || "").toLowerCase();
      }
      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });
    return data;
  }, [registers, sortField, sortDirection]);

  const handleSort = (column) => {
    if (sortField === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(column);
      setSortDirection("asc");
    }
  };

  const formatCurrency = (amount) => {
    if (amount == null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "PLN",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Cash Registers</h1>
          <p className="text-sm text-gray-500">Manage registers and track balances</p>
        </div>
        <Link
          to="/cash-registers/new"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
        >
          New Register
        </Link>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-4 bg-gray-50">
        <div className="flex items-center gap-2">
          <label htmlFor="shop-filter" className="text-sm font-medium text-gray-600">
            Shop:
          </label>
          <select
            id="shop-filter"
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Shops</option>
            {shopOptions.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="active-filter" className="text-sm font-medium text-gray-600">
            Status:
          </label>
          <select
            id="active-filter"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

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
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer"
                    onClick={() => handleSort(column.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.label}
                      {sortField === column.key && (
                        <svg
                          className={`h-3 w-3 ${sortDirection === "asc" ? "transform rotate-180" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M6 8l4 4 4-4" />
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
                    Loading registers...
                  </td>
                </tr>
              ) : sortedRegisters.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-sm text-gray-500">
                    No registers found.
                  </td>
                </tr>
              ) : (
                sortedRegisters.map((reg) => (
                  <tr key={reg.id} className="hover:bg-blue-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">
                      <Link to={`/cash-registers/${reg.id}`} className="hover:underline">
                        {reg.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{reg.shop_name || "-"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{reg.default_owner_name || "-"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {formatCurrency(reg.current_balance)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          reg.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {reg.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
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
