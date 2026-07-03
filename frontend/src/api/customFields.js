import apiClient from "./apiClient";

const BASE = "/api/core/custom-fields";

export async function fetchCustomFields(modelName, activeOnly = true) {
    const params = {};
    if (modelName) params.model_name = modelName;
    if (activeOnly) params.is_active = "true";
    const res = await apiClient.get(`${BASE}/`, { params });
    return res.data.results ?? res.data;
}

export async function createCustomField(data) {
    const res = await apiClient.post(`${BASE}/`, data);
    return res.data;
}

export async function updateCustomField(id, data) {
    const res = await apiClient.patch(`${BASE}/${id}/`, data);
    return res.data;
}

export async function deleteCustomField(id) {
    const res = await apiClient.delete(`${BASE}/${id}/`);
    return res.data;
}
