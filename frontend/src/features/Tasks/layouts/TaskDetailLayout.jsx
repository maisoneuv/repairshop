const TaskDetailLayout = [
    {
        section: "General Info",
        fields: [
            { name: "summary", label: "Summary", type: "text", editable: true, width: "full" },
            { name: "description", label: "Description", type: "text", editable: false, width: "full" },
            { name: "status", label: "Status", type: "select", editable: true, width: "1/2" },
            { name: "work_item", label: "Work Item", type: "text", editable: false, width: "1/2" },
            { name: "assigned_employee", label: "Assignee", type: "foreignkey", editable: true, width: "1/2" },
            { name: "due_date", label: "Due Date", type: "date", editable: false, width: "1/2" },
        ],
    },
];

export default TaskDetailLayout;
