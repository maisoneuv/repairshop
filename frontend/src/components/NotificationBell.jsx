import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import {
    fetchNotifications,
    isProcessDisabled,
    markAllNotificationsRead,
    markNotificationRead,
} from "../api/process";
import { useGuidedProcessEnabled } from "../hooks/useGuidedProcess";

const POLL_MS = 60000;

/**
 * The bell (§7E). Restraint is the design: it only fires for the three events
 * that genuinely need *you* — work handed to you, a pause bounced to you, and
 * a wait you own being resolved. Everything else lives quietly in the queue,
 * which is why the footer states the policy.
 */
export default function NotificationBell() {
    const guidedEnabled = useGuidedProcessEnabled();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const containerRef = useRef(null);
    const navigate = useNavigate();

    const load = useCallback(async () => {
        try {
            const data = await fetchNotifications();
            setItems(data.results ?? []);
            setUnread(data.unread_count ?? 0);
        } catch (err) {
            if (!isProcessDisabled(err)) {
                console.error("Failed to load notifications:", err);
            }
        }
    }, []);

    useEffect(() => {
        if (!guidedEnabled) return undefined;
        load();
        const timer = setInterval(load, POLL_MS);
        return () => clearInterval(timer);
    }, [guidedEnabled, load]);

    useEffect(() => {
        if (!open) return undefined;
        const onClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [open]);

    if (!guidedEnabled) return null;

    const openNotification = async (notification) => {
        setOpen(false);
        if (!notification.read) {
            try {
                await markNotificationRead(notification.id);
                setUnread((n) => Math.max(0, n - 1));
                setItems((prev) =>
                    prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
                );
            } catch (err) {
                console.error("Failed to mark notification read:", err);
            }
        }
        if (notification.work_item) navigate(`/work-items/${notification.work_item}`);
    };

    const markAll = async () => {
        try {
            await markAllNotificationsRead();
            setItems((prev) => prev.map((n) => ({ ...n, read: true })));
            setUnread(0);
        } catch (err) {
            console.error("Failed to mark all read:", err);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
                className="relative p-2 text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-200"
            >
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                        <span className="text-sm font-bold text-gray-900">Notifications</span>
                        {unread > 0 && (
                            <button
                                type="button"
                                onClick={markAll}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                        {items.length === 0 && (
                            <li className="px-4 py-6 text-sm text-gray-400 text-center">
                                Nothing needs you right now.
                            </li>
                        )}
                        {items.map((notification) => (
                            <li key={notification.id}>
                                <button
                                    type="button"
                                    onClick={() => openNotification(notification)}
                                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                                        notification.read ? "" : "bg-blue-50/50"
                                    }`}
                                >
                                    <div className="flex items-start gap-2">
                                        {!notification.read && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm text-gray-800 leading-snug">
                                                {notification.text}
                                            </p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">
                                                {new Date(notification.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>

                    <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
                        You're only notified when work is handed to you, bounced to you, or a wait
                        you own clears.
                    </p>
                </div>
            )}
        </div>
    );
}
