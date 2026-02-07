import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  fetchCashRegister,
  fetchCashTransactions,
  updateCashRegister,
} from "../../api/cashRegisters";
import CashTransactionForm from "./CashTransactionForm";
import CashTransferModal from "./CashTransferModal";

const TRANSACTION_TYPE_LABELS = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  adjustment: "Adjustment",
};

const TRANSACTION_TYPE_COLORS = {
  deposit: "bg-green-100 text-green-700",
  withdrawal: "bg-red-100 text-red-700",
  transfer_in: "bg-blue-100 text-blue-700",
  transfer_out: "bg-orange-100 text-orange-700",
  adjustment: "bg-yellow-100 text-yellow-700",
};

export default function CashRegisterDetail() {
  const { id } = useParams();
  const [register, setRegister] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [regData, txnData] = await Promise.all([
        fetchCashRegister(id),
        fetchCashTransactions({ register: id }),
      ]);
      setRegister(regData);
      setTransactions(Array.isArray(txnData) ? txnData : txnData?.results || []);
    } catch (err) {
      setError(err.message || "Failed to load register");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleActive = async () => {
    if (!register) return;
    try {
      const updated = await updateCashRegister(id, { is_active: !register.is_active });
      setRegister(updated);
    } catch (err) {
      setError(err.message || "Failed to update register");
    }
  };

  const handleTransactionCreated = () => {
    setShowTransactionForm(false);
    loadData();
  };

  const handleTransferCompleted = () => {
    setShowTransferModal(false);
    loadData();
  };

  const formatCurrency = (amount, currency = "PLN") => {
    if (amount == null) return "-";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${parseFloat(amount).toFixed(2)} ${currency}`;
    }
  };

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleString();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-10 text-center text-gray-500">
        Loading register...
      </div>
    );
  }

  if (error && !register) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!register) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/cash-registers" className="text-sm text-blue-600 hover:underline">
                Cash Registers
              </Link>
              <span className="text-sm text-gray-400">/</span>
              <h1 className="text-xl font-semibold text-gray-800">{register.name}</h1>
            </div>
            <p className="text-sm text-gray-500">{register.shop_name}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTransactionForm(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700"
            >
              Record Transaction
            </button>
            <button
              onClick={() => setShowTransferModal(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              Transfer
            </button>
            <button
              onClick={handleToggleActive}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                register.is_active
                  ? "border-red-200 text-red-600 hover:bg-red-50"
                  : "border-green-200 text-green-600 hover:bg-green-50"
              }`}
            >
              {register.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Current Balance</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(register.current_balance)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Opening Balance</p>
            <p className="text-lg font-medium text-gray-700">
              {formatCurrency(register.opening_balance)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Default Owner</p>
            <p className="text-lg font-medium text-gray-700">
              {register.default_owner_name || "Not assigned"}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Status</p>
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                register.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {register.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Transaction History</h2>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Work Item
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    By
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(txn.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            TRANSACTION_TYPE_COLORS[txn.transaction_type] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {TRANSACTION_TYPE_LABELS[txn.transaction_type] || txn.transaction_type}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-sm font-medium text-right ${
                          parseFloat(txn.amount) >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(txn.amount, txn.currency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-600">
                        {txn.work_item_reference ? (
                          <Link to={`/work-items/${txn.work_item}`} className="hover:underline">
                            {txn.work_item_reference}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {txn.description || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {txn.performed_by_name || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showTransactionForm && (
        <CashTransactionForm
          registerId={register.id}
          onClose={() => setShowTransactionForm(false)}
          onSuccess={handleTransactionCreated}
        />
      )}

      {showTransferModal && (
        <CashTransferModal
          register={register}
          onClose={() => setShowTransferModal(false)}
          onSuccess={handleTransferCompleted}
        />
      )}
    </div>
  );
}
