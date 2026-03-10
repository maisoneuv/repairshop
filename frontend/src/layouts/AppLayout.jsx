import { Outlet, useLocation, useNavigate } from "react-router-dom";
import UserProfileDropdown from "../components/UserProfileDropdown";
import { useUser } from "../context/UserContext";
import { useEffect, useState, useRef } from "react";
import GlobalSearch from "../components/GlobalSearch/GlobalSearch";
import SideNav from "../components/SideNav";

export default function AppLayout() {
    const { user } = useUser();
    const navigate = useNavigate();
    const location = useLocation();
    const [workItemMenuOpen, setWorkItemMenuOpen] = useState(false);
    const [taskMenuOpen, setTaskMenuOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const workItemMenuRef = useRef(null);
    const taskMenuRef = useRef(null);

    // Get background color from environment variable (defaults to light grey)
    const appBgColor = import.meta.env.VITE_APP_BG_COLOR || '#f3f4f6';

    useEffect(() => {
        setWorkItemMenuOpen(false);
        setTaskMenuOpen(false);
        setMobileMenuOpen(false);
        setMobileSearchOpen(false);
    }, [location.pathname, location.search]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (workItemMenuRef.current && !workItemMenuRef.current.contains(event.target)) {
                setWorkItemMenuOpen(false);
            }
            if (taskMenuRef.current && !taskMenuRef.current.contains(event.target)) {
                setTaskMenuOpen(false);
            }
        }

        // Only add listener if at least one menu is open
        if (workItemMenuOpen || taskMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => {
                document.removeEventListener("mousedown", handleClickOutside);
            };
        }
    }, [workItemMenuOpen, taskMenuOpen]);

    // Scroll lock when mobile search overlay is open
    useEffect(() => {
        if (mobileSearchOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [mobileSearchOpen]);

    const contentOffsetClass = user ? (sidebarCollapsed ? "md:pl-20" : "md:pl-64") : "";

    return (
        <div className="min-h-screen text-gray-900" style={{backgroundColor: appBgColor}}>
            {user && (
                <SideNav
                    mobileOpen={mobileMenuOpen}
                    onMobileClose={() => setMobileMenuOpen(false)}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
                />
            )}

            <div className={`transition-all duration-200 ${contentOffsetClass}`}>
                {user && (
                <nav className="bg-white shadow-sm mb-6">
                    <div className="w-full max-w-7xl mx-auto md:ml-0 md:mr-0 px-4 md:px-6 py-3 md:py-4">
                        <div className="flex items-center justify-between">
                            {/* Left: logo + mobile hamburger + desktop nav links */}
                            <div className="flex items-center">
                                {/* Mobile hamburger button */}
                                <button
                                    type="button"
                                    onClick={() => setMobileMenuOpen(prev => !prev)}
                                    className="md:hidden p-2 text-gray-600 hover:text-blue-600"
                                    aria-label="Toggle menu"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        {mobileMenuOpen ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        ) : (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                                        )}
                                    </svg>
                                </button>

                                {/* Desktop nav links - hidden on mobile */}
                                <div className="hidden md:flex items-center space-x-8 ml-6">
                                    <div className="relative" ref={workItemMenuRef}>
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
                                    <div className="relative" ref={taskMenuRef}>
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
                            </div>

                            {/* Center search - desktop only */}
                            <div className="hidden md:block flex-1 max-w-md mx-8">
                                <GlobalSearch />
                            </div>

                            {/* Right side actions */}
                            <div className="flex items-center space-x-2 md:space-x-4">
                                {/* Mobile search icon */}
                                <button
                                    type="button"
                                    onClick={() => setMobileSearchOpen(true)}
                                    className="md:hidden p-2 text-gray-600 hover:text-blue-600"
                                    aria-label="Search"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => navigate("/work-items/new")}
                                    className="p-2 text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-200"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                </button>
                                <UserProfileDropdown />
                            </div>
                        </div>

                    </div>
                </nav>
            )}

            {/* Mobile search overlay */}
            {mobileSearchOpen && (
                <div
                    className="fixed inset-0 z-50 bg-white md:hidden flex flex-col"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setMobileSearchOpen(false);
                    }}
                >
                    <div className="flex items-start gap-3 px-4 pt-3 flex-1 min-h-0">
                        <button
                            type="button"
                            onClick={() => setMobileSearchOpen(false)}
                            className="p-1 mt-1 text-gray-500 hover:text-gray-700 flex-shrink-0"
                            aria-label="Close search"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="flex-1 flex flex-col min-h-0 h-full">
                            <GlobalSearch isMobileOverlay onNavigate={() => setMobileSearchOpen(false)} />
                        </div>
                    </div>
                </div>
            )}

            <main className="w-full max-w-7xl mx-auto md:ml-0 md:mr-0 px-4 md:px-6 pb-6">
                <Outlet />
            </main>
            </div>
        </div>
    );
}
