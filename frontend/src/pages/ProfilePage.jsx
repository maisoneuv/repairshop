import { Link } from "react-router-dom";
import { useUser } from "../context/UserContext";

export default function ProfilePage() {
    const { user, employee, currentTenant } = useUser();

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-600">Not logged in</p>
            </div>
        );
    }

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.name;

    return (
        <div className="max-w-2xl mx-auto">
            {/* Back Link */}
            <div className="mb-4">
                <Link
                    to="/"
                    className="text-gray-600 hover:text-gray-900 transition-colors text-sm flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Home
                </Link>
            </div>

            {/* Profile Card */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h1 className="text-xl font-bold text-gray-900 mb-6">My Profile</h1>

                <div className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
                        <p className="text-gray-900 font-medium">
                            {fullName || <span className="text-gray-500">Not set</span>}
                        </p>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                        <p className="text-gray-900">{user.email}</p>
                    </div>

                    {/* Phone */}
                    {user.phone_number && (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
                            <p className="text-gray-900">{user.phone_number}</p>
                        </div>
                    )}

                    {/* Company */}
                    {user.company && (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Company</label>
                            <p className="text-gray-900">{user.company}</p>
                        </div>
                    )}

                    {/* Tenant */}
                    {currentTenant?.name && (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Organization</label>
                            <p className="text-gray-900">{currentTenant.name}</p>
                        </div>
                    )}

                    {/* Employee Info */}
                    {employee && (
                        <div className="border-t border-gray-200 pt-4 mt-4">
                            <h2 className="text-sm font-semibold text-gray-900 mb-3">Employee Details</h2>

                            {employee.role && (
                                <div className="mb-3">
                                    <label className="block text-sm font-medium text-gray-600 mb-1">Role</label>
                                    <p className="text-gray-900">{employee.role}</p>
                                </div>
                            )}

                            {employee.location_name && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-600 mb-1">Location</label>
                                    <p className="text-gray-900">{employee.location_name}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
