import api from "./apiClient";

const BASE = "/api/appointments/appointments/";
const ROUTES = "/api/appointments/routes/";
const DRIVERS = "/api/appointments/drivers/";

export const listAppointments    = (params)       => api.get(BASE, { params }).then(r => r.data);
export const getAppointment      = (id)           => api.get(`${BASE}${id}/`).then(r => r.data);
export const createAppointment   = (data)         => api.post(BASE, data).then(r => r.data);
export const updateAppointment   = (id, data)     => api.patch(`${BASE}${id}/`, data).then(r => r.data);
export const scheduleAppointment = (id, data)     => api.post(`${BASE}${id}/schedule/`, data).then(r => r.data);
export const unscheduleAppointment = (id)         => api.post(`${BASE}${id}/unschedule/`).then(r => r.data);
export const completeAppointment = (id)           => api.post(`${BASE}${id}/complete/`).then(r => r.data);
export const markAppointmentFailed = (id, reason) => api.post(`${BASE}${id}/mark-failed/`, { reason }).then(r => r.data);
export const cancelAppointment   = (id)           => api.post(`${BASE}${id}/cancel/`).then(r => r.data);
export const setAppointmentLocation = (id, latitude, longitude) =>
    api.post(`${BASE}${id}/set-location/`, { latitude, longitude }).then(r => r.data);
export const nearbyAppointments  = (id, radiusKm) =>
    api.get(`${BASE}${id}/nearby/`, { params: { radius_km: radiusKm } }).then(r => r.data);
export const geocodeAddress      = (address)      => api.post(`${BASE}geocode/`, address).then(r => r.data);
export const findCustomerMatches = (params)       => api.get(`${BASE}customer-matches/`, { params }).then(r => r.data);

export const listRoutes    = (params)   => api.get(ROUTES, { params }).then(r => r.data);
export const createRoute   = (data)     => api.post(ROUTES, data).then(r => r.data);
export const updateRoute   = (id, data) => api.patch(`${ROUTES}${id}/`, data).then(r => r.data);
export const reorderRoute  = (id, ids)  => api.post(`${ROUTES}${id}/reorder/`, { appointment_ids: ids }).then(r => r.data);

export const listDrivers   = (params)   => api.get(DRIVERS, { params }).then(r => r.data);
export const updateDriver  = (id, data) => api.patch(`${DRIVERS}${id}/`, data).then(r => r.data);

export function apiErrorMessage(err, fallback = "Something went wrong.") {
    const data = err?.response?.data;
    if (!data) return err?.message || fallback;
    if (typeof data === "string") return fallback;
    if (data.detail) return data.detail;
    const first = Object.entries(data)[0];
    if (!first) return fallback;
    const [field, value] = first;
    const text = Array.isArray(value) ? value[0] : typeof value === "object" ? JSON.stringify(value) : value;
    return field === "non_field_errors" ? text : `${field.replace(/_/g, " ")}: ${text}`;
}
