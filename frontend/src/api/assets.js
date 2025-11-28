import apiClient from "./apiClient";

export async function resolveAsset({ customer_id, device_id, serial_number }) {
    try {
        const response = await apiClient.post("/api/customers/api/assets/resolve/", {
            customer_id,
            device_id,
            serial_number,
        });

        return response.data;
    } catch (error) {
        throw new Error("Failed to resolve asset");
    }
}

export async function fetchCustomerAssets(customerId){
    try {
        const response = await apiClient.get(`/api/customers/api/customers/${customerId}/assets/`);
        return response.data;
    } catch (error) {
        console.error("Failed to fetch customer assets:", error);
        throw new Error("Failed to fetch customer assets");
    }
}
