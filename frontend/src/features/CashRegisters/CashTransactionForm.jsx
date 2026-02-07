import { useState } from "react";
import { createCashTransaction } from "../../api/cashRegisters";

const TRANSACTION_TYPES = [
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "adjustment", label: "Adjustment" },
];

export default function CashTransactionForm({ registerId, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    transaction_type: "deposit",
    amount: "",
    description: "",
    work_item: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const amount = parseFloat(formData.amount);
    if (!amount || amount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      await createCashTransaction({
        register: registerId,
        transaction_type: formData.transaction_type,
        amount,
        description: formData.description,
        work_item: formData.work_item ? parseInt(formData.work_item, 10) : null,
      });
      onSuccess();
    } catch (err) {
      const detail =
        typeof err === "object" && err !== null
          ? err.detail || err.non_field_errors?.[0] || JSON.stringify(err)
          : err?.message || "Failed to create transaction";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Record Transaction</h2>
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

          <div>
            <label htmlFor="txn-type" className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              id="txn-type"
              value={formData.transaction_type}
              onChange={(e) => handleChange("transaction_type", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="txn-amount" className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              id="txn-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label htmlFor="txn-workitem" className="block text-sm font-medium text-gray-700 mb-1">
              Work Item ID (optional)
            </label>
            <input
              id="txn-workitem"
              type="number"
              value={formData.work_item}
              onChange={(e) => handleChange("work_item", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Leave empty if not linked to a work item"
            />
          </div>

          <div>
            <label htmlFor="txn-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input
              id="txn-desc"
              type="text"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add a note..."
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
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
