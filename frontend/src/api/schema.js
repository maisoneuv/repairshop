// Legacy fetch implementation retained for reference:
// export async function fetchSchema(appName, modelName) {
//     const res = await fetch(`/${appName}/api/schema/${modelName}/`, { credentials: "include" });
//     if (!res.ok) throw new Error("Failed to fetch schema");
//     return res.json();
// }

import apiClient from './apiClient';

export async function fetchSchema(appName, modelName) {
    try {
        const response = await apiClient.get(`/api/${appName}/api/schema/${modelName}/`);
        return response.data;
    } catch(error) {
        console.error('Error fetching schema: ',error);
        throw new Error('Failed to fetch schema');
    }

}
