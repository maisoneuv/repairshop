import { useState } from "react";
import AutocompleteInput from "../components/AutocompleteInput";
import {createCategory} from "../api/categories";

export default function DeviceForm({ onSuccess }) {
    const [formData, setFormData] = useState({
        manufacturer: "",
        model: "",
        category: "",
    });

    const [unknownManufacturer, setUnknownManufacturer] = useState(false);
    const [unknownModel, setUnknownModel] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState("");
    const [error, setError] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const setField = (name, value) => {
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const payload = {
            ...formData,
            model: unknownModel ? "" : formData.model,
            manufacturer: unknownManufacturer ? "" : formData.manufacturer,
            unknown_model: unknownModel,
            unknown_manufacturer: unknownManufacturer,
        };

        try {
            console.log(payload)
            const res = await fetch("http://localhost:8000/inventory/api/devices/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(JSON.stringify(err));
            }

            const newDevice = await res.json();
            console.log(newDevice);
            onSuccess(newDevice);
        } catch (err) {
            setError("Could not create device: " + err.message);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium">Model Name</label>
                {!unknownModel && (
                    <input
                        type="text"
                        name="model"
                        value={formData.model}
                        onChange={handleChange}
                        className="w-full border px-3 py-2 rounded"
                        required
                    />
                )}
                <label className="inline-flex items-center mt-2 text-sm">
                    <input
                        type="checkbox"
                        className="mr-2"
                        checked={unknownModel}
                        onChange={(e) => {
                            setUnknownModel(e.target.checked);
                            if (e.target.checked) setField("name", "");
                        }}
                    />
                    Unknown model name
                </label>
            </div>

            <div>
                <label className="block text-sm font-medium">Manufacturer</label>
                {!unknownManufacturer && (
                    <AutocompleteInput
                        fetchUrl="http://localhost:8000/inventory/api/devices/manufacturers/"
                        value={formData.manufacturer}
                        onSelect={(item) => setField("manufacturer", item.name)}
                        onCreateNewItem={(customValue) => setField("manufacturer", customValue)}
                        displayField={(item) => `${item.name}`}
                        placeholder="Search or create manufacturer..."
                        allowCustomCreate
                    />
                )}
                <label className="inline-flex items-center mt-2 text-sm">
                    <input
                        type="checkbox"
                        className="mr-2"
                        checked={unknownManufacturer}
                        onChange={(e) => {
                            setUnknownManufacturer(e.target.checked);
                            if (e.target.checked) setField("manufacturer", "");
                        }}
                    />
                    Unknown manufacturer
                </label>
            </div>

            <div>
                <label className="block text-sm font-medium">Category</label>
                <AutocompleteInput
                    fetchUrl="http://localhost:8000/inventory/api/category/search/"
                    value={selectedCategory}
                    onSelect={(item) => {
                        setSelectedCategory(item);
                        handleChange({ target: { name: "category", value: item.id } });
                    }}
                    onCreateNewItem={async (name) => {
                        try {
                            const newCategory = await createCategory(name);
                            setSelectedCategory(newCategory);
                            handleChange({ target: { name: "category", value: newCategory.id } });
                        } catch (err) {
                            console.error(err);
                        }
                    }}
                    displayField={(item) => `${item.name}`}
                    placeholder="Search or create category..."
                    allowCustomCreate
                />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
                Save Device
            </button>
        </form>
    );
}
