import apiClient from './apiClient';

export const createFreeformLocation = async (addressData) => {
    const response = await apiClient.post('/api/service/api/locations/create-freeform/', {
        street: addressData.street,
        building_number: addressData.building_number,
        apartment_number: addressData.apartment_number || null,
        city: addressData.city,
        postal_code: addressData.postal_code,
        country: addressData.country,
        label: addressData.label || `${addressData.street} ${addressData.building_number}`,
        save_to_customer: addressData.save_to_customer || false,
        customer_id: addressData.customer_id || null
    });
    return response.data;
};

export const searchLocations = async (query, customerId = null) => {
    const params = new URLSearchParams({ q: query });
    if (customerId) {
        params.append('customer_id', customerId);
    }

    const response = await apiClient.get(`/api/service/api/locations/search/?${params}`);
    return response.data;
};

export const ensureCustomerAddressLocation = async ({ customerId, addressId, label }) => {
    const payload = {
        customer_id: customerId,
        address_id: addressId,
    };

    if (label) {
        payload.label = label;
    }

    const response = await apiClient.post('/api/service/api/locations/customer-address/', payload);
    return response.data;
};
