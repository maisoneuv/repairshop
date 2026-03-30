import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import apiClient from "../api/apiClient"; // axios instance with withCredentials=true (recommended)
import { useNavigate } from "react-router-dom";
import {getCSRFToken} from "../utils/csrf";
import { setActiveTenant as setClientActiveTenant } from "../api/apiClient";

/**
 * UserContext — fully tenant-aware
 * - Resolves tenant from subdomain (supports *.localhost) with sensible fallbacks
 * - Calls /service/api/employee/me/ using X-Tenant header
 * - Stores BOTH slug (subdomain) and id (if backend returns it) for currentTenant
 * - Treats presence of `user` as authentication (superuser may have employee=null)
 * - Exposes helper to switch tenant and to get a stable tenant id for forms
 *
 * Works with either of these backend response shapes:
 * A) { currentTenant: "repairhero", availableTenants: ["repairhero", ...] }
 * B) { currentTenant: { id, subdomain, name }, availableTenants: [{ id, subdomain, name }, ...] }
 *
 * Best practice: server should NOT require tenant id in payloads; infer from request and set
 * tenant on the server. Keep `tenant` read_only in serializers. Frontend keeps id for UI only.
 */

const UserContext = createContext(null);

export function useUser() {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error("useUser must be used within <UserProvider>");
    return ctx;
}

// ---------- Tenant helpers ----------
const LS_KEY = "currentTenant"; // we store the WHOLE object here when available

function isIp(host) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function deriveTenantSlugFromHost() {
    const host = window.location.hostname; // e.g. repairhero.localhost, tenant.app.dev, localhost
    const parts = host.split(".");

    // normal multi-label domains: foo.example.com -> foo
    if (parts.length >= 3 && !isIp(host)) return parts[0].toLowerCase();

    // *.localhost for dev: foo.localhost -> foo
    if (parts.length >= 2 && parts[parts.length - 1] === "localhost") return parts[0].toLowerCase();

    // IPs or bare localhost: no slug here
    return null;
}

function readStoredTenant() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && (parsed.subdomain || parsed.slug)) {
            return {
                id: parsed.id ?? null,
                subdomain: (parsed.subdomain || parsed.slug || "").toLowerCase(),
                name: parsed.name ?? null,
            };
        }
    } catch (_) {}
    return null;
}

function normalizeTenant(raw) {
    if (!raw) return null;
    if (typeof raw === "string") {
        return { id: null, subdomain: raw.toLowerCase(), name: null };
    }
    // object { id?, subdomain?/slug?, name? }
    return {
        id: raw.id ?? null,
        subdomain: (raw.subdomain || raw.slug || "").toLowerCase(),
        name: raw.name ?? null,
    };
}

function normalizeTenantList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeTenant).filter(Boolean);
}

function storeTenant(tenantObj) {
    if (!tenantObj) return localStorage.removeItem(LS_KEY);
    localStorage.setItem(LS_KEY, JSON.stringify(tenantObj));
}

// ---------- Provider ----------
export function UserProvider({ children }) {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [employee, setEmployee] = useState(null); // can be null for superusers
    const [permissions, setPermissions] = useState([]);
    const [currentTenant, setCurrentTenant] = useState(() => readStoredTenant());
    const [availableTenants, setAvailableTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTenant, setActiveTenant] = useState(null);
    const [isLocked, setIsLocked] = useState(false);
    const [tenantSettings, setTenantSettings] = useState({ logout_on_inactivity: false, inactivity_timeout_minutes: 10 });
    const inactivityTimer = useRef(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem("activeTenant");
            if (stored) {
                setActiveTenant(stored);
                setClientActiveTenant(stored); // keep axios in sync
            }
        } catch {}
    }, []);

    // Keep apiClient header aligned whenever currentTenant changes
    useEffect(() => {
        const slug = user?.active_tenant_slug || null;
        if (slug && slug !== activeTenant) {
            setActiveTenant(slug);            // update context
            setClientActiveTenant(slug);      // update axios (adds X-Tenant automatically)
            try { localStorage.setItem("activeTenant", slug); } catch {}
        }
    }, [user, activeTenant]);

    // Initial bootstrap: decide what tenant header to use for the FIRST profile call
    const computeFirstTenantHeader = () => {
        // Priority: subdomain -> stored -> env default
        const subdomain = deriveTenantSlugFromHost();
        if (subdomain) return subdomain;

        const stored = readStoredTenant();
        if (stored?.subdomain) return stored.subdomain;

        const fallback = import.meta.env.VITE_DEFAULT_TENANT || null;
        return fallback || null;
    };

    const fetchTenantSettings = useCallback(async () => {
        try {
            const { data } = await apiClient.get("/api/core/settings/merged/");
            const s = data?.settings || {};
            setTenantSettings({
                logout_on_inactivity: s.logout_on_inactivity?.value ?? false,
                inactivity_timeout_minutes: s.inactivity_timeout_minutes?.value ?? 10,
            });
        } catch (_) {}
    }, []);

    const hydrateFromMe = useCallback(async () => {
        setLoading(true);
        setError(null);

        // Ensure the very first request carries the right tenant header
        const firstHeader = computeFirstTenantHeader();
        const extraHeaders = firstHeader ? { "X-Tenant": firstHeader } : {};

        try {
            const { data } = await apiClient.get("/api/service/api/employee/me/", {
                headers: extraHeaders,
            });

            // Normalize tenants from response (supports both string and object forms)
            const normalizedCurrent = normalizeTenant(data?.currentTenant) ||
                (firstHeader ? { id: null, subdomain: firstHeader, name: null } : null);
            const normalizedAvailable = normalizeTenantList(data?.availableTenants);

            // Persist a good currentTenant if available
            if (normalizedCurrent?.subdomain) {
                storeTenant(normalizedCurrent);
                setCurrentTenant(normalizedCurrent);
            }

            setUser(data?.user || null);
            setEmployee(data?.employee ?? null);
            setPermissions(Array.isArray(data?.permissions) ? data.permissions : []);
            setAvailableTenants(normalizedAvailable);
            setLoading(false);
        } catch (err) {
            console.error("/employee/me failed", err);
            const status = err?.response?.status;
            if (status === 401 || status === 403) {
                // Genuine auth failure — clear state and let router redirect to /login
                setUser(null);
                setEmployee(null);
                setPermissions([]);
                setAvailableTenants([]);
            }
            // Transient errors (5xx, network, timeout): preserve existing user state
            setError(err);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        hydrateFromMe();
        fetchTenantSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Shared lock trigger used by both inactivity and visibility effects
    const triggerLock = useCallback(() => {
        // Session stays alive on the server — lock screen is UI-only
        setUser(null);
        setEmployee(null);
        setPermissions([]);
        setIsLocked(true);
    }, []);

    // Inactivity lock — fires after N minutes of no mouse/keyboard/touch
    useEffect(() => {
        if (!user || !tenantSettings.logout_on_inactivity) return;

        const timeoutMs = tenantSettings.inactivity_timeout_minutes * 60 * 1000;

        const resetTimer = () => {
            clearTimeout(inactivityTimer.current);
            inactivityTimer.current = setTimeout(triggerLock, timeoutMs);
        };

        const events = ['mousemove', 'keydown', 'touchstart', 'click'];
        events.forEach(e => document.addEventListener(e, resetTimer, { passive: true }));
        resetTimer();

        return () => {
            clearTimeout(inactivityTimer.current);
            events.forEach(e => document.removeEventListener(e, resetTimer));
        };
    }, [user, tenantSettings.logout_on_inactivity, tenantSettings.inactivity_timeout_minutes, triggerLock]);

    // Visibility lock — covers OS screen lock (Ctrl+Cmd+Q) and computer sleep
    // Uses a 10-second threshold to ignore quick tab switches
    useEffect(() => {
        if (!user || !tenantSettings.logout_on_inactivity) return;

        let hiddenAt = null;
        const LOCK_THRESHOLD_MS = 10_000;

        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
            } else if (document.visibilityState === 'visible' && hiddenAt !== null) {
                if (Date.now() - hiddenAt >= LOCK_THRESHOLD_MS) {
                    triggerLock();
                }
                hiddenAt = null;
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [user, tenantSettings.logout_on_inactivity, triggerLock]);

    // Session health check — fires whenever the tab becomes visible.
    // Independent of logout_on_inactivity: this detects genuine server-side session
    // expiry while the tab was in the background, without kicking out active users.
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState !== 'visible') return;
            try {
                await apiClient.get('/api/core/session-ping/');
            } catch (err) {
                if (err?.response?.status === 401) {
                    setUser(null);
                    setEmployee(null);
                    setPermissions([]);
                    setIsLocked(false);
                }
                // All other errors: ignore — assume session still valid
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Public helpers
    const isAuthenticated = !!user; // IMPORTANT: do NOT gate on `employee`

    const switchTenant = useCallback(async (tenantLike) => {
        // tenantLike can be a slug string or a {id, subdomain, name}
        const nextTenant = normalizeTenant(tenantLike);
        if (!nextTenant?.subdomain) return;

        // Persist and apply header immediately
        storeTenant(nextTenant);
        setCurrentTenant(nextTenant);

        // Re-hydrate profile under new tenant
        await hydrateFromMe();
    }, [hydrateFromMe]);

    const lockScreen = useCallback(() => {
        // Manually triggered lock (e.g. "Lock" button in nav)
        // Session stays alive on the server — lock screen is UI-only
        setUser(null);
        setEmployee(null);
        setPermissions([]);
        setIsLocked(true);
    }, []);

    const unlockScreen = useCallback(async () => {
        // Called after successful quick-login from lock screen
        setIsLocked(false);
        await hydrateFromMe();
    }, [hydrateFromMe]);

    const dismissLock = useCallback(() => {
        // Called when user chooses "Use full login" — just clears the overlay,
        // user is already null so router will redirect to /login
        setIsLocked(false);
    }, []);

    const logout = useCallback(async () => {
        clearTimeout(inactivityTimer.current);
        try {
            const csrfToken = getCSRFToken();
            await apiClient.post("/api/core/logout/",
                {},
                {
                    headers: {
                        'X-CSRFToken': csrfToken,
                        'Content-Type': 'application/json',
                    },
                    withCredentials: true,
                });
        } catch (_) {}
        setUser(null);
        setEmployee(null);
        setPermissions([]);
        setAvailableTenants([]);
        setCurrentTenant(null);
        setIsLocked(false);
        storeTenant(null);
        navigate("/login");
    }, [navigate]);

    const login = useCallback(async (email, password) => {
        const csrfToken = getCSRFToken();
        await apiClient.post("/api/core/login/",
            { email, password },
            {
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json',
                },
                withCredentials: true,
            });
        await hydrateFromMe();
        navigate("/");
    }, [hydrateFromMe, navigate]);

    const value = useMemo(() => ({
        // state
        user,
        employee,
        permissions,
        currentTenant, // { id|null, subdomain, name|null }
        availableTenants, // array of normalized tenants
        loading,
        error,
        isLocked,
        tenantSettings,

        // derived
        isAuthenticated,
        tenantId: currentTenant?.id ?? null,
        tenantSlug: currentTenant?.subdomain || null,

        // actions
        refresh: hydrateFromMe,
        refreshSettings: fetchTenantSettings,
        switchTenant,
        login,
        logout,
        lockScreen,
        unlockScreen,
        dismissLock,
    }), [user, employee, permissions, currentTenant, availableTenants, loading, error, isLocked, tenantSettings, isAuthenticated, hydrateFromMe, fetchTenantSettings, switchTenant, login, logout, lockScreen, unlockScreen, dismissLock]);

    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
