import apiClient from "./apiClient";

// ── Users ─────────────────────────────────────────────────────────────────────

export async function fetchTenantUsers() {
    const res = await apiClient.get("/api/core/users/");
    return res.data.results ?? res.data;
}

export async function createUser(data) {
    const res = await apiClient.post("/api/core/users/", data);
    return res.data;
}

export async function updateUser(id, data) {
    const res = await apiClient.patch(`/api/core/users/${id}/`, data);
    return res.data;
}

export async function sendPasswordReset(userId) {
    const res = await apiClient.post(`/api/core/users/${userId}/send-reset/`);
    return res.data;
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function fetchRoles() {
    const res = await apiClient.get("/api/core/roles/");
    return res.data.results ?? res.data;
}

export async function createRole(data) {
    const res = await apiClient.post("/api/core/roles/", data);
    return res.data;
}

export async function updateRole(id, data) {
    const res = await apiClient.patch(`/api/core/roles/${id}/`, data);
    return res.data;
}

export async function deleteRole(id) {
    await apiClient.delete(`/api/core/roles/${id}/`);
}

// ── Permissions catalog ───────────────────────────────────────────────────────

export async function fetchPermissions() {
    const res = await apiClient.get("/api/core/permissions/");
    return res.data.results ?? res.data;
}

// ── Role permissions ──────────────────────────────────────────────────────────

export async function fetchRolePermissions(roleId) {
    const res = await apiClient.get("/api/core/role-permissions/", { params: { role: roleId } });
    return res.data.results ?? res.data;
}

export async function addRolePermission(roleId, permissionId) {
    const res = await apiClient.post("/api/core/role-permissions/", { role: roleId, permission_id: permissionId });
    return res.data;
}

export async function removeRolePermission(id) {
    await apiClient.delete(`/api/core/role-permissions/${id}/`);
}

// ── User roles ────────────────────────────────────────────────────────────────

export async function fetchUserRoles(userId) {
    const res = await apiClient.get("/api/core/user-roles/", { params: { user: userId } });
    return res.data.results ?? res.data;
}

export async function assignRole(userId, roleId) {
    const res = await apiClient.post("/api/core/user-roles/", { user: userId, role: roleId });
    return res.data;
}

export async function removeUserRole(userRoleId) {
    await apiClient.delete(`/api/core/user-roles/${userRoleId}/`);
}
