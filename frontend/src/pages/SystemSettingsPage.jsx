import { useEffect, useRef, useState } from "react";
import { NavLink, Routes, Route, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import PicklistContentPane from "../features/Settings/PicklistContentPane";
import CustomFieldsInline from "../features/Settings/CustomFieldsInline";
import { fetchCustomFields } from "../api/customFields";
import {
    getEmailSettings, updateEmailSettings,
    createEmailDomain, getEmailDomain, verifyEmailDomain, deleteEmailDomain,
} from "../api/emailSettings";
import { getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from "../api/emails";
import RichTextEditor from "../components/RichTextEditor";
import UserManagementPage from "./UserManagementPage";

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

// ─── Email Settings ───────────────────────────────────────────────────────────

function DnsRecordsTable({ records }) {
    const [copiedIdx, setCopiedIdx] = useState(null);

    function copy(value, idx) {
        navigator.clipboard?.writeText(value);
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx(null), 1500);
    }

    if (!records?.length) return null;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-left text-gray-400 uppercase tracking-wide">
                        <th className="py-1.5 pr-3 font-semibold">Type</th>
                        <th className="py-1.5 pr-3 font-semibold">Host / Name</th>
                        <th className="py-1.5 pr-3 font-semibold">Value</th>
                        <th className="py-1.5 font-semibold">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {records.map((rec, idx) => (
                        <tr key={idx}>
                            <td className="py-2 pr-3 font-mono text-gray-700">{rec.type ?? rec.record}</td>
                            <td className="py-2 pr-3 font-mono text-gray-700 break-all">{rec.name}</td>
                            <td className="py-2 pr-3">
                                <button
                                    type="button"
                                    onClick={() => copy(rec.value, idx)}
                                    title="Click to copy"
                                    className="font-mono text-gray-600 hover:text-gray-900 break-all text-left max-w-[220px] inline-block truncate align-middle"
                                >
                                    {copiedIdx === idx ? "Copied!" : rec.value}
                                </button>
                            </td>
                            <td className="py-2">
                                {rec.status === 'verified' ? (
                                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Verified" />
                                ) : (
                                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title={rec.status || 'pending'} />
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function EmailSettingsPanel() {
    const [settings, setSettings] = useState(null);
    const [fromName, setFromName] = useState("");
    const [sendingSlug, setSendingSlug] = useState("");
    const [replyForwardEmail, setReplyForwardEmail] = useState("");
    const [fromEmail, setFromEmail] = useState("");
    const [newDomain, setNewDomain] = useState("");
    const [saving, setSaving] = useState(false);
    const [domainBusy, setDomainBusy] = useState(false);
    const [error, setError] = useState(null);

    function applySettings(data) {
        setSettings(data);
        setFromName(data.from_name ?? "");
        setSendingSlug(data.sending_slug ?? "");
        setReplyForwardEmail(data.reply_forward_email ?? "");
        setFromEmail(data.from_email ?? "");
    }

    useEffect(() => {
        getEmailSettings().then(applySettings).catch(() => setError("Failed to load email settings."));
    }, []);

    const isDirty = settings && (
        fromName !== (settings.from_name ?? "") ||
        sendingSlug !== (settings.sending_slug ?? "") ||
        replyForwardEmail !== (settings.reply_forward_email ?? "") ||
        fromEmail !== (settings.from_email ?? "")
    );

    async function handleSave() {
        setSaving(true);
        setError(null);
        try {
            const updated = await updateEmailSettings({
                from_name: fromName,
                sending_slug: sendingSlug,
                reply_forward_email: replyForwardEmail,
                from_email: fromEmail,
            });
            applySettings(updated);
        } catch (err) {
            setError(err?.response?.data?.detail ?? "Failed to save settings.");
        } finally {
            setSaving(false);
        }
    }

    async function handleConnectDomain() {
        if (!newDomain.trim()) return;
        setDomainBusy(true);
        setError(null);
        try {
            applySettings(await createEmailDomain(newDomain.trim()));
            setNewDomain("");
        } catch (err) {
            setError(err?.response?.data?.detail ?? "Failed to connect domain.");
        } finally {
            setDomainBusy(false);
        }
    }

    async function handleVerifyDomain() {
        setDomainBusy(true);
        setError(null);
        try {
            applySettings(await verifyEmailDomain());
        } catch (err) {
            setError(err?.response?.data?.detail ?? "Verification check failed.");
        } finally {
            setDomainBusy(false);
        }
    }

    async function handleRemoveDomain() {
        if (!window.confirm("Remove this domain? Emails will be sent from your default platform address again.")) return;
        setDomainBusy(true);
        setError(null);
        try {
            applySettings(await deleteEmailDomain());
        } catch (err) {
            setError(err?.response?.data?.detail ?? "Failed to remove domain.");
        } finally {
            setDomainBusy(false);
        }
    }

    // Refresh DNS record status from the server while verification is pending.
    useEffect(() => {
        if (settings?.domain_status !== 'pending') return;
        const interval = setInterval(() => {
            getEmailDomain().then(applySettings).catch(() => {});
        }, 10000);
        return () => clearInterval(interval);
    }, [settings?.domain_status]);

    if (!settings) {
        return (
            <div className="px-8 py-8 text-sm text-gray-400">
                {error ?? "Loading…"}
            </div>
        );
    }

    const domainStatus = settings.domain_status ?? 'none';
    const slugPreview = settings.default_from_address ?? "";

    return (
        <div className="px-8 py-8 max-w-xl">
            <div className="mb-8">
                <h2 className="text-[15px] font-semibold text-gray-900">Email Settings</h2>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    Configure how emails to your customers are sent.
                    System emails (password resets, invitations) always come from the platform address.
                </p>
            </div>

            {/* ── Sender identity ── */}
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
                <div className="px-5 py-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Display name
                    </label>
                    <input
                        type="text"
                        value={fromName}
                        onChange={e => setFromName(e.target.value)}
                        placeholder="e.g. Best Repairs"
                        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-400 mt-1">Shown as the sender name in your customers' inboxes.</p>
                </div>

                <div className="px-5 py-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Default sending address
                    </label>
                    <div className="flex items-center gap-1.5">
                        <input
                            type="text"
                            value={sendingSlug}
                            onChange={e => setSendingSlug(e.target.value.toLowerCase())}
                            className="w-40 text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono"
                        />
                        <span className="text-sm text-gray-500 font-mono">@{slugPreview.split('@')[1] ?? ''}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                        Works out of the box — no setup needed. Used unless you verify a custom domain below.
                    </p>
                </div>

                <div className="px-5 py-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Forward replies to
                    </label>
                    <input
                        type="email"
                        value={replyForwardEmail}
                        onChange={e => setReplyForwardEmail(e.target.value)}
                        placeholder="e.g. andrzej@yourshop.com"
                        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        Customer replies are captured in the app and also forwarded to this inbox.
                    </p>
                </div>

                <div className="px-5 py-4 flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || saving}
                        className="text-sm font-medium px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>

            {/* ── Custom domain (optional) ── */}
            <div className="mt-6 bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
                <div className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900">Custom sending domain</h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Optional: send from your own address (e.g. andrzej@yourshop.com) by verifying your domain.
                            </p>
                        </div>
                        {domainStatus === 'verified' && (
                            <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                {settings.custom_domain} verified
                            </span>
                        )}
                        {domainStatus === 'pending' && (
                            <span className="shrink-0 inline-flex items-center text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">
                                Pending DNS verification
                            </span>
                        )}
                        {domainStatus === 'failed' && (
                            <span className="shrink-0 inline-flex items-center text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-full px-2.5 py-1">
                                Verification failed
                            </span>
                        )}
                    </div>
                </div>

                {domainStatus === 'none' && (
                    <div className="px-5 py-4 flex items-center gap-2">
                        <input
                            type="text"
                            value={newDomain}
                            onChange={e => setNewDomain(e.target.value)}
                            placeholder="yourshop.com"
                            className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono"
                        />
                        <button
                            onClick={handleConnectDomain}
                            disabled={!newDomain.trim() || domainBusy}
                            className="text-sm font-medium px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {domainBusy ? "Connecting…" : "Connect domain"}
                        </button>
                    </div>
                )}

                {(domainStatus === 'pending' || domainStatus === 'failed') && (
                    <>
                        <div className="px-5 py-4">
                            <p className="text-xs text-gray-500 mb-3">
                                Add these DNS records at your domain provider for{" "}
                                <span className="font-mono font-medium text-gray-700">{settings.custom_domain}</span>,
                                then check verification. DNS changes can take up to an hour to propagate.
                            </p>
                            <DnsRecordsTable records={settings.dns_records} />
                        </div>
                        <div className="px-5 py-4 flex items-center gap-3">
                            <button
                                onClick={handleVerifyDomain}
                                disabled={domainBusy}
                                className="text-sm font-medium px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {domainBusy ? "Checking…" : "Check verification"}
                            </button>
                            <button
                                onClick={handleRemoveDomain}
                                disabled={domainBusy}
                                className="text-sm font-medium px-4 py-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Remove domain
                            </button>
                        </div>
                    </>
                )}

                {domainStatus === 'verified' && (
                    <>
                        <div className="px-5 py-4">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                From email address
                            </label>
                            <input
                                type="email"
                                value={fromEmail}
                                onChange={e => setFromEmail(e.target.value)}
                                placeholder={`e.g. repairs@${settings.custom_domain}`}
                                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Must be an address on <span className="font-mono">{settings.custom_domain}</span>.
                                Save above to apply.
                            </p>
                        </div>
                        <div className="px-5 py-4">
                            <button
                                onClick={handleRemoveDomain}
                                disabled={domainBusy}
                                className="text-sm font-medium px-4 py-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Remove domain
                            </button>
                        </div>
                    </>
                )}
            </div>

            {error && (
                <p className="mt-4 text-sm text-red-600">{error}</p>
            )}
        </div>
    );
}

// ─── Email Templates ──────────────────────────────────────────────────────────

function EmailTemplatesPanel() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null); // null = new template
    const [form, setForm] = useState({ name: '', subject: '', body_html: '' });
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const editorRef = useRef(null);

    useEffect(() => {
        getEmailTemplates()
            .then(setTemplates)
            .finally(() => setLoading(false));
    }, []);

    function loadIntoEditor(t) {
        setSelectedId(t.id);
        setForm({ name: t.name, subject: t.subject ?? '', body_html: t.body_html ?? '' });
        editorRef.current?.commands.setContent(t.body_html ?? '');
        setDirty(false);
    }

    function startNew() {
        setSelectedId(null);
        setForm({ name: '', subject: '', body_html: '' });
        editorRef.current?.commands.clearContent();
        setDirty(false);
    }

    function handleFormChange(field, value) {
        setForm(f => ({ ...f, [field]: value }));
        setDirty(true);
    }

    async function handleSave() {
        if (!form.name.trim()) return;
        const body_html = editorRef.current?.getHTML() ?? '';
        setSaving(true);
        try {
            if (selectedId) {
                const updated = await updateEmailTemplate(selectedId, { ...form, body_html });
                setTemplates(prev => prev.map(t => t.id === selectedId ? updated : t));
            } else {
                const created = await createEmailTemplate({ ...form, body_html });
                setTemplates(prev => [...prev, created]);
                setSelectedId(created.id);
            }
            setDirty(false);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id) {
        if (!confirm('Delete this template?')) return;
        await deleteEmailTemplate(id);
        setTemplates(prev => prev.filter(t => t.id !== id));
        if (selectedId === id) startNew();
    }

    return (
        <div className="flex h-full min-h-0">
            {/* ── Template list ── */}
            <div className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Templates</span>
                    <button
                        onClick={startNew}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                        + New
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>
                    ) : templates.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-gray-400 text-center">No templates yet.<br/>Click + New to create one.</p>
                    ) : (
                        templates.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => loadIntoEditor(t)}
                                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors group ${
                                    selectedId === t.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                                }`}
                            >
                                <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                                {t.subject && (
                                    <p className="text-xs text-gray-400 truncate mt-0.5">{t.subject}</p>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* ── Editor pane ── */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto">
                <div className="p-6 max-w-3xl w-full">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-[15px] font-semibold text-gray-900">
                            {selectedId ? 'Edit template' : 'New template'}
                        </h2>
                        {selectedId && (
                            <button
                                onClick={() => handleDelete(selectedId)}
                                className="text-sm text-red-500 hover:text-red-700"
                            >
                                Delete
                            </button>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                Template name <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={e => handleFormChange('name', e.target.value)}
                                placeholder="e.g. Repair completed"
                                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                Default subject
                            </label>
                            <input
                                type="text"
                                value={form.subject}
                                onChange={e => handleFormChange('subject', e.target.value)}
                                placeholder="e.g. Your repair is ready for pickup"
                                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                Body
                            </label>
                            <RichTextEditor
                                onReady={editor => { editorRef.current = editor; }}
                                placeholder="Write your template body…"
                                minHeight="320px"
                            />
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                            <button
                                onClick={handleSave}
                                disabled={!form.name.trim() || saving}
                                className="text-sm font-medium px-4 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
                            </button>
                            {dirty && (
                                <span className="text-xs text-gray-400">Unsaved changes</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
    { label: "Object & Field Settings", matchPath: ["/system-settings/fields", "/system-settings/global"], path: "fields" },
    { label: "User Management",         matchPath: ["/system-settings/users"],                              path: "users" },
    { label: "Email",                   matchPath: ["/system-settings/email"],                              path: "email" },
    { label: "Email Templates",         matchPath: ["/system-settings/email-templates"],                    path: "email-templates" },
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
                    <Route path="users" element={<UserManagementPage />} />
                    <Route path="email" element={<EmailSettingsPanel />} />
                    <Route path="email-templates" element={<EmailTemplatesPanel />} />
                    {/* Legacy URLs from old navigation — redirect to new structure */}
                    <Route path="picklists/:category" element={<LegacyPicklistRedirect />} />
                    <Route path="custom-fields/:model" element={<LegacyCustomFieldsRedirect />} />
                </Routes>
            </div>
        </div>
    );
}
