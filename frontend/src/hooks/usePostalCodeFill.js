import { useCallback, useEffect, useRef } from "react";
import { geocodeAddress } from "../api/appointments";

const lookupKey = (a) =>
    ["street", "building_number", "city"].map((f) => (a[f] || "").trim().toLowerCase()).join("|");

/**
 * Returns a function to call on blur: when street, number and city are filled
 * and the postal code is empty, it asks the map lookup and fills the code in.
 * The server also fills it after saving, so a failed lookup is silent.
 */
export default function usePostalCodeFill(address, onChange) {
    const latest = useRef(address);
    const asked = useRef(null);
    useEffect(() => {
        latest.current = address;
    }, [address]);

    return useCallback(async () => {
        const current = latest.current;
        if (current.postal_code?.trim()) return;
        if (!(current.street?.trim() && current.building_number?.trim() && current.city?.trim())) return;
        const key = lookupKey(current);
        if (asked.current === key) return;
        asked.current = key;
        try {
            const result = await geocodeAddress(current);
            const now = latest.current;
            // The user may have kept typing while the lookup ran.
            if (result.found && result.postal_code && !now.postal_code?.trim() && lookupKey(now) === key) {
                onChange({ ...now, postal_code: result.postal_code });
            }
        } catch {
            asked.current = null;
        }
    }, [onChange]);
}
