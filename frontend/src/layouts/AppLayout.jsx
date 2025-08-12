import { NavLink, Outlet } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";
import { useUser } from "../context/UserContext";

export default function AppLayout() {
    const { user } = useUser();

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            {user && (
                <nav className="bg-white shadow mb-6">
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                        {/* Left nav links */}
                        <div className="flex gap-6">
                            <NavLink to="/" className={({ isActive }) => isActive ? "font-bold text-blue-600" : ""}>Home</NavLink>
                            <NavLink to="/work-items" className={({ isActive }) => isActive ? "font-bold text-blue-600" : ""}>Work Items</NavLink>
                            <NavLink to="/tasks" className={({ isActive }) => isActive ? "font-bold text-blue-600" : ""}>Tasks</NavLink>
                            <NavLink to="/customers" className={({ isActive }) => isActive ? "font-bold text-blue-600" : ""}>Customers</NavLink>
                        </div>

                        {/* Right-side logout */}
                        <LogoutButton />
                    </div>
                </nav>
            )}
            <main className="max-w-6xl mx-auto px-4">
                <Outlet />
            </main>
        </div>
    );
}
