import api from "./apiClient";

const BASE = "/api/customers/api/leads/";

export const listLeads   = ()         => api.get(BASE).then(r => r.data);
export const createLead  = (data)     => api.post(BASE, data).then(r => r.data);
export const updateLead  = (id, data) => api.patch(`${BASE}${id}/`, data).then(r => r.data);
export const convertLead = (id)       => api.post(`${BASE}${id}/convert/`).then(r => r.data);
export const getLead     = (id)       => api.get(`${BASE}${id}/`).then(r => r.data);
