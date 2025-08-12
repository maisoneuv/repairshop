const WorkItemDetailLayout = [
    {
        section: "General Info",
        fields: [
            { name: "summary", label: "Summary", type: "text", editable: true, width: "full" },
            { name: "description", label: "Description", type: "text", editable: false, width: "full" },
            { name: "status", label: "Status", type: "select", editable: true, width: "full" },
            { name: "type", label: "Type", type: "select", editable: true, width: "full" },
            { name: "priority", label: "Priority", type: "select", editable: true, width: "1/2" },
        ],
    },
    {
        section: "Scheduling",
        fields: [
            { name: "due_date", label: "Due Date", type: "date", editable: true, width: "1/2" },
            { name: "created_date", label: "Created", type: "date", editable: false, width: "1/2" },
        ],
    },
];


export default WorkItemDetailLayout;
