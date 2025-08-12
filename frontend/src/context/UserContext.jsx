import { createContext, useContext, useEffect, useState } from "react";
import {fetchUserProfile} from "../api/users";
import {useNavigate} from "react-router-dom";
import apiClient from "../api/apiClient";
import {getCSRFToken} from "../utils/csrf";

// Create context
const UserContext = createContext();

// Tenant extraction utility
function getTenantFromSubdomain() {
    const host = window.location.hostname;
    console.log(host);
    const parts = host.split(".");
    console.log(parts[0]);
    if (parts.length >= 3) {
        return parts[0].toLowerCase();
    }

    // Local dev fallback
    const fallbackTenant = import.meta.env.VITE_DEFAULT_TENANT;
    if (fallbackTenant) {
        console.warn(`Using fallback tenant from .env: ${fallbackTenant}`);
        return fallbackTenant;
    }

    return null;
}

// Provider component
export function UserProvider({ children }) {
    const [user, setUser] = useState(null);
    const [employee, setEmployee] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const tenantSlug = getTenantFromSubdomain();
    const navigate = useNavigate();

    const fetchProfile = async () => {
        try {
            const data = await fetchUserProfile(tenantSlug);
            setUser(data.user || null);
            setEmployee(data.employee || null);
            setPermissions(data.permissions || []);
        } catch (err) {
            setError(err.message);
            setUser(null);
            setEmployee(null);
            setPermissions([]);
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        const csrfToken = getCSRFToken();
        try {
            await apiClient.post("/core/login/",
                { email, password },
                {
                    headers: {
                        'X-CSRFToken': csrfToken,
                        'Content-Type': 'application/json',
                    },
                    withCredentials: true,
                });
            await fetchProfile();
            navigate("/");  // Redirect to home or dashboard
        } catch (err) {
            throw err;  // Let the form handle displaying the error
        }
    };

    const logout = async () => {
        const csrfToken = getCSRFToken();
        await apiClient.post("/core/logout/",
            {},
            {
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json',
                },
                withCredentials: true,
            });
        setUser(null);
        setEmployee(null);
        setPermissions([]);
        navigate("/login");
    };

    useEffect(() => {
        if (tenantSlug) {
            fetchProfile();
        } else {
            setLoading(false);
        }
    }, [tenantSlug]);

    return (
        <UserContext.Provider
            value={{
                tenantSlug,
                user,
                employee,
                permissions,
                loading,
                error,
                login,
                logout
            }}
        >
            {children}
        </UserContext.Provider>
    );
}

// Custom hook
export function useUser() {
    return useContext(UserContext);
}
