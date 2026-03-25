import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { User, LogOut, Lock, Settings } from "lucide-react";

function getDisplayName(user) {
    if (user.first_name || user.last_name) {
        return `${user.first_name || ""} ${user.last_name || ""}`.trim();
    }
    return user.name || user.email;
}

export default function UserProfileDropdown() {
    const { user, logout, lockScreen } = useUser();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isOpen]);

    if (!user) return null;

    const displayName = getDisplayName(user);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
            >
                <User className="w-5 h-5" />
                <span className="hidden md:inline text-sm font-medium">{displayName}</span>
                <svg
                    className={`hidden md:block w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => {
                            navigate("/profile");
                            setIsOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    >
                        <User className="w-4 h-4" />
                        My Profile
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            navigate("/settings");
                            setIsOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    >
                        <Settings className="w-4 h-4" />
                        Settings
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            lockScreen();
                            setIsOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    >
                        <Lock className="w-4 h-4" />
                        Lock screen
                    </button>
                    <div className="border-t border-gray-100" />
                    <button
                        type="button"
                        onClick={() => {
                            logout();
                            setIsOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
}
