import WorkItemList from "./features/WorkItems/WorkItemList";
import { Routes, Route } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import Home from "./pages/Home";
import WorkItemDetail from "./pages/WorkItemDetail";
import TaskDetail from "./features/Tasks/TaskDetail";
import TaskList from "./features/Tasks/TaskList";
import TaskForm from "./features/Tasks/TaskForm";
import LoginPage from "./pages/LoginPage";

function App() {
    return (
        <Routes>
            <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/work-items" element={<WorkItemList />} />
                <Route path="/work-items/:id" element={<WorkItemDetail />} />
                <Route path="/tasks/new" element={<TaskForm />} />
                <Route path="/tasks/:id" element={<TaskDetail />} />
                <Route path="/tasks" element={<TaskList />} />

            </Route>
        </Routes>
    );
}
export default App;
