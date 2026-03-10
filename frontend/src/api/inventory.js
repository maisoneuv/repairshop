import apiClient from "./apiClient";

// ── Inventory Items (parts catalog) ─────────────────────────────────

export async function fetchInventoryItems(params = {}) {
    const response = await apiClient.get("/api/inventory/api/items/", { params });
    return response.data;
}

export async function fetchInventoryItem(id) {
    const response = await apiClient.get(`/api/inventory/api/items/${id}/`);
    return response.data;
}

export async function createInventoryItem(data) {
    const response = await apiClient.post("/api/inventory/api/items/", data);
    return response.data;
}

export async function updateInventoryItem(id, data) {
    const response = await apiClient.patch(`/api/inventory/api/items/${id}/`, data);
    return response.data;
}

export async function deleteInventoryItem(id) {
    await apiClient.delete(`/api/inventory/api/items/${id}/`);
}

export async function searchInventoryItems(query) {
    const response = await apiClient.get("/api/inventory/api/items/", {
        params: { search: query },
    });
    const data = response.data;
    return Array.isArray(data) ? data : data?.results || [];
}

// ── Inventory Lists (locations) ─────────────────────────────────────

export async function fetchInventoryLists(params = {}) {
    const response = await apiClient.get("/api/inventory/api/lists/", { params });
    return response.data;
}

// ── Inventory Balances (stock per location) ─────────────────────────

export async function fetchInventoryBalances(params = {}) {
    const response = await apiClient.get("/api/inventory/api/balances/", { params });
    return response.data;
}

export async function updateInventoryBalance(id, data) {
    const response = await apiClient.patch(`/api/inventory/api/balances/${id}/`, data);
    return response.data;
}

// ── Stock Adjustment ────────────────────────────────────────────────

export async function adjustStock(data) {
    const response = await apiClient.post("/api/inventory/api/stock-adjustment/", data);
    return response.data;
}

// ── Receive Delivery ────────────────────────────────────────────────

export async function resolveSKU(sku) {
    const response = await apiClient.get("/api/inventory/api/sku-resolve/", {
        params: { sku },
    });
    return response.data;
}

export async function fetchMyDefaultLocation() {
    const response = await apiClient.get("/api/inventory/api/my-default-location/");
    return response.data;
}

export async function receiveDelivery(lines) {
    const response = await apiClient.post("/api/inventory/api/receive/", { lines });
    return response.data;
}

// ── Work Item Parts (consume/return parts for repairs) ──────────────

export async function fetchWorkItemParts(workItemId) {
    const response = await apiClient.get(`/api/inventory/api/work-item-parts/${workItemId}/`);
    return response.data;
}

export async function consumePart(workItemId, data) {
    const response = await apiClient.post(`/api/inventory/api/work-item-parts/${workItemId}/`, data);
    return response.data;
}

export async function returnPart(workItemId, transactionId) {
    await apiClient.delete(`/api/inventory/api/work-item-parts/${workItemId}/${transactionId}/`);
}
