import { useEffect, useState } from "react";
import Modal from "./Modal";

const defaultFormData = {
    final_price: "",
    repair_cost: "",
    payment_method: "",
};

const buildFormData = (initialValues) => ({
    final_price: initialValues?.final_price ?? "",
    repair_cost: initialValues?.repair_cost ?? "",
    payment_method: initialValues?.payment_method ?? "",
});

export default function ResolvePaymentModal({
    isOpen,
    onClose,
    onConfirm,
    initialValues,
}) {
    const [formData, setFormData] = useState(defaultFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    useEffect(() => {
        if (!isOpen) return;

        setFormData(buildFormData(initialValues));
        setIsSubmitting(false);
        setSubmitError("");
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
        if (submitError) {
            setSubmitError("");
        }
    };

    const normalizeNumberValue = (value) => {
        if (value === "" || value === null || value === undefined) {
            return null;
        }

        const parsed = Number(value);
        return Number.isNaN(parsed) ? null : parsed;
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setSubmitError("");

        try {
            await onConfirm({
                final_price: normalizeNumberValue(formData.final_price),
                repair_cost: normalizeNumberValue(formData.repair_cost),
                payment_method: formData.payment_method || null,
            });
        } catch (error) {
            console.error("Failed to resolve work item with payment data:", error);
            setSubmitError("Nie udało się zamknąć zgłoszenia. Spróbuj ponownie.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Zamknij zgłoszenie">
            <div className="space-y-4">
                <div>
                    <label htmlFor="resolve-final-price" className="block text-sm font-medium text-gray-700 mb-2">
                        Wycena końcowa (PLN)
                    </label>
                    <input
                        id="resolve-final-price"
                        type="number"
                        name="final_price"
                        min="0"
                        step="0.01"
                        value={formData.final_price}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Opcjonalnie"
                    />
                </div>

                <div>
                    <label htmlFor="resolve-repair-cost" className="block text-sm font-medium text-gray-700 mb-2">
                        Koszt naprawy (PLN)
                    </label>
                    <input
                        id="resolve-repair-cost"
                        type="number"
                        name="repair_cost"
                        min="0"
                        step="0.01"
                        value={formData.repair_cost}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Opcjonalnie"
                    />
                </div>

                <div>
                    <label htmlFor="resolve-payment-method" className="block text-sm font-medium text-gray-700 mb-2">
                        Forma płatności
                    </label>
                    <select
                        id="resolve-payment-method"
                        name="payment_method"
                        value={formData.payment_method}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="">Wybierz</option>
                        <option value="Card">Karta</option>
                        <option value="Cash">Gotówka</option>
                    </select>
                </div>

                {submitError && (
                    <p className="text-sm text-red-600">{submitError}</p>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        Anuluj
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? "Zapisywanie..." : "Zamknij zgłoszenie"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
