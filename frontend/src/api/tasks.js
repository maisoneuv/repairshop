import {getCSRFToken} from "../utils/csrf";
import apiClient from "./apiClient";

export async function fetchTasks(params = {}) {
    try {
        const response = await apiClient.get("/api/tasks/tasks/", { params });
        return response.data;
    } catch (error) {
        console.error("Error fetching tasks:", error);
        if (error.response && error.response.data) {
            throw new Error(error.response.data.detail || "Failed to fetch tasks");
        }
        throw new Error("Failed to fetch tasks");
    }
}

export async function fetchTaskSchema() {
    try {
        const response = await apiClient.get("/api/tasks/api/schema/task");
        return response.data;
    } catch (error) {
        console.error("Error fetching task schema:", error);
        if (error.response && error.response.data) {
            throw new Error(error.response.data.detail || "Failed to fetch task schema");
        }
        throw new Error("Failed to fetch task schema");
    }
}

export async function createTask(data) {
    try {
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("[api/tasks] POST /api/tasks/tasks/", data);
        }
        const response = await apiClient.post(
            "/api/tasks/tasks/",
            data,
            {
                headers: {
                    "X-CSRFToken": getCSRFToken()
                }
            }
        );
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.debug("[api/tasks] response", response.data);
        }
        return response.data;
    } catch (error) {
        console.error("Error creating task:", error);
        if (error.response && error.response.data) {
            throw error.response.data;  // Return DRF validation errors
        }
        throw new Error("Failed to create task");
    }
}

export async function updateTaskField(id, patchData) {
    try {
        const response = await apiClient.patch(
            `/api/tasks/tasks/${id}/`,
            patchData,
            {
                headers: {
                    "X-CSRFToken": getCSRFToken()
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error(`Error updating task ${id}:`, error);
        if (error.response && error.response.data) {
            throw error.response.data;
        }
        throw new Error("Failed to update task");
    }
}

export async function fetchTask(id, include = "") {
    try {
        const params = include ? { include } : {};
        const response = await apiClient.get(`/api/tasks/tasks/${id}/`, { params });
        return response.data;
    } catch (error) {
        console.error(`Error fetching task ${id}:`, error);
        if (error.response && error.response.data) {
            throw new Error(error.response.data.detail || "Failed to fetch task");
        }
        throw new Error("Failed to fetch task");
    }
}

// Task Type API functions
export async function fetchTaskTypes(params = {}) {
    try {
        const response = await apiClient.get("/api/tasks/task-types/", { params });
        return response.data;
    } catch (error) {
        console.error("Error fetching task types:", error);
        if (error.response && error.response.data) {
            throw new Error(error.response.data.detail || "Failed to fetch task types");
        }
        throw new Error("Failed to fetch task types");
    }
}

export async function createTaskType(data) {
    try {
        const response = await apiClient.post(
            "/api/tasks/task-types/",
            data,
            {
                headers: {
                    "X-CSRFToken": getCSRFToken()
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error("Error creating task type:", error);
        if (error.response && error.response.data) {
            throw error.response.data;
        }
        throw new Error("Failed to create task type");
    }
}
