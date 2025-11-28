import { useState, useEffect, useMemo } from "react";
import AddressForm from "./AddressForm";
import apiClient from "../api/apiClient";

const emptyForm = {
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    tax_code: "",
    referral_source: "",
    address: {
        street: "",
        city: "",
        postal_code: "",
        country: "",
        building_number: "",
        apartment_number: ""
    },
};

const CONTACT_ERROR_MESSAGE = "Please provide at least one contact method";

export default function CustomerForm({ onSuccess, initialData = null, mode = "create", submitLabel = "Create Customer" }) {
    const initialState = useMemo(() => {
        if (!initialData) return JSON.parse(JSON.stringify(emptyForm));

        return {
            first_name: initialData.first_name || "",
            last_name: initialData.last_name || "",
            email: initialData.email || "",
            phone_number: initialData.phone_number || "",
            tax_code: initialData.tax_code || "",
            referral_source: initialData.referral_source || "",
            address: {
                street: initialData.address?.street || "",
                city: initialData.address?.city || "",
                postal_code: initialData.address?.postal_code || "",
                country: initialData.address?.country || "",
                building_number: initialData.address?.building_number || "",
                apartment_number: initialData.address?.apartment_number || "",
            },
        };
    }, [initialData]);

    const [formData, setFormData] = useState(initialState);

    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState({});
    const [referralChoices, setReferralChoices] = useState([]);
    const [showAddress, setShowAddress] = useState(Boolean(initialData?.address));

    useEffect(() => {
        setFormData(initialState);
        setShowAddress(Boolean(initialData?.address));
        setFieldErrors({});
        setError("");
    }, [initialState, initialData]);

    useEffect(() => {
        async function fetchChoices() {
            try {
                const { data } = await apiClient.get("/api/customers/api/referral-sources/");
                setReferralChoices(data);
            } catch (err) {
                console.error("Failed to fetch referral sources", err);
            }
        }
        fetchChoices();
    }, []);


    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleAddressChange = (address) => {
        setFormData(prev => ({ ...prev, address }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setFieldErrors({});

        const isEmpty = (v) => v == null || String(v).trim() === "";
        const trimmedFirst = formData.first_name.trim();
        const trimmedLast = formData.last_name.trim();
        const trimmedEmail = formData.email.trim();
        const trimmedPhone = formData.phone_number.trim();

        const nextErrors = {};

        if (!trimmedFirst) {
            nextErrors.first_name = "First name is required.";
        }

        if (!trimmedEmail && !trimmedPhone) {
            nextErrors.email = true;
            nextErrors.phone_number = true;
            nextErrors.contact = CONTACT_ERROR_MESSAGE;
        }

        if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors);
            return;
        }

        const payload = {
            ...formData,
            first_name: trimmedFirst,
            last_name: trimmedLast,
            email: trimmedEmail,
            phone_number: trimmedPhone,
            address: formData.address ? { ...formData.address } : null,
        };

        if (!payload.address || Object.values(payload.address).every(isEmpty)) {
            payload.address = null;
        }

        try {
            let response;
            if (mode === "edit" && initialData?.id) {
                response = await apiClient.patch(
                    `/api/customers/api/customers/${initialData.id}/`,
                    payload
                );
            } else {
                response = await apiClient.post(
                    "/api/customers/api/customers/",
                    payload
                );
            }

            onSuccess?.(response.data);
        } catch (err) {
            setError("Could not save customer: " + (err?.message || ""));
        }
    };

    const renderLabel = (text, { required = false, helper = null } = {}) => (
        <div className="flex items-center justify-between mb-1">
            <span className="block text-sm font-medium text-gray-700">
                {text}
                {required && <span className="text-red-500 ml-1">*</span>}
            </span>
            {helper}
        </div>
    );

    const inputClass = (field) =>
        `w-full border rounded px-3 py-2 ${fieldErrors[field] ? "border-red-500 focus:ring-red-500" : ""}`;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
                <div className="w-1/2">
                    {renderLabel("First Name", { required: true })}
                    <input
                        type="text"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleChange}
                        placeholder="First name"
                        className={inputClass("first_name")}
                    />
                    {fieldErrors.first_name && (
                        <p className="text-sm text-red-600 mt-1">{fieldErrors.first_name}</p>
                    )}
                </div>
                <div className="w-1/2">
                    {renderLabel("Last Name")}
                    <input
                        type="text"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleChange}
                        placeholder="Last name"
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

            </div>

            <div>
                {renderLabel("Email", {required: true})}
                <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email"
                    className={inputClass("email")}
                />
            </div>

            <div>
                {renderLabel("Phone Number", { required: true })}
                <input
                    type="text"
                    name="phone_number"
                    value={formData.phone_number}
                    onChange={handleChange}
                    placeholder="Phone number"
                    className={inputClass("phone_number")}
                />
            </div>

            {fieldErrors.contact && (
                <p className="text-sm text-red-600">{fieldErrors.contact}</p>
            )}

            <input
                type="text"
                name="tax_code"
                value={formData.tax_code}
                onChange={handleChange}
                placeholder="Tax Code"
                className="w-full border rounded px-3 py-2"
            />
            <select
                name="referral_source"
                value={formData.referral_source}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2"
            >
                <option value="">Select referral source</option>
                {referralChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                        {choice.label}
                    </option>
                ))}
            </select>

            <div>
                <button
                    type="button"
                    onClick={() => setShowAddress(prev => !prev)}
                    className="flex items-center gap-2 text-sm font-semibold focus:outline-none"
                >
                    <svg
                        className={`w-4 h-4 transition-transform duration-200 ${
                            showAddress ? "rotate-90" : "rotate-0"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Address
                </button>

                {showAddress && (
                    <div className="mt-2">
                        <AddressForm address={formData.address} onChange={handleAddressChange} />
                    </div>
                )}
            </div>


            {error && <p className="text-red-600 text-sm">{error}</p>}

            <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
                {submitLabel}
            </button>
        </form>
    );
}
