import { useUser } from "../context/UserContext";

export default function LogoutButton() {
    const { logout } = useUser();

    return (
        <button
            type="button"
            onClick={logout}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
        >
            Logout
        </button>
    );
}
