import api from "./apiClient";

export const fetchAgenda = ({ dateFrom, dateTo, employee, today }) =>
    api.get("/api/tasks/agenda/", {
        params: {
            date_from: dateFrom, date_to: dateTo,
            ...(employee ? { employee } : {}),
            ...(today ? { today } : {}),
        },
    }).then(r => r.data);
