import { useCallback, useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import {
    fetchTenantUsers, createUser, updateUser, sendPasswordReset,
    fetchRoles, createRole, updateRole, deleteRole,
    fetchPermissions, fetchRolePermissions, addRolePermission, removeRolePermission,
    fetchUserRoles, assignRole, removeUserRole,
} from "../api/userManagement";

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(u) {
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.name || u.email;
}

function Badge({ active }) {
    return (
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
            active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
        }`}>
            {active ? "Active" : "Inactive"}
        </span>
    );
}

function Spinner() {
    return <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>;
}

function ErrorMsg({ msg }) {
    return msg ? (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{msg}</div>
    ) : null;
}

function SuccessMsg({ msg }) {
    return msg ? (
        <div className="mb-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">{msg}</div>
    ) : null;
}

function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                    <h3 className="text-base font-semibold text-gray-900">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
            </div>
        </div>
    );
}

// ── Create / Edit User Modal ──────────────────────────────────────────────────

function UserFormModal({ editUser, onClose, onSaved }) {
    const isEdit = Boolean(editUser);
    const [email, setEmail] = useState(editUser?.email ?? "");
    const [firstName, setFirstName] = useState(editUser?.first_name ?? "");
    const [lastName, setLastName] = useState(editUser?.last_name ?? "");
    const [isActive, setIsActive] = useState(editUser?.is_active ?? true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            const data = { email, first_name: firstName, last_name: lastName, is_active: isActive };
            if (isEdit) {
                await updateUser(editUser.id, data);
            } else {
                await createUser(data);
            }
            onSaved();
            onClose();
        } catch (err) {
            const detail = err?.response?.data?.detail || err?.response?.data?.email?.[0] || "Failed to save user.";
            setError(detail);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={isEdit ? "Edit User" : "Invite User"} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-3">
                <ErrorMsg msg={error} />
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={isEdit}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                </div>
                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
                        <input
                            type="text"
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
                        <input
                            type="text"
                            value={lastName}
                            onChange={e => setLastName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                {isEdit && (
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isActive}
                            onChange={e => setIsActive(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-sm text-gray-700">Active</span>
                    </label>
                )}
                {!isEdit && (
                    <p className="text-xs text-gray-400">
                        A setup email will be sent so they can choose their password.
                    </p>
                )}
                <div className="flex gap-2 pt-2">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
                    >
                        {submitting ? "Saving…" : isEdit ? "Save changes" : "Invite user"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </Modal>
    );
}

// ── Role Assign Modal ─────────────────────────────────────────────────────────

function RoleAssignModal({ targetUser, allRoles, onClose, onSaved }) {
    const [userRoles, setUserRoles] = useState([]);
    const [checked, setChecked] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        fetchUserRoles(targetUser.id)
            .then(roles => {
                setUserRoles(roles);
                setChecked(new Set(roles.map(r => r.role.id)));
            })
            .catch(() => setError("Failed to load roles."))
            .finally(() => setLoading(false));
    }, [targetUser.id]);

    const toggle = (roleId) => {
        setChecked(prev => {
            const next = new Set(prev);
            next.has(roleId) ? next.delete(roleId) : next.add(roleId);
            return next;
        });
    };

    const handleSave = async () => {
        setSubmitting(true);
        setError("");
        try {
            const currentIds = new Set(userRoles.map(r => r.role.id));
            const toAdd = [...checked].filter(id => !currentIds.has(id));
            const toRemove = userRoles.filter(r => !checked.has(r.role.id));

            await Promise.all([
                ...toAdd.map(roleId => assignRole(targetUser.id, roleId)),
                ...toRemove.map(ur => removeUserRole(ur.id)),
            ]);

            onSaved();
            onClose();
        } catch {
            setError("Failed to update roles. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={`Roles for ${displayName(targetUser)}`} onClose={onClose}>
            <ErrorMsg msg={error} />
            {loading ? <Spinner /> : (
                <>
                    <div className="space-y-2 mb-4">
                        {allRoles.map(role => (
                            <label key={role.id} className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={checked.has(role.id)}
                                    onChange={() => toggle(role.id)}
                                    className="mt-0.5 rounded border-gray-300 text-blue-600"
                                />
                                <span>
                                    <span className="block text-sm font-medium text-gray-800">{role.name}</span>
                                    {role.description && (
                                        <span className="block text-xs text-gray-400 mt-0.5">{role.description}</span>
                                    )}
                                </span>
                            </label>
                        ))}
                        {allRoles.length === 0 && (
                            <p className="text-sm text-gray-400">No roles defined yet.</p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            disabled={submitting}
                            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
                        >
                            {submitting ? "Saving…" : "Save"}
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
}

// ── Users Panel ───────────────────────────────────────────────────────────────

function UsersPanel() {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [rolesUser, setRolesUser] = useState(null);
    const [resetStatus, setResetStatus] = useState({});

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([fetchTenantUsers(), fetchRoles()])
            .then(([u, r]) => { setUsers(u); setRoles(r); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleToggleActive = async (u) => {
        try {
            await updateUser(u.id, { is_active: !u.is_active });
            load();
        } catch { /* ignore */ }
    };

    const handleSendReset = async (u) => {
        setResetStatus(s => ({ ...s, [u.id]: 'sending' }));
        try {
            await sendPasswordReset(u.id);
            setResetStatus(s => ({ ...s, [u.id]: 'sent' }));
            setTimeout(() => setResetStatus(s => { const n = { ...s }; delete n[u.id]; return n; }), 3000);
        } catch (err) {
            const msg = err?.response?.data?.detail || 'Failed';
            setResetStatus(s => ({ ...s, [u.id]: msg }));
            setTimeout(() => setResetStatus(s => { const n = { ...s }; delete n[u.id]; return n; }), 4000);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h2 className="text-[15px] font-semibold text-gray-900">Users</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Manage who has access to this workspace.</p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Invite user
                </button>
            </div>

            {loading ? <Spinner /> : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                    {users.map(u => (
                        <div key={u.id} className={`flex items-center justify-between px-5 py-3.5 gap-4 ${!u.is_active ? "opacity-60" : ""}`}>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{displayName(u)}</p>
                                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                <Badge active={u.is_active} />
                                <button
                                    onClick={() => handleToggleActive(u)}
                                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors border border-gray-200 rounded px-2 py-0.5"
                                >
                                    {u.is_active ? "Deactivate" : "Activate"}
                                </button>
                                <button
                                    onClick={() => handleSendReset(u)}
                                    disabled={resetStatus[u.id] === 'sending'}
                                    className="text-xs text-blue-600 hover:text-blue-800 transition-colors border border-blue-200 rounded px-2 py-0.5 disabled:opacity-50"
                                >
                                    {resetStatus[u.id] === 'sending' ? 'Sending…'
                                        : resetStatus[u.id] === 'sent' ? 'Sent!'
                                        : resetStatus[u.id] ? resetStatus[u.id]
                                        : 'Send reset'}
                                </button>
                                <button
                                    onClick={() => setRolesUser(u)}
                                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors border border-gray-200 rounded px-2 py-0.5"
                                >
                                    Roles
                                </button>
                                <button
                                    onClick={() => setEditUser(u)}
                                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors border border-gray-200 rounded px-2 py-0.5"
                                >
                                    Edit
                                </button>
                            </div>
                        </div>
                    ))}
                    {users.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">No users yet. Invite someone to get started.</p>
                    )}
                </div>
            )}

            {showCreate && (
                <UserFormModal onClose={() => setShowCreate(false)} onSaved={load} />
            )}
            {editUser && (
                <UserFormModal editUser={editUser} onClose={() => setEditUser(null)} onSaved={load} />
            )}
            {rolesUser && (
                <RoleAssignModal
                    targetUser={rolesUser}
                    allRoles={roles}
                    onClose={() => setRolesUser(null)}
                    onSaved={load}
                />
            )}
        </div>
    );
}

// ── Permission Modal ──────────────────────────────────────────────────────────

function RolePermissionsModal({ role, onClose }) {
    const [allPerms, setAllPerms] = useState([]);
    const [currentRolePerms, setCurrentRolePerms] = useState([]);
    const [checked, setChecked] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        Promise.all([fetchPermissions(), fetchRolePermissions(role.id)])
            .then(([perms, rolePerms]) => {
                setAllPerms(perms);
                setCurrentRolePerms(rolePerms);
                setChecked(new Set(rolePerms.map(rp => rp.permission.id)));
            })
            .catch(() => setError("Failed to load permissions."))
            .finally(() => setLoading(false));
    }, [role.id]);

    const toggle = (permId) => {
        setChecked(prev => {
            const next = new Set(prev);
            next.has(permId) ? next.delete(permId) : next.add(permId);
            return next;
        });
    };

    const handleSave = async () => {
        setSubmitting(true);
        setError("");
        setSuccess("");
        try {
            const currentIds = new Set(currentRolePerms.map(rp => rp.permission.id));
            const toAdd = [...checked].filter(id => !currentIds.has(id));
            const toRemove = currentRolePerms.filter(rp => !checked.has(rp.permission.id));

            await Promise.all([
                ...toAdd.map(permId => addRolePermission(role.id, permId)),
                ...toRemove.map(rp => removeRolePermission(rp.id)),
            ]);

            // Refresh current role perms
            const updated = await fetchRolePermissions(role.id);
            setCurrentRolePerms(updated);
            setChecked(new Set(updated.map(rp => rp.permission.id)));
            setSuccess("Permissions saved.");
        } catch {
            setError("Failed to update permissions. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    // Group permissions by app label
    const grouped = allPerms.reduce((acc, p) => {
        const app = p.content_type;
        if (!acc[app]) acc[app] = [];
        acc[app].push(p);
        return acc;
    }, {});

    return (
        <Modal title={`Permissions — ${role.name}`} onClose={onClose}>
            <ErrorMsg msg={error} />
            <SuccessMsg msg={success} />
            {loading ? <Spinner /> : (
                <>
                    <div className="space-y-4 mb-4">
                        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([app, perms]) => (
                            <div key={app}>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-1.5">{app}</p>
                                <div className="space-y-1">
                                    {perms.map(p => (
                                        <label key={p.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                                            <input
                                                type="checkbox"
                                                checked={checked.has(p.id)}
                                                onChange={() => toggle(p.id)}
                                                className="rounded border-gray-300 text-blue-600 shrink-0"
                                            />
                                            <span className="text-sm text-gray-700">{p.name}</span>
                                            <code className="text-[10px] text-gray-400 ml-auto shrink-0">{p.codename}</code>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {allPerms.length === 0 && (
                            <p className="text-sm text-gray-400">No permissions available.</p>
                        )}
                    </div>
                    <div className="flex gap-2 sticky bottom-0 bg-white pt-2">
                        <button
                            onClick={handleSave}
                            disabled={submitting}
                            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
                        >
                            {submitting ? "Saving…" : "Save permissions"}
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
}

// ── Role Form Modal ───────────────────────────────────────────────────────────

function RoleFormModal({ editRole, onClose, onSaved }) {
    const isEdit = Boolean(editRole);
    const [name, setName] = useState(editRole?.name ?? "");
    const [description, setDescription] = useState(editRole?.description ?? "");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            if (isEdit) {
                await updateRole(editRole.id, { name, description });
            } else {
                await createRole({ name, description });
            }
            onSaved();
            onClose();
        } catch (err) {
            const detail = err?.response?.data?.detail || err?.response?.data?.name?.[0] || "Failed to save role.";
            setError(detail);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={isEdit ? "Edit Role" : "Create Role"} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-3">
                <ErrorMsg msg={error} />
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Role name</label>
                    <input
                        type="text"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        rows={2}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                </div>
                <div className="flex gap-2 pt-1">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
                    >
                        {submitting ? "Saving…" : isEdit ? "Save changes" : "Create role"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </Modal>
    );
}

// ── Roles Panel ───────────────────────────────────────────────────────────────

function RolesPanel() {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editRole, setEditRole] = useState(null);
    const [permRole, setPermRole] = useState(null);
    const [deleteError, setDeleteError] = useState("");

    const load = useCallback(() => {
        setLoading(true);
        fetchRoles().then(setRoles).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (role) => {
        if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
        setDeleteError("");
        try {
            await deleteRole(role.id);
            load();
        } catch (err) {
            const msg = err?.response?.data?.detail || "Failed to delete role.";
            setDeleteError(msg);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h2 className="text-[15px] font-semibold text-gray-900">Roles</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Define what each role can do within this workspace.</p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create role
                </button>
            </div>

            {deleteError && <ErrorMsg msg={deleteError} />}

            {loading ? <Spinner /> : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
                    {roles.map(role => (
                        <div key={role.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900">{role.name}</p>
                                {role.description && (
                                    <p className="text-xs text-gray-400 mt-0.5 truncate">{role.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setPermRole(role)}
                                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors border border-gray-200 rounded px-2 py-0.5"
                                >
                                    Permissions
                                </button>
                                <button
                                    onClick={() => setEditRole(role)}
                                    className="text-xs text-gray-500 hover:text-gray-800 transition-colors border border-gray-200 rounded px-2 py-0.5"
                                >
                                    Edit
                                </button>
                                {role.name !== 'Tenant Admin' && (
                                    <button
                                        onClick={() => handleDelete(role)}
                                        className="text-xs text-red-500 hover:text-red-700 transition-colors border border-red-200 rounded px-2 py-0.5"
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {roles.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-8">No roles yet.</p>
                    )}
                </div>
            )}

            {showCreate && <RoleFormModal onClose={() => setShowCreate(false)} onSaved={load} />}
            {editRole && <RoleFormModal editRole={editRole} onClose={() => setEditRole(null)} onSaved={load} />}
            {permRole && <RolePermissionsModal role={permRole} onClose={() => setPermRole(null)} />}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
    const { user, permissions } = useUser();
    const isAdmin = user?.is_superuser || permissions.some(p => p.permission_codename === 'manage_users');
    const [tab, setTab] = useState('users');

    if (!isAdmin) {
        return (
            <div className="px-8 py-8 max-w-2xl">
                <div className="bg-white border border-gray-200 rounded-lg px-6 py-10 text-center">
                    <p className="text-sm text-gray-400">User management is only available to administrators.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="px-8 py-8 max-w-4xl">
            <div className="flex gap-6 border-b border-gray-200 mb-6">
                {['users', 'roles'].map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`pb-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                            tab === t
                                ? "border-gray-900 text-gray-900"
                                : "border-transparent text-gray-400 hover:text-gray-600"
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {tab === 'users' ? <UsersPanel /> : <RolesPanel />}
        </div>
    );
}
