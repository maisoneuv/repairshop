import apiClient from './apiClient';

/**
 * Utilities to build relative API paths for autocomplete
 */

export function getCustomerSearchPath(query) {
    return `/customers/api/customers/search/?q=${encodeURIComponent(query)}`;
}

export function getEmployeeSearchPath(query) {
    return `/service/api/employee/search/?q=${encodeURIComponent(query)}`;
}

export function getDeviceSearchPath(query) {
    return `/inventory/api/devices/search/?q=${encodeURIComponent(query)}`;
}

export function getLocationSearchPath(query) {
    return `/service/api/locations/search/?q=${encodeURIComponent(query)}`;
}

export function getObjectDetailPath(app, id) {
    return `/${app}/${id}/`;
}

/**
 * Generic function to build a searchFn for AutocompleteInput
 * Uses apiClient with subdomain-aware baseURL and X-Tenant header
 */
export const buildSearchFn = (pathBuilder) => async (query) => {
    const path = pathBuilder(query);
    const response = await apiClient.get(path);
    return response.data;
};

/**
 * Generic function to build a getDetailFn for AutocompleteInput
 * Uses apiClient with subdomain-aware baseURL and X-Tenant header
 */
export const buildDetailFn = (app) => async (id) => {
    const path = getObjectDetailPath(app, id);
    const response = await apiClient.get(path);
    return response.data;
};
