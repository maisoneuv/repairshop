import { getCSRFToken } from "../utils/csrf";
import apiClient from "./apiClient";

export async function fetchCashRegisters(params = {}) {
  try {
    const response = await apiClient.get("/api/service/cash-registers/", { params });
    return response.data;
  } catch (error) {
    console.error("Error fetching cash registers:", error);
    throw new Error("Failed to fetch cash registers");
  }
}

export async function fetchCashRegister(id) {
  try {
    const response = await apiClient.get(`/api/service/cash-registers/${id}/`);
    return response.data;
  } catch (error) {
    console.error("Error fetching cash register:", error);
    throw new Error("Failed to fetch cash register");
  }
}

export async function createCashRegister(data) {
  try {
    const response = await apiClient.post("/api/service/cash-registers/", data, {
      headers: { "X-CSRFToken": getCSRFToken() },
    });
    return response.data;
  } catch (error) {
    console.error("Error creating cash register:", error);
    if (error.response?.data) throw error.response.data;
    throw new Error("Failed to create cash register");
  }
}

export async function updateCashRegister(id, data) {
  try {
    const response = await apiClient.patch(`/api/service/cash-registers/${id}/`, data, {
      headers: { "X-CSRFToken": getCSRFToken() },
    });
    return response.data;
  } catch (error) {
    console.error("Error updating cash register:", error);
    if (error.response?.data) throw error.response.data;
    throw new Error("Failed to update cash register");
  }
}

export async function fetchCashTransactions(params = {}) {
  try {
    const response = await apiClient.get("/api/service/cash-transactions/", { params });
    return response.data;
  } catch (error) {
    console.error("Error fetching cash transactions:", error);
    throw new Error("Failed to fetch cash transactions");
  }
}

export async function createCashTransaction(data) {
  try {
    const response = await apiClient.post("/api/service/cash-transactions/", data, {
      headers: { "X-CSRFToken": getCSRFToken() },
    });
    return response.data;
  } catch (error) {
    console.error("Error creating cash transaction:", error);
    if (error.response?.data) throw error.response.data;
    throw new Error("Failed to create cash transaction");
  }
}

export async function transferBetweenRegisters(data) {
  try {
    const response = await apiClient.post("/api/service/api/cash-registers/transfer/", data, {
      headers: { "X-CSRFToken": getCSRFToken() },
    });
    return response.data;
  } catch (error) {
    console.error("Error transferring between registers:", error);
    if (error.response?.data) throw error.response.data;
    throw new Error("Failed to transfer between registers");
  }
}
