import { Outlet, useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import UserProfileDropdown from "../components/UserProfileDropdown";
import { useUser } from "../context/UserContext";
import { useEffect, useState } from "react";
import GlobalSearch from "../components/GlobalSearch/GlobalSearch";
import SideNav from "../components/SideNav";
import QuickLeadModal from "../components/QuickLeadModal";

export default function AppLayout() {
    const { user } = useUser();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showLeadModal, setShowLeadModal] = useState(false);

    const appBgColor = import.meta.env.VITE_APP_BG_COLOR || '#f3f4f6';

    useEffect(() => {
        setMobileMenuOpen(false);
        setMobileSearchOpen(false);
    }, [location.pathname, location.search]);

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
                    <div className="w-full px-4 md:px-6 py-3 md:py-4">
                        <div className="flex items-center justify-between">
                            {/* Mobile hamburger */}
                            <button
                                type="button"
                                onClick={() => setMobileMenuOpen(prev => !prev)}
                                className="md:hidden p-2 text-gray-600 hover:text-blue-600"
                                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                            >
                                <svg className="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {mobileMenuOpen ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                                    )}
                                </svg>
                            </button>

                            {/* Center: search (desktop) */}
                            <div className="hidden md:block flex-1 max-w-md mx-auto">
                                <GlobalSearch />
                            </div>

                            {/* Right: mobile search + create + profile */}
                            <div className="flex items-center space-x-2 md:space-x-4">
                                <button
                                    type="button"
                                    onClick={() => setMobileSearchOpen(true)}
                                    className="md:hidden p-2 text-gray-600 hover:text-blue-600"
                                    aria-label="Search"
                                >
                                    <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowLeadModal(true)}
                                    aria-label="Create new lead"
                                    title="Nowy lead"
                                    className="p-2 text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-200"
                                >
                                    <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate("/work-items/new")}
                                    aria-label="Create new work item"
                                    className="p-2 text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg hover:border-blue-200"
                                >
                                    <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    onKeyDown={(e) => { if (e.key === 'Escape') setMobileSearchOpen(false); }}
                >
                    <div className="flex items-start gap-3 px-4 pt-3 flex-1 min-h-0">
                        <button
                            type="button"
                            onClick={() => setMobileSearchOpen(false)}
                            className="p-1 mt-1 text-gray-500 hover:text-gray-700 flex-shrink-0"
                            aria-label="Close search"
                        >
                            <svg className="w-6 h-6" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="flex-1 flex flex-col min-h-0 h-full">
                            <GlobalSearch isMobileOverlay onNavigate={() => setMobileSearchOpen(false)} />
                        </div>
                    </div>
                </div>
            )}

            <main className="w-full max-w-7xl mx-auto md:ml-0 md:mr-0 px-0 md:px-6 pb-6">
                <Outlet />
            </main>
            </div>

            {showLeadModal && (
                <QuickLeadModal
                    mode="create"
                    onClose={() => setShowLeadModal(false)}
                    onSave={() => setShowLeadModal(false)}
                />
            )}
        </div>
    );
}
