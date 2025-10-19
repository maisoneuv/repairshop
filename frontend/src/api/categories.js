import apiClient from "./apiClient";

export async function createCategory(name) {
    try {
        const response = await apiClient.post("/inventory/api/category/", { name });
        return response.data;
    } catch (error) {
        console.error("Category creation failed:", error);
        throw new Error("Failed to create category");
    }
}
