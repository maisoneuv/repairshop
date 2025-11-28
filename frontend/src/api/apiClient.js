// src/api/apiClient.js
import axios from "axios";

/** ---------------- In-memory tenant ---------------- */
let __ACTIVE_TENANT__ = null;
export function setActiveTenant(slug) {
    __ACTIVE_TENANT__ = slug || null;
    try {
        if (slug) localStorage.setItem("activeTenant", slug);
        else localStorage.removeItem("activeTenant");
    } catch {}
}

/** ---------------- Tenant resolution helpers ---------------- */
function getActiveTenantFromStorage() {
    try { return localStorage.getItem("activeTenant") || null; } catch { return null; }
}

function deriveTenantFromHost(hostname = window.location.hostname) {
    // dev hosts
    if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
        return import.meta.env.VITE_DEV_TENANT || null;
    }
    const parts = hostname.split(".");
    // foo.localhost
    if (parts.includes("localhost")) return parts[0] !== "localhost" ? parts[0] : null;
    // drop common prefixes
    if (parts[0] === "www" || parts[0] === "app") parts.shift();
    // foo.api.example.com -> foo
    if (parts.length >= 3) return parts[0];
    return null;
}

function resolveTenant() {
    return __ACTIVE_TENANT__ || getActiveTenantFromStorage() || deriveTenantFromHost() || null;
}

/** ---------------- CSRF helper ---------------- */
function getCSRFToken() {
    const m = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

/** ---------------- Base URL (defensive) ---------------- */
const ENV_BASE = import.meta.env.VITE_API_BASE; // e.g. http://repairhero.localhost:8000
// If not set, fall back to the page’s origin so relative paths still work
const SAFE_BASE = (typeof ENV_BASE === "string" && ENV_BASE.trim()) ? ENV_BASE : window.location.origin;

// IMPORTANT: axios will join relative request URLs with baseURL itself.
// We do NOT need to manually construct `new URL()` anywhere.
const api = axios.create({
    baseURL: SAFE_BASE,
    withCredentials: true,
});

export function normalizeApiPath(urlOrPath) {
    if (!urlOrPath || typeof urlOrPath !== "string") return urlOrPath;

    if (/^https?:\/\//i.test(urlOrPath)) {
        try {
            const parsed = new URL(urlOrPath);
            const path = parsed.pathname || "/";
            const query = parsed.search || "";
            return `${path}${query}` || "/";
        } catch {
            return urlOrPath;
        }
    }

    return urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
}

/** Paths that should NOT carry X-Tenant (anonymous/auth infra) */
const TENANT_OPTIONAL_PATHS = new Set([
    "/auth/login", "/auth/logout", "/auth/session", "/auth/csrf",
    "/accounts/login", "/accounts/logout",
    "/api/core/login/", "/api/core/logout/",              // your endpoints
    "/dj-rest-auth/login/", "/dj-rest-auth/logout/",
]);

/** Utilities that avoid `new URL()` */
function isAbsoluteUrl(u) {
    return typeof u === "string" && /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u);
}
function extractPathname(urlOrPath) {
    if (!urlOrPath) return "/";
    if (isAbsoluteUrl(urlOrPath)) {
        try { return new URL(urlOrPath).pathname; } catch { return "/"; }
    }
    // relative path like "/service/api/employee/me/"
    return urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
}
function isTenantOptionalPath(urlOrPath) {
    const p = extractPathname(urlOrPath);
    // startsWith check lets you have versions like /auth/login/ or querystrings
    for (const prefix of TENANT_OPTIONAL_PATHS) {
        if (p.startsWith(prefix)) return true;
    }
    return false;
}

/** ---------------- Interceptors ---------------- */
api.interceptors.request.use((config) => {
    // Only set headers for relative URLs (same-origin) or URLs to SAFE_BASE.
    // We AVOID constructing URL objects if not necessary.
    const isSameOrigin =
        !isAbsoluteUrl(config.url) ||
        (typeof SAFE_BASE === "string" && isAbsoluteUrl(config.url) && config.url.startsWith(SAFE_BASE));

    if (isSameOrigin) {
        config.headers = config.headers ?? {};

        // CSRF (idempotent)
        const csrf = getCSRFToken();
        if (csrf && !("X-CSRFToken" in config.headers)) {
            config.headers["X-CSRFToken"] = csrf;
        }

        // X-Tenant unless caller set it or path is tenant-optional
        const alreadySet = "X-Tenant" in config.headers || "x-tenant" in config.headers;
        if (!alreadySet && !isTenantOptionalPath(config.url || "")) {
            const tenant = resolveTenant();
            if (tenant) config.headers["X-Tenant"] = tenant;
        }
    }

    return config;
});

// Optional debug hooks (toggle from DevTools: window.API_DEBUG = true)
api.interceptors.request.use((c) => {
    if (window.API_DEBUG) {
        // eslint-disable-next-line no-console
        console.log("[API] →", c.method?.toUpperCase(), c.baseURL, c.url, c.headers, c.params || "", c.data || "");
    }
    return c;
});
api.interceptors.response.use(
    (r) => {
        if (window.API_DEBUG) {
            // eslint-disable-next-line no-console
            console.log("[API] ←", r.status, r.config?.url, r.data);
        }
        return r;
    },
    (err) => {
        if (window.API_DEBUG) {
            // eslint-disable-next-line no-console
            console.error("[API] ✖", err?.response?.status, err?.config?.url, err);
        }
        return Promise.reject(err);
    }
);

export default api;

// Optionally call this once on app boot in session-auth setups
export async function ensureCsrfCookie() {
    try { await api.get("/auth/csrf"); } catch {}
}
