import api from "./apiClient";

export async function createCustomer(payload) {
    const { data } = await api.post("/customers/api/customers/", payload, {
        headers: { "Content-Type": "application/json" },
    });
    return data;
}

export async function listCustomers(params = {}) {
    const { data } = await api.get("/customers/api/customers/", { params });
    return data;
}
