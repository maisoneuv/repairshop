import { ChevronLeft, ChevronRight } from "lucide-react";
import { WEEKDAYS } from "../Appointments/constants";
import { addDays, parseISODate, toISODate, todayISO, weekDays } from "./dates";

export default function WeekStrip({ selected, onSelect, countsByDate }) {
    const days = weekDays(parseISODate(selected));
    const today = todayISO();
    const shift = (n) => onSelect(toISODate(addDays(parseISODate(selected), n)));

    return (
        <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-7)} aria-label="Previous week"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="grid flex-1 grid-cols-7 gap-1">
                {days.map((d, i) => {
                    const iso = toISODate(d);
                    const isSelected = iso === selected;
                    const count = countsByDate[iso] || 0;
                    return (
                        <button
                            key={iso}
                            type="button"
                            onClick={() => onSelect(iso)}
                            aria-pressed={isSelected}
                            className={`flex flex-col items-center rounded-md py-1 text-xs transition-colors ${
                                isSelected ? "bg-blue-50 text-blue-800" : "text-gray-500 hover:bg-gray-50"
                            }`}
                        >
                            <span className={iso === today ? "font-semibold text-blue-600" : ""}>{WEEKDAYS[i]}</span>
                            <span className={`text-sm ${iso === today ? "font-semibold text-blue-700" : "text-gray-800"}`}>{d.getDate()}</span>
                            <span
                                className={`mt-0.5 h-1 w-1 rounded-full ${count ? "bg-gray-400" : "bg-transparent"}`}
                                aria-label={count ? `${count} planned` : undefined}
                                title={count ? `${count} planned` : undefined}
                            />
                        </button>
                    );
                })}
            </div>
            <button type="button" onClick={() => shift(7)} aria-label="Next week"
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                <ChevronRight className="w-4 h-4" />
            </button>
            {selected !== today && (
                <button type="button" onClick={() => onSelect(today)}
                    className="ml-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                    Today
                </button>
            )}
        </div>
    );
}
