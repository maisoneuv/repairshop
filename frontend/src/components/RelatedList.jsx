import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "./Modal";
import apiClient, { normalizeApiPath } from "../api/apiClient";

export default function RelatedList({
                                        title,
                                        relatedUrl,
                                        renderItem,
                                        renderForm,
                                        renderAsTable = false,
                                        renderTableHeader = null,
                                        sortableFields = []
                                    }) {
    const [items, setItems] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [ordering, setOrdering] = useState("-created_date");

    const loadItems = async () => {
        try {
            const url = relatedUrl.includes("?")
                ? `${relatedUrl}&ordering=${ordering}`
                : `${relatedUrl}?ordering=${ordering}`;

            const response = await apiClient.get(normalizeApiPath(url));
            setItems(response.data);
        } catch (error) {
            console.error("Error loading items:", error);
        }
    };

    useEffect(() => {
        loadItems();
    }, [relatedUrl, ordering]);

    const handleSort = (field) => {
        setOrdering((prev) => {
            if (prev === field) return `-${field}`;
            if (prev === `-${field}`) return field;
            return field;
        });
    };

    const renderSortableHeader = (label, field, key) => {
        const isActive = ordering === field || ordering === `-${field}`;
        const isDescending = ordering === `-${field}`;
        return (
            <th
                key={key}
                className="text-left px-3 py-2 cursor-pointer select-none"
                onClick={() => handleSort(field)}
            >
                {label} {isActive && (isDescending ? "▼" : "▲")}
            </th>
        );
    };

    return (
        <div className="bg-white border rounded p-4">
            <div className="flex justify-between items-center mb-2">
                <h2 className="font-semibold">{title}</h2>
                {renderForm && (
                    <button
                        type="button"
                        className="text-blue-600 text-sm hover:underline"
                        onClick={() => setIsModalOpen(true)}
                    >
                        + New
                    </button>
                )}
            </div>

            {renderAsTable ? (
                <table className="w-full text-sm">
                    <thead className="border-b font-semibold">
                    <tr>
                        {sortableFields.length > 0
                            ? sortableFields.map(({ label, field }) =>
                                renderSortableHeader(label, field, field)
                            )
                            : renderTableHeader}
                    </tr>
                    </thead>
                    <tbody>
                    {items.length === 0 ? (
                        <tr>
                            <td colSpan={999} className="text-gray-500 px-3 py-2">
                                No related items found.
                            </td>
                        </tr>
                    ) : (
                        items.map(renderItem)
                    )}
                    </tbody>
                </table>
            ) : (
                <ul className="space-y-1 text-sm">
                    {items.length === 0 ? (
                        <li className="text-gray-500">No related items found.</li>
                    ) : (
                        items.map((item) => (
                            <li key={item.id}>{renderItem(item)}</li>
                        ))
                    )}
                </ul>
            )}

            {renderForm && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Create ${title.slice(0, -1)}`}>
                    {renderForm({
                        onSuccess: (newItem) => {
                            setIsModalOpen(false);
                            loadItems();
                        },
                    })}
                </Modal>
            )}
        </div>
    );
}
