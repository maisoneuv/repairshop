import { useCallback, useEffect, useState } from "react";
import { fetchAgenda } from "../../api/agenda";
import { todayISO } from "./dates";

export default function useAgenda(dateFrom, dateTo, employee, { withCarriedOver = false } = {}) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        fetchAgenda({ dateFrom, dateTo, employee, today: withCarriedOver ? todayISO() : undefined })
            .then((result) => { if (!cancelled) setData(result); })
            .catch((err) => {
                if (!cancelled) setError(err.response?.data?.detail || "Could not load the plan");
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [dateFrom, dateTo, employee, withCarriedOver, reloadKey]);

    const reload = useCallback(() => setReloadKey((k) => k + 1), []);
    return { data, loading, error, reload };
}
