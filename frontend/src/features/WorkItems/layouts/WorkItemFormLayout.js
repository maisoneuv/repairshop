const workItemLayout = [
    {
        label: "General Information",
        fields: [
            { name: "customer", width: "full" },
        ],
    },
    {
        label: "Device Information",
        fields: [
            { name: "customer_asset", width: "full" },
            { name: "accessories", width: "1/2" },
            { name: "device_condition", width: "1/2" },
        ],
    },
    {
        label: "Issue Description",
        fields: [
            { name: "description", width: "full" },
            { name: "comments", width: "full" },
        ],
    },
    {
        label: "Assignment",
        fields: [
            { name: "technician", width: "1/2", label: "Assigned Technician" },
            { name: "owner", width: "1/2", label: "Owner" },
        ], 
    },
    {
        label: "Logistics",
        collapsedByDefault: true,
        fields: [
            { name: "intake_method", width: "1/3" },
            { name: "dropoff_point", width: "1/3" },
            { name: "pickup_point", width: "1/3" },
            { name: "type", width: "1/2" },
            { name: "priority", width: "1/2" },            
        ],
    },
    {
        label: "Pricing",
        collapsedByDefault: true,
        fields: [
            { name: "payment_method", width: "1/2" },
            { name: "estimated_price", width: "1/2" },
            { name: "repair_cost", width: "1/2" },
            { name: "final_price", width: "1/2" },
        ],
    },
];

export default workItemLayout;
