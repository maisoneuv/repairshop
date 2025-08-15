import apiClient from "./apiClient";

export async function resolveAsset({ customer_id, device_id, serial_number }) {
    const res = await fetch("http://localhost:8000/customers/api/assets/resolve/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customer_id, device_id, serial_number })
    });

    if (!res.ok) {
        throw new Error("Failed to resolve asset");
    }

    return res.json();
}

export async function fetchCustomerAssets(customerId){
    try {
        const response = await apiClient.get(`/customers/api/customers/${customerId}/assets/`);
        return response.data;
    } catch (error) {
        console.error("Failed to fetch customer assets:", error);
        throw new Error("Failed to fetch customer assets");
    }
}