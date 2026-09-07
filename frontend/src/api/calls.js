import apiClient from './apiClient';

/**
 * Calls logged against a customer (by the Caller ID / telephony integration).
 * A Call links to a customer, not a work item, so a work item surfaces its
 * customer's calls on the activity timeline. Fails soft to an empty list.
 */
export async function getCallsForCustomer(customerId) {
    if (!customerId) return [];
    try {
        const { data } = await apiClient.get(`/api/calls/customer/${customerId}/`);
        return Array.isArray(data) ? data : (data?.results ?? []);
    } catch (error) {
        console.error("Error fetching calls:", error);
        return [];
    }
}
