import apiClient from "./apiClient";

export async function fetchDashboard() {
  try {
    const response = await apiClient.get("/api/tasks/dashboard/");
    return response.data;
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    throw new Error("Failed to load dashboard");
  }
}
