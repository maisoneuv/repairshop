import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/apiClient";
import { getCSRFToken } from "../utils/csrf";
import { useUser } from "../context/UserContext";

export default function SettingsPage() {
    const { user, permissions, tenantSettings, refresh, refreshSettings } = useUser();
    const isAdmin = user?.is_superuser ||
        permissions.some(p => p.permission_codename === 'manage_users');

    // --- Inactivity settings ---
    const [lockEnabled, setLockEnabled] = useState(tenantSettings.logout_on_inactivity);
    const [timeoutMinutes, setTimeoutMinutes] = useState(tenantSettings.inactivity_timeout_minutes);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState("");

    useEffect(() => {
        setLockEnabled(tenantSettings.logout_on_inactivity);
        setTimeoutMinutes(tenantSettings.inactivity_timeout_minutes);
    }, [tenantSettings]);

    const saveSetting = useCallback(async (key, value, valueType) => {
        const csrfToken = getCSRFToken();
        // Try to find existing setting first, then upsert
        try {
            const { data: list } = await apiClient.get(`/api/core/settings/?key=${key}`);
            const existing = list?.results?.find(s => !s.is_global && s.key === key) || list?.find?.(s => !s.is_global && s.key === key);
            if (existing) {
                await apiClient.patch(`/api/core/settings/${existing.id}/`, { value, value_type: valueType }, {
                    headers: { "X-CSRFToken": csrfToken },
                });
            } else {
                await apiClient.post("/api/core/settings/", { key, value, value_type: valueType }, {
                    headers: { "X-CSRFToken": csrfToken },
                });
            }
        } catch {
            throw new Error("Failed to save");
        }
    }, []);

    const handleSaveInactivity = async () => {
        setSettingsSaving(true);
        setSettingsMsg("");
        try {
            await saveSetting("logout_on_inactivity", lockEnabled, "boolean");
            await saveSetting("inactivity_timeout_minutes", Number(timeoutMinutes), "numeric");
            setSettingsMsg("Settings saved.");
            // Refresh tenant settings in context so the inactivity timer picks up the change
            await refreshSettings();
        } catch {
            setSettingsMsg("Failed to save settings.");
        } finally {
            setSettingsSaving(false);
        }
    };

    // --- Staff PIN management ---
    const [staffUsers, setStaffUsers] = useState([]);
    const [staffLoading, setStaffLoading] = useState(true);
    const [pinModal, setPinModal] = useState(null); // { user } | null
    const [adminPin, setAdminPin] = useState("");
    const [adminPinConfirm, setAdminPinConfirm] = useState("");
    const [adminPinError, setAdminPinError] = useState("");
    const [adminPinSuccess, setAdminPinSuccess] = useState("");
    const [adminPinSubmitting, setAdminPinSubmitting] = useState(false);

    const loadStaffUsers = useCallback(async () => {
        setStaffLoading(true);
        try {
            const { data } = await apiClient.get("/api/core/users/");
            const list = data?.results || data || [];
            // Superusers have tenant=null so they won't appear in the tenant user list — add them manually
            const alreadyIncluded = list.some(u => u.id === user?.id);
            setStaffUsers(alreadyIncluded ? list : [user, ...list].filter(Boolean));
        } catch {
            setStaffUsers(user ? [user] : []);
        } finally {
            setStaffLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (isAdmin) loadStaffUsers();
    }, [isAdmin, loadStaffUsers]);

    const openPinModal = (u) => {
        setPinModal(u);
        setAdminPin("");
        setAdminPinConfirm("");
        setAdminPinError("");
        setAdminPinSuccess("");
    };

    const handleAdminSetPin = async (e) => {
        e.preventDefault();
        setAdminPinError("");
        if (!/^\d{4,6}$/.test(adminPin)) { setAdminPinError("PIN must be 4–6 digits."); return; }
        if (adminPin !== adminPinConfirm) { setAdminPinError("PINs do not match."); return; }

        setAdminPinSubmitting(true);
        try {
            await apiClient.post(`/api/core/users/${pinModal.id}/pin/`, { pin: adminPin }, {
                headers: { "X-CSRFToken": getCSRFToken() },
            });
            setAdminPinSuccess("PIN set.");
            setAdminPin("");
            setAdminPinConfirm("");
            loadStaffUsers();
        } catch {
            setAdminPinError("Failed to set PIN.");
        } finally {
            setAdminPinSubmitting(false);
        }
    };

    const handleAdminClearPin = async (userId) => {
        try {
            await apiClient.post(`/api/core/users/${userId}/pin/`, { pin: "" }, {
                headers: { "X-CSRFToken": getCSRFToken() },
            });
            loadStaffUsers();
        } catch {
            // ignore
        }
    };

    const displayName = (u) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.name;
        return name || u.email;
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-4">
                <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors text-sm flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Home
                </Link>
            </div>

            <div className="space-y-6">
                {/* Inactivity lock settings */}
                {isAdmin && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-base font-semibold text-gray-900 mb-1">Shared device lock</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Automatically lock the screen after a period of inactivity. Users can unlock with their PIN.
                        </p>

                        {settingsMsg && (
                            <div className={`mb-4 rounded-lg px-3 py-2 text-sm border ${
                                settingsMsg.includes("Failed")
                                    ? "bg-red-50 border-red-200 text-red-700"
                                    : "bg-green-50 border-green-200 text-green-700"
                            }`}>
                                {settingsMsg}
                            </div>
                        )}

                        <div className="space-y-4">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <div
                                    onClick={() => setLockEnabled(v => !v)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${lockEnabled ? "bg-blue-600" : "bg-gray-200"}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${lockEnabled ? "translate-x-6" : "translate-x-1"}`} />
                                </div>
                                <span className="text-sm font-medium text-gray-700">Lock screen on inactivity</span>
                            </label>

                            {lockEnabled && (
                                <div className="flex items-center gap-3">
                                    <label className="text-sm text-gray-600 whitespace-nowrap">Lock after</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={120}
                                        value={timeoutMinutes}
                                        onChange={e => setTimeoutMinutes(Math.max(1, Number(e.target.value)))}
                                        className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-600">minutes</span>
                                </div>
                            )}

                            <button
                                onClick={handleSaveInactivity}
                                disabled={settingsSaving}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                                {settingsSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Staff PIN management */}
                {isAdmin && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-base font-semibold text-gray-900 mb-1">Staff quick-login PINs</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Set or reset PINs for staff members. Users can also set their own PIN from their profile.
                        </p>

                        {staffLoading ? (
                            <p className="text-sm text-gray-500">Loading staff…</p>
                        ) : (
                            <div className="space-y-2">
                                {staffUsers.map(u => (
                                    <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{displayName(u)}</p>
                                            <p className="text-xs text-gray-400">{u.email}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${u.has_pin ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                {u.has_pin ? "PIN set" : "No PIN"}
                                            </span>
                                            <button
                                                onClick={() => openPinModal(u)}
                                                className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                                            >
                                                {u.has_pin ? "Reset" : "Set PIN"}
                                            </button>
                                            {u.has_pin && (
                                                <button
                                                    onClick={() => handleAdminClearPin(u.id)}
                                                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {staffUsers.length === 0 && (
                                    <p className="text-sm text-gray-500">No staff users found.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {!isAdmin && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <p className="text-sm text-gray-500">Settings are only available to administrators.</p>
                    </div>
                )}
            </div>

            {/* Admin PIN set modal */}
            {pinModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
                        <h3 className="text-base font-semibold text-gray-900 mb-1">
                            Set PIN for {displayName(pinModal)}
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">Enter a 4–6 digit PIN for this user.</p>

                        {adminPinSuccess && (
                            <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">{adminPinSuccess}</div>
                        )}
                        {adminPinError && (
                            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{adminPinError}</div>
                        )}

                        <form onSubmit={handleAdminSetPin} className="space-y-3">
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={adminPin}
                                onChange={e => setAdminPin(e.target.value.replace(/\D/g, ''))}
                                placeholder="New PIN (4–6 digits)"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                value={adminPinConfirm}
                                onChange={e => setAdminPinConfirm(e.target.value.replace(/\D/g, ''))}
                                placeholder="Confirm PIN"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={adminPinSubmitting}
                                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
                                >
                                    Save PIN
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPinModal(null)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
