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
import { useUser } from "./context/UserContext";

function App() {
    const { user, loading } = useUser();

    if (loading) return null;

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
                <Route path="/search" element={<SearchResults />} />

            </Route>
            <Route path="/login" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
export default App;
