/**
 * API client for form documents and templates
 */
import apiClient from './apiClient';

/**
 * Fetch all form documents for a work item
 * @param {number} workItemId - Work item ID
 * @param {string} formType - Optional: Filter by form type (e.g., 'intake')
 * @returns {Promise<Array>} List of form documents
 */
export async function fetchFormDocuments(workItemId, formType = null) {
    const params = {};
    if (formType) {
        params.form_type = formType;
    }

    const response = await apiClient.get(`/api/documents/work-items/${workItemId}/documents/`, { params });
    return response.data;
}

/**
 * Generate a new form document for a work item
 * @param {number} workItemId - Work item ID
 * @param {string} formType - Form type to generate (default: 'intake')
 * @param {number} templateId - Optional: Specific template ID
 * @returns {Promise<Object>} Generation response with task info
 */
export async function generateFormDocument(workItemId, formType = 'intake', templateId = null) {
    const data = {
        form_type: formType,
    };

    if (templateId) {
        data.template_id = templateId;
    }

    const response = await apiClient.post(`/api/documents/work-items/${workItemId}/documents/`, data);
    return response.data;
}

/**
 * Download a form document PDF
 * @param {number} documentId - Document ID
 * @returns {Promise<Blob>} PDF file blob
 */
export async function downloadFormDocument(documentId) {
    const response = await apiClient.get(`/api/documents/documents/${documentId}/download/`, {
        responseType: 'blob',
    });
    return response.data;
}

/**
 * Get download URL for a document
 * @param {number} documentId - Document ID
 * @returns {string} Download URL
 */
export function getDocumentDownloadUrl(documentId) {
    const baseURL = apiClient.defaults.baseURL || '';
    return `${baseURL}/api/documents/documents/${documentId}/download/`;
}

/**
 * Fetch all form templates
 * @param {string} formType - Optional: Filter by form type
 * @param {boolean} activeOnly - Optional: Only fetch active templates
 * @returns {Promise<Array>} List of templates
 */
export async function fetchFormTemplates(formType = null, activeOnly = false) {
    const params = {};
    if (formType) {
        params.form_type = formType;
    }
    if (activeOnly) {
        params.is_active = true;
    }

    const response = await apiClient.get('/api/documents/templates/', { params });
    return response.data;
}

/**
 * Fetch a single form template
 * @param {number} templateId - Template ID
 * @returns {Promise<Object>} Template data
 */
export async function fetchFormTemplate(templateId) {
    const response = await apiClient.get(`/api/documents/templates/${templateId}/`);
    return response.data;
}

/**
 * Create a new form template
 * @param {Object} templateData - Template data
 * @returns {Promise<Object>} Created template
 */
export async function createFormTemplate(templateData) {
    const response = await apiClient.post('/api/documents/templates/', templateData);
    return response.data;
}

/**
 * Update a form template
 * @param {number} templateId - Template ID
 * @param {Object} templateData - Updated template data
 * @returns {Promise<Object>} Updated template
 */
export async function updateFormTemplate(templateId, templateData) {
    const response = await apiClient.patch(`/api/documents/templates/${templateId}/`, templateData);
    return response.data;
}

/**
 * Delete a form template
 * @param {number} templateId - Template ID
 * @returns {Promise<void>}
 */
export async function deleteFormTemplate(templateId) {
    await apiClient.delete(`/api/documents/templates/${templateId}/`);
}

/**
 * Activate a template
 * @param {number} templateId - Template ID
 * @returns {Promise<Object>} Updated template
 */
export async function activateFormTemplate(templateId) {
    const response = await apiClient.post(`/api/documents/templates/${templateId}/activate/`);
    return response.data;
}

/**
 * Deactivate a template
 * @param {number} templateId - Template ID
 * @returns {Promise<Object>} Updated template
 */
export async function deactivateFormTemplate(templateId) {
    const response = await apiClient.post(`/api/documents/templates/${templateId}/deactivate/`);
    return response.data;
}

/**
 * Duplicate a template
 * @param {number} templateId - Template ID
 * @param {string} newName - Optional: Name for the duplicated template
 * @returns {Promise<Object>} New template
 */
export async function duplicateFormTemplate(templateId, newName = null) {
    const data = newName ? { name: newName } : {};
    const response = await apiClient.post(`/api/documents/templates/${templateId}/duplicate/`, data);
    return response.data;
}

/**
 * Get available template variables
 * @returns {Promise<Array>} List of variable categories
 */
export async function getAvailableVariables() {
    const response = await apiClient.get('/api/documents/templates/available_variables/');
    return response.data;
}
