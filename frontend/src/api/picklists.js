import apiClient from "./apiClient";

const BASE = "/api/core/picklist-admin";

export async function fetchPicklistCategories() {
    const res = await apiClient.get(`${BASE}/categories/`);
    return res.data;
}

export async function fetchPicklistValues(category) {
    const res = await apiClient.get(`${BASE}/`, { params: { category } });
    return res.data;
}

export async function createPicklistValue(data) {
    const res = await apiClient.post(`${BASE}/`, data);
    return res.data;
}

export async function updatePicklistValue(id, data) {
    const res = await apiClient.patch(`${BASE}/${id}/`, data);
    return res.data;
}

export async function deletePicklistValue(id) {
    await apiClient.delete(`${BASE}/${id}/`);
}

export async function reorderPicklistValues(category, orderedIds) {
    const res = await apiClient.post(`${BASE}/reorder/`, { category, ordered_ids: orderedIds });
    return res.data;
}
