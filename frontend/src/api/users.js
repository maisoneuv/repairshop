import apiClient from "./apiClient";
import {getCSRFToken} from "../utils/csrf";

export async function fetchWithTenant(url, tenantSlug, options = {}) {
    if (!tenantSlug) {
        throw new Error("Tenant slug is required for tenant-aware API calls.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("X-Tenant", tenantSlug);
    headers.set("Content-Type", "application/json");

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${errorText}`);
    }

    return response.json();
}



export async function fetchUserProfile(tenantSlug) {
    const response = await apiClient.get('/service/api/employee/me/');
    return response.data;
}

export async function login(username, password) {
    const csrfToken = getCSRFToken();

    const res = await apiClient.post(
        '/core/login/',
        { username, password },
        {
            headers: {
                'X-CSRFToken': csrfToken,
                'Content-Type': 'application/json',
            },
            withCredentials: true,
        }
    );

    return res.data;
}
