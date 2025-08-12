import { useState, useEffect } from "react";
import AddressForm from "./AddressForm";

export default function CustomerForm({ onSuccess }) {
    const [formData, setFormData] = useState({
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
        }
    });

    const [error, setError] = useState("");
    const [referralChoices, setReferralChoices] = useState([]);
    const [showAddress, setShowAddress] = useState(false);

    useEffect(() => {
        async function fetchChoices() {
            try {
                const res = await fetch("http://localhost:8000/customers/api/referral-sources/");
                const data = await res.json();
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

        try {
            const res = await fetch("http://localhost:8000/customers/api/customers/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(JSON.stringify(err));
            }

            const newCustomer = await res.json();
            onSuccess(newCustomer);
        } catch (err) {
            setError("Could not create customer: " + err.message);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
                <div className="w-1/2">
                    <input
                        type="text"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleChange}
                        placeholder="First name"
                        className="w-full border rounded px-3 py-2"
                        required
                    />
                </div>
                <div className="w-1/2">
                    <input
                        type="text"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleChange}
                        placeholder="Last name"
                        className="w-full border rounded px-3 py-2"
                        required
                    />
                </div>

            </div>

            <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Email"
                className="w-full border rounded px-3 py-2"
                required
            />
            <input
                type="text"
                name="phone_number"
                value={formData.phone_number}
                onChange={handleChange}
                placeholder="Phone number"
                className="w-full border rounded px-3 py-2"
            />
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
                Create Customer
            </button>
        </form>
    );
}
