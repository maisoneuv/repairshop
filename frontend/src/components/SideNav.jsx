import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    ClipboardList,
    CheckSquare,
    Package,
    Landmark,
    Plus,
    List,
    User,
    Truck,
    ChevronDown,
    X,
    Home,
    ChevronsLeft,
    ChevronsRight,
    UserPlus,
} from "lucide-react";
import GlobalActionsSection from "../features/CustomActions/GlobalActionsSection";

const NAV_GROUPS = [
    {
        key: "work-items",
        label: "Work Items",
        icon: ClipboardList,
        mobileOnly: false,
        basePaths: ["/work-items"],
        children: [
            { label: "All Work Items", path: "/work-items", icon: List },
            { label: "My Work Items", path: "/work-items", search: "?view=my", icon: User },
            { label: "Create New", path: "/work-items/new", icon: Plus, accent: true },
        ],
    },
    {
        key: "tasks",
        label: "Tasks",
        icon: CheckSquare,
        mobileOnly: false,
        basePaths: ["/tasks"],
        children: [
            { label: "All Tasks", path: "/tasks/all", icon: List },
            { label: "My Tasks", path: "/tasks/my", icon: User },
            { label: "Create New", path: "/tasks/new", icon: Plus, accent: true },
        ],
    },
    {
        key: "inventory",
        label: "Inventory",
        icon: Package,
        mobileOnly: false,
        basePaths: ["/inventory"],
        children: [
            { label: "Stock", path: "/inventory", icon: Package },
            { label: "Receive Delivery", path: "/inventory/receive", icon: Truck },
        ],
    },
    {
        key: "cash-registers",
        label: "Cash Registers",
        icon: Landmark,
        mobileOnly: false,
        basePaths: ["/cash-registers"],
        children: [
            { label: "All Registers", path: "/cash-registers", icon: List },
            { label: "New Register", path: "/cash-registers/new", icon: Plus, accent: true },
        ],
    },
    {
        key: "leads",
        label: "Leady",
        icon: UserPlus,
        mobileOnly: false,
        basePaths: ["/leads"],
        children: [
            { label: "Wszystkie Leady", path: "/leads", icon: List },
        ],
    },
];

const APP_NAME = import.meta.env.VITE_APP_NAME || "Fixed Service";
const sidebarBgColor = import.meta.env.VITE_APP_SIDEBAR_COLOR || '#4e6998';

const PRIMARY_LINKS = [
    {
        key: "home",
        label: "Home",
        icon: Home,
        path: "/",
    },
];

function isGroupActive(group, location) {
    return group.basePaths.some((base) => location.pathname.startsWith(base));
}

function isChildActive(child, location) {
    const pathMatch =
        location.pathname === child.path ||
        (child.path !== "/" && location.pathname.startsWith(child.path + "/"));

    if (child.search) {
        return pathMatch && location.search === child.search;
    }

    // For /work-items without search, don't match when ?view=my is present
    if (child.path === "/work-items" && !child.search) {
        return pathMatch && !location.search.includes("view=my");
    }

    return pathMatch;
}

function MobileNavGroup({ group, isExpanded, onToggle, location, onNavigate }) {
    const Icon = group.icon;
    const active = isGroupActive(group, location);

    return (
        <div className="px-2">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isExpanded}
                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active ? "text-blue-600 bg-blue-50" : "text-white/80 hover:bg-white/[0.06] hover:text-white"
                }`}
            >
                <span className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    {group.label}
                </span>
                <ChevronDown
                    className={`w-4 h-4 text-white/45 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="ml-8 py-1 space-y-0.5">
                            {group.children.map((child) => {
                                const ChildIcon = child.icon;
                                const childActive = isChildActive(child, location);
                                return (
                                    <button
                                        type="button"
                                        key={child.path + (child.search || "")}
                                        onClick={() => onNavigate(child.path, child.search)}
                                        className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                                            childActive
                                                ? "text-white font-medium bg-white/20"
                                                : child.accent
                                                  ? "text-blue-200 font-medium hover:bg-white/[0.06]"
                                                  : "text-white/45 hover:text-white hover:bg-white/[0.06]"
                                        }`}
                                    >
                                        <ChildIcon className="w-4 h-4" />
                                        {child.label}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function SideNav({ mobileOpen, onMobileClose, collapsed = false, onToggleCollapse }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [expandedGroups, setExpandedGroups] = useState(() => {
        const initial = new Set();
        for (const group of NAV_GROUPS) {
            if (isGroupActive(group, location)) {
                initial.add(group.key);
            }
        }
        return initial;
    });

    // Ensure active groups are expanded
    useEffect(() => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            for (const group of NAV_GROUPS) {
                if (isGroupActive(group, location)) {
                    next.add(group.key);
                }
            }
            return next;
        });
    }, [location.pathname, location.search]);

    // Scroll lock when mobile drawer is open
    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileOpen]);

    function toggleGroup(key) {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }

    function handleNavigate(path, search) {
        navigate({ pathname: path, search: search || "" });
        onMobileClose();
    }

    const desktopGroups = NAV_GROUPS.filter((g) => !g.mobileOnly);

    return (
        <>
            {/* Desktop sidebar */}
            <motion.aside
                className="fixed left-0 hidden md:flex flex-col border-r border-white/15 z-30"
                style={{ backgroundColor: sidebarBgColor, top: 0, bottom: 0 }}
                initial={false}
                animate={{ width: collapsed ? 80 : 256 }}
                transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
            >
                <div className="px-3 pt-5 pb-4 border-b border-white/15">
                    <button
                        onClick={() => navigate("/")}
                        className={`flex items-center gap-3 w-full text-left ${collapsed ? "justify-center" : ""}`}
                    >
                        <div className="w-10 h-10 rounded-2xl bg-white text-blue-600 flex items-center justify-center text-lg font-semibold">
                            {APP_NAME.charAt(0)}
                        </div>
                        {!collapsed && (
                            <div>
                                <p className="text-base font-semibold text-white">{APP_NAME}</p>
                                <p className="text-xs text-white/55">Workspace</p>
                            </div>
                        )}
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
                    <div>
                        {!collapsed && (
                            <p className="text-xs font-semibold uppercase text-white/45 tracking-wide px-2">
                                General
                            </p>
                        )}
                        <div className="mt-2 space-y-1">
                            {PRIMARY_LINKS.map((item) => {
                                const Icon = item.icon;
                                const active = location.pathname === item.path;
                                return (
                                    <button
                                        type="button"
                                        key={item.key}
                                        onClick={() => navigate(item.path)}
                                        title={collapsed ? item.label : undefined}
                                        aria-label={collapsed ? item.label : undefined}
                                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                            collapsed ? "justify-center" : ""
                                        } ${
                                            active
                                                ? "bg-white/20 text-white"
                                                : "text-white/80 hover:bg-white/[0.06] hover:text-white"
                                        }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {!collapsed && item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        {!collapsed && (
                            <p className="text-xs font-semibold uppercase text-white/45 tracking-wide px-2">
                                Navigation
                            </p>
                        )}
                        <div className={`mt-3 space-y-2 ${collapsed ? "" : ""}`}>
                            {desktopGroups.map((group) => {
                                const Icon = group.icon;
                                const active = isGroupActive(group, location);
                                const isExpanded = expandedGroups.has(group.key);
                                const showChildren = !collapsed && isExpanded;
                                return (
                                    <div key={group.key} className="rounded-xl">
                                        <button
                                            type="button"
                                            title={collapsed ? group.label : undefined}
                                            aria-label={collapsed ? group.label : undefined}
                                            aria-expanded={!collapsed ? isExpanded : undefined}
                                            onClick={() => {
                                                if (collapsed) {
                                                    const first = group.children?.[0];
                                                    if (first) {
                                                        navigate({
                                                            pathname: first.path,
                                                            search: first.search || "",
                                                        });
                                                    }
                                                } else {
                                                    toggleGroup(group.key);
                                                }
                                            }}
                                            className={`flex items-center ${
                                                collapsed ? "justify-center" : "justify-between"
                                            } w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                                active
                                                    ? "bg-white/20 text-white"
                                                    : "text-white/80 hover:bg-white/[0.06] hover:text-white"
                                            }`}
                                        >
                                            <span
                                                className={`flex items-center gap-3 ${
                                                    collapsed ? "justify-center" : ""
                                                }`}
                                            >
                                                <Icon className="w-5 h-5" />
                                                {!collapsed && group.label}
                                            </span>
                                            {!collapsed && (
                                                <ChevronDown
                                                    className={`w-4 h-4 text-white/45 transition-transform ${
                                                        isExpanded ? "rotate-180" : ""
                                                    }`}
                                                />
                                            )}
                                        </button>

                                        <AnimatePresence initial={false}>
                                            {showChildren && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="pl-11 pr-2 py-1 space-y-1"
                                                >
                                                    {group.children.map((child) => {
                                                        const ChildIcon = child.icon;
                                                        const childActive = isChildActive(
                                                            child,
                                                            location,
                                                        );
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={
                                                                    child.path + (child.search || "")
                                                                }
                                                                onClick={() =>
                                                                    navigate({
                                                                        pathname: child.path,
                                                                        search: child.search || "",
                                                                    })
                                                                }
                                                                className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                                                                    childActive
                                                                        ? "text-white font-medium bg-white/20"
                                                                        : child.accent
                                                                          ? "text-blue-200 font-medium hover:bg-white/[0.06]"
                                                                          : "text-white/45 hover:text-white hover:bg-white/[0.06]"
                                                                }`}
                                                            >
                                                                <ChildIcon className="w-4 h-4" />
                                                                {child.label}
                                                            </button>
                                                        );
                                                    })}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <GlobalActionsSection collapsed={collapsed} />
                </div>
                <div className="p-3 border-t border-white/15">
                    <button
                        type="button"
                        onClick={() => onToggleCollapse && onToggleCollapse()}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className="w-full flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-white/55 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        {collapsed ? (
                            <ChevronsRight className="w-4 h-4" />
                        ) : (
                            <ChevronsLeft className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </motion.aside>

            {/* Mobile drawer */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            className="fixed inset-0 bg-black/30 z-40 md:hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onMobileClose}
                        />
                        {/* Drawer panel */}
                        <motion.aside
                            className="fixed left-0 top-0 h-full w-72 shadow-xl z-40 md:hidden flex flex-col"
                            style={{ backgroundColor: sidebarBgColor }}
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") onMobileClose();
                            }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-4 border-b border-white/15">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white">
                                        <Home className="w-4 h-4" strokeWidth={2.5} />
                                    </div>
                                    <span className="font-semibold text-white">{APP_NAME}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={onMobileClose}
                                    className="p-1 text-white/55 hover:text-white"
                                    aria-label="Close menu"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Nav items */}
                            <nav className="flex-1 overflow-y-auto py-2 space-y-1">
                                {/* Home link */}
                                <div className="px-2">
                                    {PRIMARY_LINKS.map((item) => {
                                        const Icon = item.icon;
                                        const active = location.pathname === item.path;
                                        return (
                                            <button
                                                type="button"
                                                key={item.key}
                                                onClick={() => handleNavigate(item.path)}
                                                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                                    active ? "text-blue-600 bg-blue-50" : "text-white/80 hover:bg-white/[0.06] hover:text-white"
                                                }`}
                                            >
                                                <Icon className="w-5 h-5" />
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {NAV_GROUPS.map((group) => (
                                    <MobileNavGroup
                                        key={group.key}
                                        group={group}
                                        isExpanded={expandedGroups.has(group.key)}
                                        onToggle={() => toggleGroup(group.key)}
                                        location={location}
                                        onNavigate={handleNavigate}
                                    />
                                ))}
                                <div className="px-2 pt-2">
                                    <GlobalActionsSection collapsed={false} />
                                </div>
                            </nav>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
