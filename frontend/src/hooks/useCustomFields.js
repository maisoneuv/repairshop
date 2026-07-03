import { useState, useEffect } from "react";
import { fetchCustomFields } from "../api/customFields";

export function useCustomFields(modelName) {
    const [fields, setFields] = useState([]);

    useEffect(() => {
        if (!modelName) return;
        fetchCustomFields(modelName).then(setFields).catch(() => setFields([]));
    }, [modelName]);

    return fields;
}
