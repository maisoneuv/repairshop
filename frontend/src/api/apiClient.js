import axios from 'axios';

// Utility to get the full tenant-aware API base URL
function getTenantApiBaseUrl() {
    const host = window.location.hostname;           // e.g. repairhero.localhost
    const parts = host.split(".");

    if (parts.length < 2) {
        console.warn("No subdomain detected. Defaulting to localhost for API calls.");
        return "http://localhost:8000";
    }

    // Include the full hostname in API calls (same subdomain)
    return `http://${host}:8000`;
}

// Create the Axios instance with dynamic baseURL
const apiClient = axios.create({
    baseURL: getTenantApiBaseUrl(),
    withCredentials: true  // Needed for Django session auth
});

// Request interceptor to add X-Tenant header if needed
apiClient.interceptors.request.use(
    config => {
        const tenantSlug = getTenantFromSubdomain();
        if (tenantSlug) {
            config.headers["X-Tenant"] = tenantSlug;
        }
        return config;
    },
    error => Promise.reject(error)
);

// Response interceptor for global error handling
apiClient.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            console.warn("Unauthorized - consider redirecting to login.");
        }
        return Promise.reject(error);
    }
);

// Simple utility for extracting tenant slug for headers
function getTenantFromSubdomain() {
    const host = window.location.hostname;
    const parts = host.split(".");
    return parts.length < 2 ? null : parts[0].toLowerCase();
}

export default apiClient;
