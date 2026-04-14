import api from "./apiClient";

export const getPendingCalls       = ()   => api.get("/api/calls/pending/").then(r => r.data);
export const markCallHandled       = (id, notes = "") => api.post(`/api/calls/${id}/handled/`, { notes }).then(r => r.data);
export const lookupCustomerByPhone = (phone) =>
    api.get("/api/customers/api/customers/lookup/", { params: { phone } }).then(r => r.data);
export const createLeadFromCarMode = (data) =>
    api.post("/api/customers/api/leads/", data).then(r => r.data);
