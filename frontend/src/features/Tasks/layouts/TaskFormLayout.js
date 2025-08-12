const taskLayout = [
    {
        section: "General Info",
        fields: [
            { name: "summary", label: "Summary", width: "full" },
            { name: "description", label: "Description", width: "full" },
            { name: "status", label: "Status", width: "1/2" },
            { name: "assigned_employee", label: "Assigned To", width: "1/2", type: "foreignkey" },
        ],
    },
    {
        section: "Timeline",
        fields: [
            { name: "due_date", label: "Due Date", width: "1/2" },
            { name: "work_item", label: "Linked Work Item", width: "1/2", type: "foreignkey" },
        ],
    },
];

export default taskLayout;