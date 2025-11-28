import { Outlet, useLocation, useNavigate } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";
import { useUser } from "../context/UserContext";
import { useEffect, useState } from "react";
import GlobalSearch from "../components/GlobalSearch/GlobalSearch";

export default function AppLayout() {
    const { user } = useUser();
    const navigate = useNavigate();
    const location = useLocation();
    const [workItemMenuOpen, setWorkItemMenuOpen] = useState(false);
    const [taskMenuOpen, setTaskMenuOpen] = useState(false);

    useEffect(() => {
        setWorkItemMenuOpen(false);
        setTaskMenuOpen(false);
    }, [location.pathname, location.search]);

    return (
        <div className="min-h-screen text-gray-900" style={{background: 'linear-gradient(135deg, #DFE9FF 0%, #D9D9D9 100%)'}}>
            {user && (
                <nav className="bg-white shadow-sm mb-6">
                    <div className="max-w-7xl mx-auto px-6 py-4">
                        <div className="flex items-center justify-between">
                            {/* Left nav links */}
                            <div className="flex items-center space-x-8">
                                <div className="flex items-center">
                                    <div className="w-6 h-6 bg-blue-600 rounded-sm mr-2"></div>
                                </div>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setWorkItemMenuOpen((prev) => !prev)}
                                        className="flex items-center gap-1 text-gray-600 hover:text-blue-600 font-medium"
                                    >
                                        Work Items
                                        <svg className={`w-4 h-4 transition-transform ${workItemMenuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {workItemMenuOpen && (
                                        <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => navigate("/work-items")}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50"
                                            >
                                                All Work Items
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => navigate({ pathname: "/work-items", search: "?view=my" })}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50"
                                            >
                                                My Work Items
                                            </button>
                                            <div className="border-t border-gray-100" />
                                            <button
                                                type="button"
                                                onClick={() => navigate("/work-items/new")}
                                                className="w-full text-left px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                                            >
                                                Create New
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setTaskMenuOpen((prev) => !prev)}
                                        className="flex items-center gap-1 text-gray-600 hover:text-blue-600 font-medium"
                                    >
                                        Tasks
                                        <svg className={`w-4 h-4 transition-transform ${taskMenuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {taskMenuOpen && (
                                        <div className="absolute left-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => navigate("/tasks/all")}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50"
                                            >
                                                All Tasks
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => navigate("/tasks/my")}
                                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50"
                                            >
                                                My Tasks
                                            </button>
                                            <div className="border-t border-gray-100" />
                                            <button
                                                type="button"
                                                onClick={() => navigate("/tasks/new")}
                                                className="w-full text-left px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                                            >
                                                Create New
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Center search */}
                            <div className="flex-1 max-w-md mx-8">
                                <GlobalSearch />
                            </div>

                            {/* Right side actions */}
                            <div className="flex items-center space-x-4">
                                <button className="p-2 text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-200">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                </button>
                                <LogoutButton />
                            </div>
                        </div>
                    </div>
                </nav>
            )}
            <main className="max-w-7xl mx-auto px-6 pb-6">
                <Outlet />
            </main>
        </div>
    );
}
