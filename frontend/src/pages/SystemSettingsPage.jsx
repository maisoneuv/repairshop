import { useEffect, useState } from "react";
import { NavLink, Routes, Route, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import PicklistContentPane from "../features/Settings/PicklistContentPane";
import CustomFieldsInline from "../features/Settings/CustomFieldsInline";
import { fetchCustomFields } from "../api/customFields";

// ─── Data ────────────────────────────────────────────────────────────────────

const OBJECTS = [
    {
        key: "workitem",
        label: "Work Items",
        description: "Repair orders — statuses, types, methods and pricing",
        color: "amber",
        picklists: [
            { key: "workitem_status",   label: "Status" },
            { key: "workitem_type",     label: "Repair Type" },
            { key: "workitem_priority", label: "Priority" },
            { key: "intake_method",     label: "Intake Method" },
            { key: "dropoff_method",    label: "Drop-off Method" },
            { key: "payment_method",    label: "Payment Method" },
        ],
    },
    {
        key: "task",
        label: "Tasks",
        description: "Subtask assignments and work tracking",
        color: "sky",
        picklists: [
            { key: "task_status", label: "Status" },
        ],
    },
    {
        key: "customer",
        label: "Customers",
        description: "Customer profiles, leads and contact data",
        color: "emerald",
        picklists: [
            { key: "referral_source", label: "Referral Source" },
            { key: "lead_status",     label: "Lead Status" },
        ],
    },
];

const GLOBAL_PICKLISTS = [
    { key: "currency",      label: "Currency",      description: "Accepted currencies for pricing" },
    { key: "employee_role", label: "Employee Role",  description: "Role categories for staff members" },
];

const ACCENT = {
    amber:   { bar: "bg-amber-400",   badge: "bg-amber-100 text-amber-700",   nav: "bg-amber-50 text-amber-800 border-amber-400",   dot: "bg-amber-400"  },
    sky:     { bar: "bg-sky-400",     badge: "bg-sky-100 text-sky-700",       nav: "bg-sky-50 text-sky-800 border-sky-400",         dot: "bg-sky-400"    },
    emerald: { bar: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700", nav: "bg-emerald-50 text-emerald-800 border-emerald-400", dot: "bg-emerald-400" },
    violet:  { bar: "bg-violet-400",  badge: "bg-violet-100 text-violet-700", nav: "bg-violet-50 text-violet-800 border-violet-400", dot: "bg-violet-400" },
};

// ─── Legacy redirect helpers ──────────────────────────────────────────────────

const CATEGORY_TO_OBJECT = Object.fromEntries(
    OBJECTS.flatMap(o => o.picklists.map(p => [p.key, o.key]))
);

function LegacyPicklistRedirect() {
    const { category } = useParams();
    const navigate = useNavigate();
    useEffect(() => {
        const obj = CATEGORY_TO_OBJECT[category];
        navigate(
            obj
                ? `/system-settings/fields/${obj}/picklists/${category}`
                : `/system-settings/global/${category}`,
            { replace: true }
        );
    }, [category, navigate]);
    return null;
}

function LegacyCustomFieldsRedirect() {
    const { model } = useParams();
    const navigate = useNavigate();
    useEffect(() => {
        navigate(`/system-settings/fields/${model}/custom-fields`, { replace: true });
    }, [model, navigate]);
    return null;
}

// ─── Fields Overview ─────────────────────────────────────────────────────────

function ObjectRow({ obj, customFieldCount }) {
    const navigate = useNavigate();
    const a = ACCENT[obj.color];

    return (
        <button
            onClick={() => navigate(`/system-settings/fields/${obj.key}`)}
            className="group relative w-full flex items-stretch text-left bg-white border border-gray-200 rounded-lg overflow-hidden transition-shadow hover:shadow-sm"
        >
            <span className={`w-[3px] shrink-0 ${a.bar}`} />
            <span className="flex-1 flex items-center justify-between px-5 py-4 gap-6">
                <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 leading-snug">
                        {obj.label}
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5 leading-snug">
                        {obj.description}
                    </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${a.badge}`}>
                        {obj.picklists.length} {obj.picklists.length === 1 ? "picklist" : "picklists"}
                    </span>
                    {customFieldCount > 0 && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {customFieldCount} custom {customFieldCount === 1 ? "field" : "fields"}
                        </span>
                    )}
                    <svg
                        className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
                    </svg>
                </span>
            </span>
        </button>
    );
}

function GlobalRow({ item }) {
    const navigate = useNavigate();
    return (
        <button
            onClick={() => navigate(`/system-settings/global/${item.key}`)}
            className="group w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
        >
            <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-800">{item.label}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{item.description}</span>
            </span>
            <svg
                className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 ml-4 transition-colors"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
            </svg>
        </button>
    );
}

function FieldsOverview() {
    const [counts, setCounts] = useState({});

    useEffect(() => {
        Promise.all(
            OBJECTS.map(o =>
                fetchCustomFields(o.key)
                    .then(f => [o.key, f.length])
                    .catch(() => [o.key, 0])
            )
        ).then(entries => setCounts(Object.fromEntries(entries)));
    }, []);

    return (
        <div className="px-8 py-8 max-w-2xl">
            <div className="mb-8">
                <h2 className="text-[15px] font-semibold text-gray-900">Object & Field Settings</h2>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    Configure picklists, statuses, and custom fields per object type.
                </p>
            </div>

            <section className="mb-8">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">
                    Objects
                </p>
                <div className="space-y-2">
                    {OBJECTS.map(obj => (
                        <ObjectRow key={obj.key} obj={obj} customFieldCount={counts[obj.key] ?? 0} />
                    ))}
                </div>
            </section>

            <section>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">
                    Global Picklists
                </p>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                    {GLOBAL_PICKLISTS.map(item => (
                        <GlobalRow key={item.key} item={item} />
                    ))}
                </div>
            </section>
        </div>
    );
}

// ─── Object Detail ────────────────────────────────────────────────────────────

function ObjectDetail() {
    const { model } = useParams();
    const navigate = useNavigate();
    const obj = OBJECTS.find(o => o.key === model);

    if (!obj) return <Navigate to="/system-settings/fields" replace />;

    const a = ACCENT[obj.color];

    const navItemClass = (active) =>
        `flex items-center w-full px-4 py-[7px] text-sm transition-colors border-r-2 ${
            active
                ? `${a.nav} font-medium`
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-transparent"
        }`;

    return (
        <div className="flex h-full min-h-0">
            {/* Object sub-nav */}
            <aside className="w-52 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
                <div className="px-4 pt-4 pb-3.5 border-b border-gray-100">
                    <button
                        onClick={() => navigate("/system-settings/fields")}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-2.5 transition-colors"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        All objects
                    </button>
                    <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-sm shrink-0 ${a.dot}`} />
                        <span className="text-sm font-semibold text-gray-900">{obj.label}</span>
                    </div>
                </div>

                <nav className="flex-1 py-2.5">
                    <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                        Picklists
                    </p>
                    {obj.picklists.map(cat => (
                        <NavLink
                            key={cat.key}
                            to={`/system-settings/fields/${model}/picklists/${cat.key}`}
                            className={({ isActive }) => navItemClass(isActive)}
                        >
                            {cat.label}
                        </NavLink>
                    ))}

                    <p className="px-4 pt-4 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                        Customization
                    </p>
                    <NavLink
                        to={`/system-settings/fields/${model}/custom-fields`}
                        className={({ isActive }) => navItemClass(isActive)}
                    >
                        <span className="flex items-center gap-2">
                            <svg className="w-3.5 h-3.5 opacity-50 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Custom Fields
                        </span>
                    </NavLink>
                </nav>
            </aside>

            {/* Content pane */}
            <div className="flex-1 overflow-y-auto bg-gray-50">
                <Routes>
                    <Route path="picklists/:category" element={<PicklistContentPane />} />
                    <Route path="custom-fields" element={<CustomFieldsInline />} />
                    <Route index element={<Navigate to={`picklists/${obj.picklists[0].key}`} replace />} />
                </Routes>
            </div>
        </div>
    );
}

// ─── Global Picklists ─────────────────────────────────────────────────────────

function GlobalPicklistsView() {
    const navigate = useNavigate();

    return (
        <div className="flex h-full min-h-0">
            <aside className="w-52 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
                <div className="px-4 pt-4 pb-3.5 border-b border-gray-100">
                    <button
                        onClick={() => navigate("/system-settings/fields")}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-2.5 transition-colors"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        All objects
                    </button>
                    <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-sm shrink-0 bg-violet-400" />
                        <span className="text-sm font-semibold text-gray-900">Global</span>
                    </div>
                </div>

                <nav className="flex-1 py-2.5">
                    <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                        Picklists
                    </p>
                    {GLOBAL_PICKLISTS.map(item => (
                        <NavLink
                            key={item.key}
                            to={`/system-settings/global/${item.key}`}
                            className={({ isActive }) =>
                                `flex items-center w-full px-4 py-[7px] text-sm transition-colors border-r-2 ${
                                    isActive
                                        ? "bg-violet-50 text-violet-800 font-medium border-violet-400"
                                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-transparent"
                                }`
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            <div className="flex-1 overflow-y-auto bg-gray-50">
                <Routes>
                    <Route path=":category" element={<PicklistContentPane />} />
                    <Route index element={<Navigate to={GLOBAL_PICKLISTS[0].key} replace />} />
                </Routes>
            </div>
        </div>
    );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
    return (
        <div className="px-8 py-8 max-w-2xl">
            <div className="mb-8">
                <h2 className="text-[15px] font-semibold text-gray-900">User Management</h2>
                <p className="text-sm text-gray-500 mt-1">Manage user roles, permissions, and access.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-6 py-10 text-center">
                <p className="text-sm text-gray-400">Full user management is available in <span className="font-medium text-gray-600">Settings → Users</span>.</p>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
    { label: "Object & Field Settings", matchPath: ["/system-settings/fields", "/system-settings/global"], path: "fields" },
    { label: "User Management",         matchPath: ["/system-settings/users"],                              path: "users" },
];

export default function SystemSettingsPage() {
    const location = useLocation();

    const activeTab = TABS.find(t =>
        t.matchPath.some(p => location.pathname === p || location.pathname.startsWith(p + "/"))
    ) ?? TABS[0];

    return (
        <div className="flex flex-col h-full min-h-0 bg-gray-50">
            {/* Page header */}
            <div className="bg-white border-b border-gray-200 px-8 pt-5 shrink-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.12em] mb-3">
                    System Settings
                </p>
                <div className="flex gap-0 -mb-px">
                    {TABS.map(tab => {
                        const isActive = tab === activeTab;
                        return (
                            <NavLink
                                key={tab.path}
                                to={`/system-settings/${tab.path}`}
                                className={`mr-7 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                                    isActive
                                        ? "border-gray-900 text-gray-900"
                                        : "border-transparent text-gray-500 hover:text-gray-700"
                                }`}
                            >
                                {tab.label}
                            </NavLink>
                        );
                    })}
                </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <Routes>
                    <Route index element={<Navigate to="fields" replace />} />
                    <Route path="fields" element={<FieldsOverview />} />
                    <Route path="fields/:model/*" element={<ObjectDetail />} />
                    <Route path="global/*" element={<GlobalPicklistsView />} />
                    <Route path="users" element={<UsersTab />} />
                    {/* Legacy URLs from old navigation — redirect to new structure */}
                    <Route path="picklists/:category" element={<LegacyPicklistRedirect />} />
                    <Route path="custom-fields/:model" element={<LegacyCustomFieldsRedirect />} />
                </Routes>
            </div>
        </div>
    );
}
