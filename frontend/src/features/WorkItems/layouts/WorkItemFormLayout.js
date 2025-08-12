const workItemLayout = [
    {
        label: "Work Info",
        fields: [
            { name: "summary", width: "full" },
            { name: "description", width: "full" },
            { name: "status", width: "1/3" },
            { name: "type", width: "1/3" },
            { name: "priority", width: "1/3" },
        ],
    },
    {
        label: "Customer Details",
        fields: [
            { name: "customer", width: "1/2" },
            { name: "customer_asset", width: "1/2" },
        ],
    },
    {
        label: "Condition & Comments",
        fields: [
            { name: "device_condition", width: "full" },
            { name: "comments", width: "full" },
        ],
    },
    {
        label: "Logistics",
        fields: [
            { name: "intake_method", width: "1/3" },
            { name: "customer_dropoff_point", width: "1/3" },
            { name: "customer_pickup_point", width: "1/2" },
        ],
    },
    {
        label: "Assignment",
        fields: [
            { name: "owner", width: "1/2" },
            { name: "technician", width: "1/2" },
            { name: "due_date", width: "1/2" },
        ],
    },
    {
        label: "Pricing",
        fields: [
            { name: "estimated_price", width: "1/3" },
            { name: "repair_cost", width: "1/3" },
            { name: "final_price", width: "1/3" },
            { name: "prepaid_amount", width: "1/2" },
            { name: "payment_method", width: "1/2" },
        ],
    },

];

export default workItemLayout;