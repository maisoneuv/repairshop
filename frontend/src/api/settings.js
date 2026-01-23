import api from './apiClient';

/**
 * Get a single setting by key (uses merged logic - tenant override > global)
 * @param {string} key - The setting key to fetch
 * @returns {Promise<{key: string, value: any, value_type: string, is_override: boolean, description: string, found: boolean}>}
 */
export async function getSettingByKey(key) {
    const response = await api.get(`/api/core/settings/by-key/${key}/`);
    return response.data;
}

/**
 * Get all merged settings (global + tenant overrides)
 * @returns {Promise<{settings: Object}>}
 */
export async function getMergedSettings() {
    const response = await api.get('/api/core/settings/merged/');
    return response.data;
}

/**
 * Get a setting value with a default fallback
 * @param {string} key - The setting key
 * @param {any} defaultValue - Default value if setting not found
 * @returns {Promise<any>} The setting value or default
 */
export async function getSettingValue(key, defaultValue = null) {
    try {
        const result = await getSettingByKey(key);
        if (result.found) {
            return result.value;
        }
        return defaultValue;
    } catch (error) {
        console.error(`Failed to fetch setting '${key}':`, error);
        return defaultValue;
    }
}
