import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";
import { getCSRFToken } from "../utils/csrf";
import { useUser } from "../context/UserContext";

const PIN_MIN = 4;
const PIN_MAX = 6;

export default function LockScreen() {
    const { unlockScreen, dismissLock } = useUser();
    const navigate = useNavigate();

    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [pin, setPin] = useState([]);
    const [error, setError] = useState("");
    const [shake, setShake] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const submitRef = useRef(false);

    // Fetch employees with PINs
    useEffect(() => {
        apiClient.get("/api/core/users/pinned/")
            .then(({ data }) => {
                setUsers(data.users || []);
                if (data.users?.length === 1) setSelectedUser(data.users[0]);
            })
            .catch(() => {});
    }, []);

    const submitPin = useCallback(async (digits) => {
        if (!selectedUser || submitRef.current) return;
        submitRef.current = true;
        setSubmitting(true);
        setError("");

        try {
            const csrfToken = getCSRFToken();
            await apiClient.post(
                "/api/core/quick-login/",
                { user_id: selectedUser.id, pin: digits.join("") },
                { headers: { "X-CSRFToken": csrfToken }, withCredentials: true }
            );
            await unlockScreen();
        } catch (err) {
            if (err?.response?.status === 403 && err?.response?.data?.error === "full_login_required") {
                dismissLock();
                navigate("/login");
                return;
            }
            setShake(true);
            setTimeout(() => setShake(false), 600);
            setError("Incorrect PIN");
            setPin([]);
        } finally {
            setSubmitting(false);
            submitRef.current = false;
        }
    }, [selectedUser, unlockScreen]);

    const handleDigit = useCallback((digit) => {
        if (submitting) return;
        setError("");
        setPin(prev => {
            if (prev.length >= PIN_MAX) return prev;
            const next = [...prev, digit];
            if (next.length === PIN_MAX) {
                // auto-submit at max length
                setTimeout(() => submitPin(next), 50);
            }
            return next;
        });
    }, [submitting, submitPin]);

    const handleBackspace = useCallback(() => {
        if (submitting) return;
        setPin(prev => prev.slice(0, -1));
        setError("");
    }, [submitting]);

    // Keyboard support
    useEffect(() => {
        const onKey = (e) => {
            if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
            else if (e.key === 'Backspace') handleBackspace();
            else if (e.key === 'Enter' && pin.length >= PIN_MIN) submitPin(pin);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [handleDigit, handleBackspace, pin, submitPin]);

    const handleSelectUser = (u) => {
        setSelectedUser(u);
        setPin([]);
        setError("");
    };

    const handleFullLogin = () => {
        dismissLock();
        navigate("/login");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/70 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">

                {/* Header */}
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Session locked</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Who are you?</p>
                </div>

                {/* User tiles */}
                {users.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center">
                        {users.map(u => (
                            <button
                                key={u.id}
                                onClick={() => handleSelectUser(u)}
                                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 transition-all ${
                                    selectedUser?.id === u.id
                                        ? "border-blue-500 bg-blue-50"
                                        : "border-gray-200 hover:border-gray-300 bg-white"
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                                    selectedUser?.id === u.id ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"
                                }`}>
                                    {u.initials}
                                </div>
                                <span className="text-xs text-gray-700 max-w-[64px] truncate">{u.name.split(' ')[0]}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* PIN area — only shown when a user is selected */}
                {selectedUser && (
                    <>
                        {/* PIN dots */}
                        <div className={`flex justify-center gap-3 ${shake ? "animate-shake" : ""}`}>
                            {Array.from({ length: PIN_MAX }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                        i < pin.length
                                            ? "bg-blue-500 border-blue-500"
                                            : i < PIN_MIN
                                            ? "bg-transparent border-gray-300"
                                            : "bg-transparent border-gray-200"
                                    }`}
                                />
                            ))}
                        </div>

                        {error && (
                            <p className="text-center text-sm text-red-600 -mt-2">{error}</p>
                        )}

                        {/* PIN pad */}
                        <div className="grid grid-cols-3 gap-2">
                            {['1','2','3','4','5','6','7','8','9'].map(d => (
                                <button
                                    key={d}
                                    onClick={() => handleDigit(d)}
                                    disabled={submitting || pin.length >= PIN_MAX}
                                    className="h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 font-semibold text-lg transition-colors disabled:opacity-40"
                                >
                                    {d}
                                </button>
                            ))}
                            {/* bottom row: confirm (when ready) or empty, 0, backspace */}
                            <button
                                onClick={() => pin.length >= PIN_MIN && submitPin(pin)}
                                disabled={submitting || pin.length < PIN_MIN}
                                className={`h-12 rounded-xl font-semibold text-sm transition-colors ${
                                    pin.length >= PIN_MIN && pin.length < PIN_MAX
                                        ? "bg-blue-500 hover:bg-blue-600 text-white"
                                        : "bg-transparent text-transparent pointer-events-none"
                                }`}
                                aria-label="Confirm"
                            >
                                OK
                            </button>
                            <button
                                onClick={() => handleDigit('0')}
                                disabled={submitting || pin.length >= PIN_MAX}
                                className="h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900 font-semibold text-lg transition-colors disabled:opacity-40"
                            >
                                0
                            </button>
                            <button
                                onClick={handleBackspace}
                                disabled={submitting || pin.length === 0}
                                className="h-12 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-500 transition-colors disabled:opacity-40 flex items-center justify-center"
                                aria-label="Delete"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                                </svg>
                            </button>
                        </div>
                    </>
                )}

                {/* No users with PINs */}
                {users.length === 0 && (
                    <p className="text-center text-sm text-gray-500">
                        No users have a PIN set up yet.
                    </p>
                )}

                {/* Full login fallback */}
                <div className="text-center border-t border-gray-100 pt-3">
                    <button
                        onClick={handleFullLogin}
                        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        Use full login instead
                    </button>
                </div>
            </div>
        </div>
    );
}
