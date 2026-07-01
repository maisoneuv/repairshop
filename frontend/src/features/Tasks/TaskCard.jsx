import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { Calendar, User, Wrench } from "lucide-react";

function isOverdue(dueDateStr, statusRole) {
    if (!dueDateStr || statusRole === "resolved" || statusRole === "cancelled") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dueDateStr) < today;
}

export default function TaskCard({ task, statusRole }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: String(task.id),
        data: { status: task.status },
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : 1,
        cursor: isDragging ? "grabbing" : "grab",
    };

    const overdue = isOverdue(task.due_date, statusRole);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 space-y-2 hover:shadow-md hover:border-gray-300 transition-shadow select-none"
        >
            <div className="flex items-start justify-between gap-2">
                <Link
                    to={`/tasks/${task.id}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline leading-tight"
                >
                    {task.reference_id || `#${task.id}`}
                </Link>
                {task.task_type?.name && (
                    <span className="text-xs text-gray-400 shrink-0">{task.task_type.name}</span>
                )}
            </div>

            {task.summary && (
                <p className="text-sm text-gray-800 leading-tight line-clamp-2">{task.summary}</p>
            )}

            {task.work_item && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Wrench size={10} className="shrink-0" />
                    <span className="truncate">{task.work_item.reference_id}</span>
                </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
                {task.assigned_employee ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
                        <User size={11} className="shrink-0" />
                        <span className="truncate">{task.assigned_employee.name}</span>
                    </div>
                ) : (
                    <span />
                )}

                {task.due_date && (
                    <div
                        className={`flex items-center gap-1 text-xs shrink-0 ${
                            overdue ? "text-red-600 font-medium" : "text-gray-400"
                        }`}
                    >
                        <Calendar size={11} />
                        <span>
                            {new Date(task.due_date).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                            })}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
