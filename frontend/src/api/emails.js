import apiClient from './apiClient';

export async function sendEmail({ model, objectId, toEmail, ccEmails, subject, bodyHtml, bodyText, attachments }) {
    const formData = new FormData();
    formData.append('model', model);
    formData.append('object_id', objectId);
    formData.append('to_email', toEmail);
    formData.append('subject', subject);
    formData.append('body_html', bodyHtml);
    formData.append('body_text', bodyText || '');

    for (const email of (ccEmails || [])) {
        formData.append('cc_emails', email);
    }
    for (const file of (attachments || [])) {
        formData.append('attachments', file);
    }

    const res = await apiClient.post('/api/core/emails/send/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
}

export async function getSentEmails(model, objectId) {
    const res = await apiClient.get(`/api/core/emails/${model}/${objectId}/`);
    return res.data;
}

export async function getEmailTemplates() {
    const res = await apiClient.get('/api/core/email-templates/');
    return res.data;
}

export async function createEmailTemplate(data) {
    const res = await apiClient.post('/api/core/email-templates/', data);
    return res.data;
}

export async function updateEmailTemplate(id, data) {
    const res = await apiClient.patch(`/api/core/email-templates/${id}/`, data);
    return res.data;
}

export async function deleteEmailTemplate(id) {
    await apiClient.delete(`/api/core/email-templates/${id}/`);
}
