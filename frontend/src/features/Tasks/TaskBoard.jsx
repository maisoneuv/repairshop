import { useState, useMemo } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { updateTaskField } from "../../api/tasks";
import { getStatusStyle } from "../../utils/statusColors";
import TaskCard from "./TaskCard";

const ACCENT_COLORS = {
    gray: "border-gray-400",
    sky: "border-sky-400",
    amber: "border-amber-400",
    emerald: "border-emerald-400",
    purple: "border-purple-400",
    rose: "border-rose-400",
    indigo: "border-indigo-400",
    teal: "border-teal-400",
    orange: "border-orange-400",
    pink: "border-pink-400",
};

function KanbanColumn({ status, cards, statusColorMap, statusRoleMap, isOver }) {
    const { setNodeRef } = useDroppable({ id: status.value });
    const badgeClasses = getStatusStyle(status.value, statusColorMap);
    const accentColor = ACCENT_COLORS[status.color] || ACCENT_COLORS.gray;
    const statusRole = statusRoleMap[status.value];

    return (
        <div className="flex flex-col w-64 shrink-0">
            <div className={`rounded-t-lg border-t-4 ${accentColor} bg-gray-50 border border-gray-200 border-t-0 px-3 py-2 flex items-center gap-2`}>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badgeClasses}`}>
                    {status.name}
                </span>
                <span className="text-xs text-gray-400 font-medium ml-auto">{cards.length}</span>
            </div>

            <div
                ref={setNodeRef}
                className={`flex-1 min-h-48 rounded-b-lg border border-t-0 border-gray-200 p-2 space-y-2 transition-colors ${
                    isOver ? "bg-blue-50 border-blue-300" : "bg-gray-50"
                }`}
            >
                {cards.map((task) => (
                    <TaskCard key={task.id} task={task} statusRole={statusRole} />
                ))}
            </div>
        </div>
    );
}

export default function TaskBoard({
    tasks,
    statusOptions,
    statusColorMap,
    assigneeFilter,
    onTasksChange,
}) {
    const [activeId, setActiveId] = useState(null);
    const [overId, setOverId] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const statusRoleMap = useMemo(() => {
        const map = {};
        for (const s of statusOptions) {
            if (s.status_role) map[s.value] = s.status_role;
        }
        return map;
    }, [statusOptions]);

    const filteredTasks = useMemo(() => {
        if (!assigneeFilter) return tasks;
        return tasks.filter((t) => String(t.assigned_employee?.id) === String(assigneeFilter));
    }, [tasks, assigneeFilter]);

    const tasksByStatus = useMemo(() => {
        const map = {};
        for (const s of statusOptions) map[s.value] = [];
        for (const task of filteredTasks) {
            if (map[task.status]) {
                map[task.status].push(task);
            } else {
                map[task.status] = [task];
            }
        }
        return map;
    }, [filteredTasks, statusOptions]);

    const activeTask = useMemo(
        () => (activeId ? tasks.find((t) => String(t.id) === activeId) : null),
        [activeId, tasks]
    );

    function handleDragStart(event) {
        setActiveId(String(event.active.id));
    }

    function handleDragOver(event) {
        setOverId(event.over ? String(event.over.id) : null);
    }

    async function handleDragEnd(event) {
        const { active, over } = event;
        setActiveId(null);
        setOverId(null);

        if (!over) return;

        const draggedId = String(active.id);
        const newStatus = String(over.id);
        const draggedTask = tasks.find((t) => String(t.id) === draggedId);

        if (!draggedTask || draggedTask.status === newStatus) return;

        // Optimistic update
        const updatedTasks = tasks.map((t) =>
            String(t.id) === draggedId ? { ...t, status: newStatus } : t
        );
        onTasksChange(updatedTasks);

        try {
            await updateTaskField(draggedTask.id, { status: newStatus });
        } catch (err) {
            // Roll back on error
            onTasksChange(tasks);
            console.error("Failed to update task status:", err);
        }
    }

    const activeStatusRole = activeTask ? statusRoleMap[activeTask.status] : undefined;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1">
                {statusOptions.map((status) => (
                    <KanbanColumn
                        key={status.value}
                        status={status}
                        cards={tasksByStatus[status.value] || []}
                        statusColorMap={statusColorMap}
                        statusRoleMap={statusRoleMap}
                        isOver={overId === status.value}
                    />
                ))}
            </div>

            <DragOverlay dropAnimation={null}>
                {activeTask ? (
                    <div className="rotate-1 shadow-xl opacity-95">
                        <TaskCard task={activeTask} statusRole={activeStatusRole} />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
