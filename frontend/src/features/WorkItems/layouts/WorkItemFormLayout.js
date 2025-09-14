const workItemLayout = [
    {
        label: "General Information",
        fields: [
            { name: "customer", width: "full" },
            { name: "type", width: "1/2" },
            { name: "priority", width: "1/2" },
        ],
    },
    {
        label: "Device Information",
        fields: [
            { name: "customer_asset", width: "full" },
        ],
    },
    {
        label: "Issue Description",
        fields: [
            { name: "description", width: "1/2" },
            { name: "device_condition", width: "1/2" },
            { name: "comments", width: "full" },
        ],
    },
    {
        label: "Logistics",
        fields: [
            { name: "intake_method", width: "1/3" },
            { name: "customer_dropoff_point", width: "1/3" },
            { name: "customer_pickup_point", width: "1/3" },
        ],
    },
    {
        label: "Pricing",
        fields: [
            { name: "payment_method", width: "1/2" },
            { name: "estimated_price", width: "1/2" },
            { name: "repair_cost", width: "1/2" },
            { name: "final_price", width: "1/2" },
        ],
    },
];

export default workItemLayout;
