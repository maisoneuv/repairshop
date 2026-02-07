import { useEffect, useState } from "react";
import { fetchCashRegisters, transferBetweenRegisters } from "../../api/cashRegisters";

export default function CashTransferModal({ register, onClose, onSuccess }) {
  const [registers, setRegisters] = useState([]);
  const [destinationId, setDestinationId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchCashRegisters({
          shop: register.shop,
          is_active: true,
        });
        const list = Array.isArray(data) ? data : data?.results || [];
        // Exclude current register
        setRegisters(list.filter((r) => r.id !== register.id));
      } catch (err) {
        console.error("Failed to load registers:", err);
      }
    };
    load();
  }, [register.shop, register.id]);

  const formatCurrency = (amt) => {
    if (amt == null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "PLN",
      minimumFractionDigits: 2,
    }).format(amt);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const transferAmount = parseFloat(amount);
    if (!transferAmount || transferAmount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }
    if (!destinationId) {
      setError("Please select a destination register.");
      return;
    }

    setSubmitting(true);
    try {
      await transferBetweenRegisters({
        source_register: register.id,
        destination_register: parseInt(destinationId, 10),
        amount: transferAmount,
        description,
      });
      onSuccess();
    } catch (err) {
      const detail =
        typeof err === "object" && err !== null
          ? err.detail || err.non_field_errors?.[0] || JSON.stringify(err)
          : err?.message || "Transfer failed";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Transfer Money</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">From</p>
            <p className="text-sm font-medium text-gray-800">{register.name}</p>
            <p className="text-xs text-gray-500">
              Balance: {formatCurrency(register.current_balance)}
            </p>
          </div>

          <div>
            <label htmlFor="dest-register" className="block text-sm font-medium text-gray-700 mb-1">
              To Register
            </label>
            <select
              id="dest-register"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">Select destination...</option>
              {registers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (Balance: {formatCurrency(r.current_balance)})
                </option>
              ))}
            </select>
            {registers.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                No other active registers in this shop.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="transfer-amount" className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              id="transfer-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label htmlFor="transfer-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input
              id="transfer-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Reason for transfer..."
              maxLength={255}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || registers.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Transferring..." : "Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
