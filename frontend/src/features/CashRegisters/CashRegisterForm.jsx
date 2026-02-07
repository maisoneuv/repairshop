import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCashRegister } from "../../api/cashRegisters";
import apiClient from "../../api/apiClient";
import { getShopSearchPath, getEmployeeListPath } from "../../api/autocompleteApi";

export default function CashRegisterForm() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    shop: "",
    default_owner: "",
    opening_balance: "0.00",
  });
  const [shopOptions, setShopOptions] = useState([]);
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [shopRes, empRes] = await Promise.all([
          apiClient.get(getShopSearchPath("")),
          apiClient.get(getEmployeeListPath()),
        ]);
        const shops = shopRes.data?.results || shopRes.data || [];
        setShopOptions(Array.isArray(shops) ? shops : []);
        setEmployeeOptions(empRes.data || []);
      } catch (err) {
        console.error("Failed to load options:", err);
      }
    };
    loadOptions();
  }, []);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!formData.shop) {
      setError("Shop is required.");
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        name: formData.name.trim(),
        shop: parseInt(formData.shop, 10),
        opening_balance: parseFloat(formData.opening_balance) || 0,
      };
      if (formData.default_owner) {
        data.default_owner = parseInt(formData.default_owner, 10);
      }
      const created = await createCashRegister(data);
      navigate(`/cash-registers/${created.id}`);
    } catch (err) {
      const detail =
        typeof err === "object" && err !== null
          ? err.detail || err.name?.[0] || err.non_field_errors?.[0] || JSON.stringify(err)
          : err?.message || "Failed to create register";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-lg mx-auto">
      <div className="px-6 py-4 border-b border-gray-100">
        <h1 className="text-xl font-semibold text-gray-800">New Cash Register</h1>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="reg-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            id="reg-name"
            type="text"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g. Front Counter, Main Register"
            required
          />
        </div>

        <div>
          <label htmlFor="reg-shop" className="block text-sm font-medium text-gray-700 mb-1">
            Shop
          </label>
          <select
            id="reg-shop"
            value={formData.shop}
            onChange={(e) => handleChange("shop", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">Select shop...</option>
            {shopOptions.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reg-owner" className="block text-sm font-medium text-gray-700 mb-1">
            Default Owner (optional)
          </label>
          <select
            id="reg-owner"
            value={formData.default_owner}
            onChange={(e) => handleChange("default_owner", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">None</option>
            {employeeOptions.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reg-balance" className="block text-sm font-medium text-gray-700 mb-1">
            Opening Balance
          </label>
          <input
            id="reg-balance"
            type="number"
            step="0.01"
            min="0"
            value={formData.opening_balance}
            onChange={(e) => handleChange("opening_balance", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.00"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/cash-registers")}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Register"}
          </button>
        </div>
      </form>
    </div>
  );
}
