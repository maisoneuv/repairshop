import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";

export default function PasswordResetPage() {
    const { uid, token } = useParams();
    const navigate = useNavigate();

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        setSubmitting(true);
        try {
            await apiClient.post("/api/core/auth/reset-password/confirm/", {
                uid,
                token,
                new_password: password,
            });
            setDone(true);
            setTimeout(() => navigate("/login"), 2500);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (Array.isArray(detail)) {
                setError(detail.join(" "));
            } else {
                setError(detail || "Invalid or expired link. Ask your admin to send a new one.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    {done ? (
                        <div className="text-center">
                            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-base font-semibold text-gray-900 mb-1">Password set!</h2>
                            <p className="text-sm text-gray-500">Redirecting you to login…</p>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-[17px] font-semibold text-gray-900 mb-1">Set your password</h1>
                            <p className="text-sm text-gray-500 mb-6">Choose a strong password to secure your account.</p>

                            {error && (
                                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">New password</label>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Confirm password</label>
                                    <input
                                        type="password"
                                        required
                                        value={confirm}
                                        onChange={e => setConfirm(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors mt-1"
                                >
                                    {submitting ? "Setting password…" : "Set password"}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
