import { PackageCheck, PackagePlus } from "lucide-react";
import { TYPE_LABELS } from "./constants";

const STYLES = {
    pickup: { icon: PackagePlus, className: "bg-sky-50 text-sky-800 border-sky-200" },
    return_delivery: { icon: PackageCheck, className: "bg-violet-50 text-violet-800 border-violet-200" },
};

export default function TypeBadge({ type }) {
    const { icon: Icon, className } = STYLES[type] || STYLES.pickup;
    return (
        <span className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${className}`}>
            <Icon className="w-3 h-3" aria-hidden="true" />
            {TYPE_LABELS[type]}
        </span>
    );
}
