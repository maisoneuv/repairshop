import { useState, useMemo } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { updateWorkItemField } from "../../api/workItems";
import { getStatusStyle } from "../../utils/statusColors";
import WorkItemCard from "./WorkItemCard";

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
                {cards.map((item) => (
                    <WorkItemCard key={item.id} item={item} statusRole={statusRole} />
                ))}
            </div>
        </div>
    );
}

export default function WorkItemBoard({
    items,
    statusOptions,
    statusColorMap,
    ownerFilter,
    view,
    employee,
    onItemsChange,
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

    const filteredItems = useMemo(() => {
        let result = items;
        if (view === "my" && employee) {
            result = result.filter((item) => {
                const ownerId = typeof item.owner === "object" ? item.owner?.id : item.owner;
                const techId = typeof item.technician === "object" ? item.technician?.id : item.technician;
                return ownerId === employee.id || techId === employee.id;
            });
        }
        if (ownerFilter) {
            result = result.filter((item) => {
                const ownerId = typeof item.owner === "object" ? item.owner?.id : item.owner;
                return String(ownerId) === String(ownerFilter);
            });
        }
        return result;
    }, [items, view, employee, ownerFilter]);

    const itemsByStatus = useMemo(() => {
        const map = {};
        for (const s of statusOptions) map[s.value] = [];
        for (const item of filteredItems) {
            if (map[item.status]) {
                map[item.status].push(item);
            } else {
                map[item.status] = [item];
            }
        }
        return map;
    }, [filteredItems, statusOptions]);

    const activeItem = useMemo(
        () => (activeId ? items.find((i) => String(i.id) === activeId) : null),
        [activeId, items]
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
        const draggedItem = items.find((i) => String(i.id) === draggedId);

        if (!draggedItem || draggedItem.status === newStatus) return;

        // Optimistic update
        const updatedItems = items.map((i) =>
            String(i.id) === draggedId ? { ...i, status: newStatus } : i
        );
        onItemsChange(updatedItems);

        try {
            await updateWorkItemField(draggedItem.id, { status: newStatus });
        } catch (err) {
            // Roll back on error
            onItemsChange(items);
            console.error("Failed to update status:", err);
        }
    }

    const activeStatusRole = activeItem ? statusRoleMap[activeItem.status] : undefined;

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
                        cards={itemsByStatus[status.value] || []}
                        statusColorMap={statusColorMap}
                        statusRoleMap={statusRoleMap}
                        isOver={overId === status.value}
                    />
                ))}
            </div>

            <DragOverlay dropAnimation={null}>
                {activeItem ? (
                    <div className="rotate-1 shadow-xl opacity-95">
                        <WorkItemCard item={activeItem} statusRole={activeStatusRole} />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
