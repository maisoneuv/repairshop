import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getCustomer, updateCustomer } from "../api/customers";
import { fetchCustomerAssets } from "../api/assets";
import { fetchWorkItems } from "../api/workItems";
import CustomerForm from "../components/CustomerForm";

export default function CustomerDetail() {
    const { id } = useParams();
    const [customer, setCustomer] = useState(null);
    const [assets, setAssets] = useState([]);
    const [workItems, setWorkItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);
                const [customerData, assetsData, workItemsData] = await Promise.all([
                    getCustomer(id),
                    fetchCustomerAssets(id).catch(() => []),
                    fetchWorkItems({ customer: id }).catch((err) => {
                        console.error('Error fetching work items:', err);
                        return [];
                    })
                ]);

                setCustomer(customerData);
                setAssets(assetsData);
                // API returns array directly, not paginated object
                setWorkItems(Array.isArray(workItemsData) ? workItemsData : []);
            } catch (err) {
                console.error("Failed to load customer:", err);
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [id]);

    const handleCustomerUpdated = (updatedCustomer) => {
        setCustomer(updatedCustomer);
        setIsEditing(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading customer...</p>
                </div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-600">Customer not found</p>
                    <Link to="/" className="text-indigo-600 hover:underline mt-4 inline-block">
                        Go back home
                    </Link>
                </div>
            </div>
        );
    }

    const formatDate = (dateString) => {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 xl:px-8 py-4 sm:py-6">
                {/* Back Link */}
                <div className="mb-4">
                    <Link
                        to="/"
                        className="text-gray-600 hover:text-gray-900 transition-colors text-sm sm:text-base flex items-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Home
                    </Link>
                </div>

                {/* Header */}
                <div className="bg-white text-gray-900 px-4 sm:px-6 py-4 sm:py-6 rounded-xl border border-gray-200 shadow-lg mb-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
                        <div className="flex-1">
                            <h1 className="text-xl sm:text-2xl font-bold mb-1 leading-tight">
                                {customer.first_name} {customer.last_name}
                            </h1>
                            <p className="text-gray-600">Customer #{customer.id}</p>
                        </div>

                        <div className="flex justify-end mt-2 lg:mt-0">
                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                type="button"
                                className="text-sm text-blue-600 hover:underline"
                            >
                                {isEditing ? 'Cancel' : 'Edit'}
                            </button>
                        </div>
                    </div>

                    {/* Highlights Section */}
                    <div className="border-t border-gray-200 pt-6 mt-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                            <div className="text-center sm:text-left bg-gray-50 sm:bg-transparent p-4 sm:p-0 rounded-lg">
                                <span className="text-xs sm:text-sm font-medium text-gray-600 uppercase tracking-wide block mb-2">
                                    Email
                                </span>
                                <div className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                                    {customer.email ? (
                                        <a
                                            href={`mailto:${customer.email}`}
                                            className="text-indigo-600 hover:text-indigo-800 transition-colors"
                                        >
                                            {customer.email}
                                        </a>
                                    ) : (
                                        <span className="text-gray-500">Not set</span>
                                    )}
                                </div>
                            </div>

                            <div className="text-center sm:text-left bg-gray-50 sm:bg-transparent p-4 sm:p-0 rounded-lg">
                                <span className="text-xs sm:text-sm font-medium text-gray-600 uppercase tracking-wide block mb-2">
                                    Phone
                                </span>
                                <div className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                                    {customer.phone_number ? (
                                        <a
                                            href={`tel:${customer.phone_number}`}
                                            className="text-indigo-600 hover:text-indigo-800 transition-colors"
                                        >
                                            {customer.phone_number}
                                        </a>
                                    ) : (
                                        <span className="text-gray-500">Not set</span>
                                    )}
                                </div>
                            </div>

                            <div className="text-center sm:text-left bg-gray-50 sm:bg-transparent p-4 sm:p-0 rounded-lg">
                                <span className="text-xs sm:text-sm font-medium text-gray-600 uppercase tracking-wide block mb-2">
                                    Referral Source
                                </span>
                                <div className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                                    {customer.referral_source || 'Not set'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex flex-col xl:flex-row gap-4 sm:gap-6">
                    {/* Left Column - Main Content */}
                    <div className="flex-1 space-y-4 sm:space-y-6">
                        {/* Customer Details */}
                        {isEditing ? (
                            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Customer</h3>
                                <CustomerForm
                                    initialData={customer}
                                    mode="edit"
                                    submitLabel="Save Changes"
                                    onSuccess={handleCustomerUpdated}
                                />
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Details</h3>

                                <div className="space-y-4">
                                    {/* Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-1">Full Name</label>
                                        <p className="text-gray-900 font-medium">
                                            {customer.first_name} {customer.last_name}
                                        </p>
                                    </div>

                                    {/* Contact Information */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                                            <div className="text-gray-900">
                                                {customer.email ? (
                                                    <a
                                                        href={`mailto:${customer.email}`}
                                                        className="text-indigo-600 hover:text-indigo-800 transition-colors"
                                                    >
                                                        {customer.email}
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-500">Not set</span>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
                                            <div className="text-gray-900">
                                                {customer.phone_number ? (
                                                    <a
                                                        href={`tel:${customer.phone_number}`}
                                                        className="text-indigo-600 hover:text-indigo-800 transition-colors"
                                                    >
                                                        {customer.phone_number}
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-500">Not set</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tax Code */}
                                    {customer.tax_code && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">Tax Code</label>
                                            <p className="text-gray-900">{customer.tax_code}</p>
                                        </div>
                                    )}

                                    {/* Referral Source */}
                                    {customer.referral_source && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">Referral Source</label>
                                            <p className="text-gray-900">{customer.referral_source}</p>
                                        </div>
                                    )}

                                    {/* Address */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-1">Address</label>
                                        <div className="text-gray-900">
                                            {customer.address ? (
                                                <div className="space-y-1 bg-gray-50 p-4 rounded-lg">
                                                    <p>{customer.address.street} {customer.address.building_number}</p>
                                                    {customer.address.apartment_number && (
                                                        <p>Apt {customer.address.apartment_number}</p>
                                                    )}
                                                    <p>{customer.address.city}, {customer.address.postal_code}</p>
                                                    {customer.address.country && <p>{customer.address.country}</p>}
                                                </div>
                                            ) : (
                                                <span className="text-gray-500">No address on file</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar */}
                    <div className="w-full xl:w-96 space-y-4 sm:space-y-6">
                        {/* Customer Assets/Devices Card */}
                        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Devices</h3>

                            {assets.length > 0 ? (
                                <div className="space-y-3">
                                    {assets.map((asset) => (
                                        <div
                                            key={asset.id}
                                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <p className="font-medium text-gray-900">
                                                        {asset.device?.manufacturer} {asset.device?.model}
                                                    </p>
                                                    <p className="text-sm text-gray-600 mt-1">
                                                        S/N: {asset.serial_number}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-gray-500 text-sm">No devices registered</p>
                                </div>
                            )}
                        </div>

                        {/* Customer Work Items Card */}
                        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Work Items</h3>

                            {workItems.length > 0 ? (
                                <div className="space-y-3">
                                    {workItems.map((item) => (
                                        <Link
                                            key={item.id}
                                            to={`/work-items/${item.id}`}
                                            className="block border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium text-indigo-600 hover:text-indigo-800">
                                                    {item.reference_id || `#${item.id}`}
                                                </span>
                                                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                    item.status === 'Resolved' ? 'bg-green-100 text-green-800' :
                                                    item.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                                    item.status === 'New' ? 'bg-sky-100 text-sky-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {item.status}
                                                </span>
                                            </div>
                                            {item.device_name && (
                                                <p className="text-sm font-medium text-gray-900 mb-1">
                                                    {item.device_name}
                                                </p>
                                            )}
                                            {item.summary && (
                                                <p className="text-sm text-gray-600 mb-2">{item.summary}</p>
                                            )}
                                            {item.created_date && (
                                                <p className="text-xs text-gray-400">
                                                    Created: {formatDate(item.created_date)}
                                                </p>
                                            )}
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <p className="text-gray-500 text-sm">No work items found</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
