import apiClient from './apiClient';

/**
 * Utilities to build relative API paths for autocomplete
 */

export function getCustomerSearchPath(query) {
    return `/api/customers/api/customers/search/?q=${encodeURIComponent(query)}`;
}

export function getEmployeeSearchPath(query) {
    return `/api/service/api/employee/search/?q=${encodeURIComponent(query)}`;
}

export function getEmployeeListPath() {
    return `/api/service/api/employee/list/`;
}

export function getDeviceSearchPath(query) {
    return `/api/inventory/api/devices/search/?q=${encodeURIComponent(query)}`;
}

export function getManufacturerSearchPath(query) {
    return `/api/inventory/api/devices/manufacturers/?q=${encodeURIComponent(query)}`;
}

export function getCategorySearchPath(query) {
    return `/api/inventory/api/category/search/?q=${encodeURIComponent(query)}`;
}

export function getLocationSearchPath(query) {
    return `/api/service/api/locations/search/?q=${encodeURIComponent(query)}`;
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
 * Generic function to build a fetchAllFn for AutocompleteInput (picklist behavior)
 * Uses apiClient with subdomain-aware baseURL and X-Tenant header
 */
export const buildFetchAllFn = (pathBuilder) => async () => {
    const path = pathBuilder();
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
