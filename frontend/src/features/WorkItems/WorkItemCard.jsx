import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { Calendar, User } from "lucide-react";

function isOverdue(dueDateStr, statusRole) {
    if (!dueDateStr || statusRole === "resolved" || statusRole === "cancelled") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dueDateStr) < today;
}

export default function WorkItemCard({ item, statusRole }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: String(item.id),
        data: { status: item.status },
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : 1,
        cursor: isDragging ? "grabbing" : "grab",
    };

    const assignee = item.technician || item.owner;
    const overdue = isOverdue(item.due_date, statusRole);

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
                    to={`/work-items/${item.id}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline leading-tight"
                >
                    {item.reference_id}
                </Link>
            </div>

            {item.customer_name && (
                <p className="text-sm text-gray-800 font-medium leading-tight truncate">
                    {item.customer_name}
                </p>
            )}

            {item.device_name && (
                <p className="text-xs text-gray-500 leading-tight truncate">{item.device_name}</p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
                {assignee ? (
                    <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
                        <User size={11} className="shrink-0" />
                        <span className="truncate">{assignee.name}</span>
                    </div>
                ) : (
                    <span />
                )}

                {item.due_date && (
                    <div
                        className={`flex items-center gap-1 text-xs shrink-0 ${
                            overdue ? "text-red-600 font-medium" : "text-gray-400"
                        }`}
                    >
                        <Calendar size={11} />
                        <span>
                            {new Date(item.due_date).toLocaleDateString(undefined, {
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
