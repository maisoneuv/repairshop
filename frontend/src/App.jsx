import WorkItemList from "./features/WorkItems/WorkItemList";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Home from "./pages/Home";
import WorkItemDetail from "./pages/WorkItemDetail";
import WorkItemPage from "./pages/WorkItemPage";
import CustomerDetail from "./pages/CustomerDetail";
import TaskDetail from "./features/Tasks/TaskDetail";
import TaskList from "./features/Tasks/TaskList";
import TaskForm from "./features/Tasks/TaskForm";
import LoginPage from "./pages/LoginPage";
import SearchResults from "./pages/SearchResults";
import AllTasks from "./pages/AllTasks";
import MyTasks from "./pages/MyTasks";
import ProfilePage from "./pages/ProfilePage";
import CashRegisterList from "./features/CashRegisters/CashRegisterList";
import CashRegisterDetail from "./features/CashRegisters/CashRegisterDetail";
import CashRegisterForm from "./features/CashRegisters/CashRegisterForm";
import InventoryStock from "./features/Inventory/InventoryStock";
import ReceiveDelivery from "./features/Inventory/ReceiveDelivery";
import SettingsPage from "./pages/SettingsPage";
import LockScreen from "./components/LockScreen";
import { useUser } from "./context/UserContext";
import LeadBoard from "./pages/LeadBoard";
import CarMode from "./pages/CarMode";

function App() {
    const { user, loading, isLocked } = useUser();

    if (loading) return null;

    if (isLocked) return <LockScreen />;

    if (!user) {
        return (
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }

    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/work-items" element={<WorkItemList />} />
                <Route path="/work-items/new" element={<WorkItemPage />} />
                <Route path="/work-items/:id" element={<WorkItemDetail />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/tasks/new" element={<TaskForm />} />
                <Route path="/tasks/:id" element={<TaskDetail />} />
                <Route path="/tasks/all" element={<AllTasks />} />
                <Route path="/tasks/my" element={<MyTasks />} />
                <Route path="/tasks" element={<TaskList />} />
                <Route path="/inventory" element={<InventoryStock />} />
                <Route path="/inventory/receive" element={<ReceiveDelivery />} />
                <Route path="/inventory/stock" element={<Navigate to="/inventory" replace />} />
                <Route path="/cash-registers" element={<CashRegisterList />} />
                <Route path="/cash-registers/new" element={<CashRegisterForm />} />
                <Route path="/cash-registers/:id" element={<CashRegisterDetail />} />
                <Route path="/search" element={<SearchResults />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/leads" element={<LeadBoard />} />
            </Route>
            <Route path="/car" element={<CarMode />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
export default App;
