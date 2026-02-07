import { useEffect, useState } from "react";
import { fetchCashRegisters } from "../../api/cashRegisters";

export default function CashRegisterSelect({
  value,
  onSelect,
  error,
  required,
  label = "Cash Register",
  placeholder = "Select register...",
  showLabel = true,
}) {
  const [registers, setRegisters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchCashRegisters({ is_active: true });
        setRegisters(Array.isArray(data) ? data : data?.results || []);
      } catch (err) {
        console.error("Failed to load registers:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const selectedId = typeof value === "object" ? value?.id : value;

  const handleChange = (e) => {
    const id = e.target.value;
    if (!id) {
      onSelect(null);
      return;
    }
    const reg = registers.find((r) => String(r.id) === id);
    onSelect(reg || { id: parseInt(id, 10) });
  };

  return (
    <div>
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <select
        value={selectedId || ""}
        onChange={handleChange}
        className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${
          error ? "border-red-300" : "border-gray-300"
        }`}
        disabled={loading}
      >
        <option value="">{loading ? "Loading..." : placeholder}</option>
        {registers.map((reg) => (
          <option key={reg.id} value={reg.id}>
            {reg.shop_name} - {reg.name}
          </option>
        ))}
      </select>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
