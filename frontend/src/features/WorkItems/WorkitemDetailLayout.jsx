const WorkItemDetailLayout = [
    {
        section: "Work Item Overview",
        groups: [
            {
                groupLabel: "Basic Information",
                fields: [
                    { name: "summary", label: "Summary", type: "textarea", editable: true },
                    { name: "type", label: "Type", type: "select", editable: true },
                    { name: "priority", label: "Priority", type: "select", editable: true },
                ]
            },
            {
                groupLabel: "Description",
                fields: [
                    { name: "description", label: "Issue Description", type: "textarea", editable: true },
                    { name: "device_condition", label: "Device Condition", type: "textarea", editable: true },
                    { name: "accessories", label: "Accessories Included", type: "textarea", editable: true },
                    { name: "comments", label: "Comments", type: "textarea", editable: true },
                ]
            }
        ]
    },
    {
        section: "Assignment",
        groups: [
            {
                fields: [
                    { name: "owner", label: "Owner", type: "foreignkey", editable: true },
                    { name: "technician", label: "Technician", type: "foreignkey", editable: true },
                    { name: "due_date", label: "Due Date", type: "date", editable: true },
                ]
            }
        ]
    },
    {
        section: "Financial Information",
        groups: [
            {
                groupLabel: "Pricing",
                fields: [
                    { name: "estimated_price", label: "Estimated Price", type: "currency", editable: true },
                    { name: "final_price", label: "Final Price", type: "currency", editable: true, emphasis: true },
                    { name: "repair_cost", label: "Repair Cost", type: "currency", editable: true },
                ]
            },
            {
                groupLabel: "Payment",
                fields: [
                    { name: "prepaid_amount", label: "Prepaid Amount", type: "currency", editable: true },
                    { name: "payment_method", label: "Payment Method", type: "select", editable: true },
                ]
            }
        ]
    },
    {
        section: "Logistics & Fulfillment",
        groups: [
            {
                groupLabel: "Intake",
                fields: [
                    { name: "intake_method", label: "Intake Method", type: "select", editable: true },
                    { name: "pickup_point", label: "Pickup Location", type: "foreignkey", editable: true },
                ]
            },
            {
                groupLabel: "Service",
                fields: [
                    { name: "fulfillment_shop", label: "Fulfillment Shop", type: "foreignkey", editable: true },
                ]
            },
            {
                groupLabel: "Dropoff",
                fields: [
                    { name: "dropoff_method", label: "Dropoff Method", type: "select", editable: true },
                    { name: "dropoff_point", label: "Dropoff Location", type: "foreignkey", editable: true },
                ]
            }
        ]
    },
    {
        section: "Assignment & Scheduling",
        groups: [
            {
                groupLabel: "Assignment",
                fields: [
                    { name: "owner", label: "Owner", type: "foreignkey", editable: true },
                    { name: "technician", label: "Technician", type: "foreignkey", editable: true },
                ]
            },
            {
                groupLabel: "Timeline",
                fields: [
                    { name: "due_date", label: "Due Date", type: "date", editable: true },
                    { name: "created_date", label: "Created", type: "date", editable: false },
                    { name: "closed_date", label: "Closed", type: "date", editable: false },
                ]
            }
        ]
    },
];


export default WorkItemDetailLayout;
