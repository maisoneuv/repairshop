import { NavLink, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { List, ChevronRight } from "lucide-react";
import PicklistManager from "../features/Settings/PicklistManager";

const SECTIONS = [
    { key: "picklists", label: "Picklists & Statuses", icon: List, path: "picklists" },
    // Future sections: Users, Custom Fields, Workflow Rules, Integrations
];

export default function SystemSettingsPage() {
    const location = useLocation();

    return (
        <div className="flex h-full min-h-0">
            {/* Sub-navigation */}
            <aside className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col">
                <div className="px-4 py-4 border-b border-gray-100">
                    <h1 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                        System Settings
                    </h1>
                </div>
                <nav className="flex-1 py-2">
                    {SECTIONS.map(({ key, label, icon: Icon, path }) => (
                        <NavLink
                            key={key}
                            to={`/system-settings/${path}`}
                            className={({ isActive }) =>
                                `flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors ${
                                    isActive
                                        ? "bg-blue-50 text-blue-700 border-r-2 border-blue-600"
                                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                }`
                            }
                        >
                            <span className="flex items-center gap-2.5">
                                <Icon className="w-4 h-4" />
                                {label}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Content area */}
            <main className="flex-1 overflow-y-auto bg-gray-50">
                <Routes>
                    <Route index element={<Navigate to="picklists" replace />} />
                    <Route path="picklists" element={<PicklistManager />} />
                    <Route path="picklists/:category" element={<PicklistManager />} />
                </Routes>
            </main>
        </div>
    );
}
