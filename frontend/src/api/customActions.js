import apiClient from './apiClient';
import { getCSRFToken } from '../utils/csrf';

export async function fetchCustomActions(target) {
  try {
    const response = await apiClient.get('/api/integrations/custom-actions/', { params: { target } });
    return response.data;
  } catch (error) {
    console.error('Error fetching custom actions:', error);
    throw new Error('Failed to fetch custom actions');
  }
}

export async function executeCustomAction(id, targetId, userInput = '') {
  try {
    const body = { user_input: userInput };
    if (targetId != null) body.target_id = targetId;
    const response = await apiClient.post(
      `/api/integrations/custom-actions/${id}/execute/`,
      body,
      { headers: { 'X-CSRFToken': getCSRFToken() } }
    );
    return response.data;
  } catch (error) {
    console.error('Error executing custom action:', error);
    throw new Error(error.response?.data?.error || 'Failed to execute action');
  }
}
