import { useEffect, useState } from "react";
import api from "../../api/apiClient";

export default function PersonPicker({ value, onChange, currentEmployeeId }) {
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        api.get("/api/service/api/employee/list/")
            .then((r) => setEmployees(r.data || []))
            .catch(() => setEmployees([]));
    }, []);

    const others = employees.filter((e) => e.id !== currentEmployeeId);

    return (
        <select
            aria-label="Whose plan"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        >
            {currentEmployeeId && <option value="">Me</option>}
            <option value="all">Everyone</option>
            {others.map((e) => (
                <option key={e.id} value={String(e.id)}>{e.name}</option>
            ))}
        </select>
    );
}
