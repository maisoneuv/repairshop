const TaskDetailLayout = [
    {
        section: "",
        fields: [
            { name: "summary", label: "Summary", type: "textarea", editable: true, width: "full" },
            { name: "description", label: "Additional info", type: "text", editable: false, width: "full" },
            { name: "task_type", label: "Task Type", type: "foreignkey", editable: true, width: "1/2" },
            { name: "status", label: "Status", type: "select", editable: true, width: "1/2" },
            { name: "assigned_employee", label: "Assignee", type: "foreignkey", editable: true, width: "1/2" },
            { name: "due_date", label: "Due Date", type: "date", editable: false, width: "1/2" },
        ],
    },
    {
        section: "",
        fields: [
            { name: "created_date", label: "Created", type: "datetime", editable: false, width: "1/2" },
            { name: "completed_date", label: "Completed", type: "datetime", editable: false, width: "1/2" }        ],
    },
];

export default TaskDetailLayout;
