import { useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";
import apiClient from "../api/apiClient";
import { getCSRFToken } from "../utils/csrf";

export default function ProfilePage() {
    const { user, employee, currentTenant } = useUser();
    const [pin, setPin] = useState("");
    const [pinConfirm, setPinConfirm] = useState("");
    const [pinError, setPinError] = useState("");
    const [pinSuccess, setPinSuccess] = useState("");
    const [pinSubmitting, setPinSubmitting] = useState(false);
    const [hasPin, setHasPin] = useState(user?.has_pin ?? false);

    const handleSetPin = async (e) => {
        e.preventDefault();
        setPinError("");
        setPinSuccess("");

        if (!/^\d{4,6}$/.test(pin)) {
            setPinError("PIN must be 4–6 digits.");
            return;
        }
        if (pin !== pinConfirm) {
            setPinError("PINs do not match.");
            return;
        }

        setPinSubmitting(true);
        try {
            await apiClient.post("/api/core/users/me/pin/", { pin }, {
                headers: { "X-CSRFToken": getCSRFToken() },
                withCredentials: true,
            });
            setHasPin(true);
            setPinSuccess("PIN saved.");
            setPin("");
            setPinConfirm("");
        } catch {
            setPinError("Failed to save PIN. Please try again.");
        } finally {
            setPinSubmitting(false);
        }
    };

    const handleClearPin = async () => {
        setPinError("");
        setPinSuccess("");
        setPinSubmitting(true);
        try {
            await apiClient.post("/api/core/users/me/pin/", { pin: "" }, {
                headers: { "X-CSRFToken": getCSRFToken() },
                withCredentials: true,
            });
            setHasPin(false);
            setPinSuccess("PIN removed.");
        } catch {
            setPinError("Failed to remove PIN. Please try again.");
        } finally {
            setPinSubmitting(false);
        }
    };

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-600">Not logged in</p>
            </div>
        );
    }

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.name;

    return (
        <div className="max-w-2xl mx-auto">
            {/* Back Link */}
            <div className="mb-4">
                <Link
                    to="/"
                    className="text-gray-600 hover:text-gray-900 transition-colors text-sm flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Home
                </Link>
            </div>

            {/* Profile Card */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h1 className="text-xl font-bold text-gray-900 mb-6">My Profile</h1>

                <div className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
                        <p className="text-gray-900 font-medium">
                            {fullName || <span className="text-gray-500">Not set</span>}
                        </p>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                        <p className="text-gray-900">{user.email}</p>
                    </div>

                    {/* Phone */}
                    {user.phone_number && (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
                            <p className="text-gray-900">{user.phone_number}</p>
                        </div>
                    )}

                    {/* Company */}
                    {user.company && (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Company</label>
                            <p className="text-gray-900">{user.company}</p>
                        </div>
                    )}

                    {/* Tenant */}
                    {currentTenant?.name && (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Organization</label>
                            <p className="text-gray-900">{currentTenant.name}</p>
                        </div>
                    )}

                    {/* Employee Info */}
                    {employee && (
                        <div className="border-t border-gray-200 pt-4 mt-4">
                            <h2 className="text-sm font-semibold text-gray-900 mb-3">Employee Details</h2>

                            {employee.role && (
                                <div className="mb-3">
                                    <label className="block text-sm font-medium text-gray-600 mb-1">Role</label>
                                    <p className="text-gray-900">{employee.role}</p>
                                </div>
                            )}

                            {employee.location_name && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">Location</label>
                                    <p className="text-gray-900">{employee.location_name}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Quick-login PIN */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                        <h2 className="text-sm font-semibold text-gray-900 mb-1">Quick-login PIN</h2>
                        <p className="text-xs text-gray-500 mb-3">
                            Set a 4–6 digit PIN to unlock the screen quickly on shared devices.
                        </p>

                        {pinSuccess && (
                            <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                                {pinSuccess}
                            </div>
                        )}
                        {pinError && (
                            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                                {pinError}
                            </div>
                        )}

                        <form onSubmit={handleSetPin} className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">
                                    {hasPin ? "New PIN" : "PIN"}
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    pattern="\d{4,6}"
                                    maxLength={6}
                                    value={pin}
                                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                    placeholder="4–6 digits"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-1">Confirm PIN</label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    pattern="\d{4,6}"
                                    maxLength={6}
                                    value={pinConfirm}
                                    onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                    placeholder="Repeat PIN"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={pinSubmitting}
                                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                    {hasPin ? "Update PIN" : "Set PIN"}
                                </button>
                                {hasPin && (
                                    <button
                                        type="button"
                                        onClick={handleClearPin}
                                        disabled={pinSubmitting}
                                        className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
