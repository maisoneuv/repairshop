import apiClient from "./apiClient";

export async function getEmailSettings() {
    const res = await apiClient.get("/api/core/email-settings/");
    return res.data;
}

export async function updateEmailSettings(data) {
    const res = await apiClient.patch("/api/core/email-settings/", data);
    return res.data;
}

export async function createEmailDomain(domain) {
    const res = await apiClient.post("/api/core/email-settings/domain/", { domain });
    return res.data;
}

export async function getEmailDomain() {
    const res = await apiClient.get("/api/core/email-settings/domain/");
    return res.data;
}

export async function verifyEmailDomain() {
    const res = await apiClient.post("/api/core/email-settings/domain/verify/");
    return res.data;
}

export async function deleteEmailDomain() {
    const res = await apiClient.delete("/api/core/email-settings/domain/");
    return res.data;
}
