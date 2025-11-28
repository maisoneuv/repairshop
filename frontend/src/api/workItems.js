import { getCSRFToken } from "../utils/csrf";
import apiClient from './apiClient';

function deriveTenantFromHost() {
  const [maybeTenant] = window.location.hostname.split(".");
  return maybeTenant || null;
}

export async function fetchWorkItems(params = {}){
  try {
    const response = await apiClient.get('/api/tasks/work-items/', { params });
    return response.data;
  } catch(error) {
    console.error("Error fetching work items:", error);
    throw new Error("Failed to fetch work items");
  }
}

export async function fetchWorkItemSchema(){
  try {
    const response = await apiClient.get("/api/tasks/api/schema/work-item/");
    console.log('schema',response);
    return response.data;
  } catch (error) {
    console.error("Error fetching work item schema:", error);
    throw new Error("Failed to fetch work item schema");
  }
}

export async function createWorkItem(data) {
  const tenant = deriveTenantFromHost();
  try {
    console.log(data);
    const response = await apiClient.post(
        '/api/tasks/work-items/',
        data,
        {
          headers: {
            "X-CSRFToken": getCSRFToken(),
            "X-Tenant": tenant,
            "Content-Type": "application/json"
          },
        }
    );
    return response.data;
  } catch (error) {
    console.error("Error creating work item:", error);

    if (error.response && error.response.data) {
      throw error.response.data;  // DRF validation errors
    }

    throw new Error("Failed to create work item");
  }
}

export async function updateWorkItemField(id, patchData) {
  try {
    const response = await apiClient.patch(
      `/api/tasks/work-items/${id}/`,
      patchData,
      {
        headers: {
          "X-CSRFToken": getCSRFToken(),
        },
      },
    );
    return response.data;
  } catch(error) {
    console.error("Error updating work item:", error);

    if (error.response && error.response.data) {
      throw error.response.data;
    }

    throw new Error("Failed to update work item");
  }
}

export async function fetchWorkItem(id, include = "") {
  try {
    const params = {};
    if (include) {
      params.include = include;
    }

    const response = await apiClient.get(`/api/tasks/work-items/${id}/`, { params });
    return response.data;
  } catch (error) {
    console.error("Error fetching work item:", error);
    if (error.response && error.response.data) {
      throw new Error(error.response.data.detail || "Failed to fetch work item");
    }
    throw new Error("Failed to fetch work item");
  }
}
