import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";
import { useUser } from "../context/UserContext";
import { useEffect, useState } from "react";

export default function AppLayout() {
    const { user } = useUser();
    const navigate = useNavigate();
    const location = useLocation();
    const [workItemMenuOpen, setWorkItemMenuOpen] = useState(false);

    useEffect(() => {
        setWorkItemMenuOpen(false);
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
                                <NavLink
                                    to="/tasks"
                                    className={({ isActive }) =>
                                        isActive ? "font-semibold text-blue-600" : "text-gray-600 hover:text-blue-600 font-medium"
                                    }
                                >
                                    Tasks
                                </NavLink>
                            </div>

                            {/* Center search */}
                            <div className="flex-1 max-w-md mx-8">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search"
                                        className="w-full px-4 py-2 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                </div>
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
