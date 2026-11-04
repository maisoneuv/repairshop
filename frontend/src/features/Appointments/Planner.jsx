import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, List, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import {
    apiErrorMessage,
    createRoute,
    listAppointments,
    listDrivers,
    listRoutes,
    nearbyAppointments,
    reorderRoute,
    scheduleAppointment,
    setAppointmentLocation,
    updateDriver,
    updateRoute,
} from "../../api/appointments";
import AppointmentForm from "./AppointmentForm";
import { SUCCESS_MESSAGES, runAppointmentAction } from "./appointmentActions";
import AppointmentMap from "./AppointmentMap";
import DayPlan from "./DayPlan";
import DriversModal from "./DriversModal";
import EndpointModal from "./EndpointModal";
import InboxList from "./InboxList";
import SelectedPanel from "./SelectedPanel";
import { availableOn, contactName, formatDay, hasLocation, shiftDay, toISODate } from "./constants";

// Kept clear of the pickup (sky), return (violet) and not-home (amber) pin colours.
const ROUTE_COLORS = ["#1f2937", "#db2777", "#0d9488", "#65a30d", "#be123c", "#4338ca"];

function haversineKm([lat1, lng1], [lat2, lng2]) {
    const rad = (d) => (d * Math.PI) / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
        + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function pathKm(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) total += haversineKm(points[i - 1], points[i]);
    return total;
}

const hasPoint = (endpoint) => endpoint?.latitude != null && endpoint?.longitude != null;
const toPoint = (p) => [Number(p.latitude), Number(p.longitude)];

function homeEndpoint(driver) {
    const home = driver?.home_address;
    if (!home) return null;
    const street = [home.street, home.building_number].filter(Boolean).join(" ");
    return {
        kind: "home",
        label: "Home",
        address: [street, home.city].filter(Boolean).join(", "),
        latitude: home.latitude,
        longitude: home.longitude,
    };
}

// What a new route for this driver will use, mirroring the server's defaults.
function defaultEndpoints(driver) {
    if (!driver) return { start: null, end: null };
    const shop = { kind: "shop", label: driver.location_name, address: driver.location_name };
    return { start: homeEndpoint(driver) || shop, end: shop };
}

function buildColumns(drivers, routes, dayAppointments) {
    const byId = Object.fromEntries(dayAppointments.map((a) => [a.id, a]));
    const routeByDriver = Object.fromEntries(routes.map((r) => [r.driver ?? "none", r]));
    const keys = drivers.map((d) => ({ key: String(d.id), driverId: d.id, name: d.name, driver: d }));
    for (const route of routes) {
        const key = String(route.driver ?? "none");
        if (!keys.some((k) => k.key === key)) {
            keys.push({ key, driverId: route.driver, name: route.driver_name || "Unassigned", driver: null });
        }
    }
    if (keys.length === 0) keys.push({ key: "none", driverId: null, name: "Route", driver: null });

    return keys.map((k, i) => {
        const route = routeByDriver[k.driverId ?? "none"];
        const stops = (route?.stop_ids || []).map((id) => byId[id]).filter(Boolean);
        const defaults = defaultEndpoints(k.driver);
        const start = route ? route.start : defaults.start;
        const end = route ? route.end : defaults.end;
        const located = stops.filter(hasLocation).map((s) => [Number(s.address.latitude), Number(s.address.longitude)]);
        const path = [
            ...(hasPoint(start) ? [toPoint(start)] : []),
            ...located,
            ...(hasPoint(end) ? [toPoint(end)] : []),
        ];
        return {
            ...k,
            shopName: k.driver?.location_name || (start?.kind === "shop" ? start.label : end?.kind === "shop" ? end.label : null),
            hasHome: Boolean(k.driver?.home_address || route?.has_home),
            color: ROUTE_COLORS[i % ROUTE_COLORS.length],
            route,
            stops,
            start,
            end,
            path,
            distanceKm: stops.length ? pathKm(path) : 0,
            mapsUrls: route?.google_maps_urls || [],
        };
    });
}

function endpointMarkers(columns) {
    const markers = [];
    for (const c of columns) {
        if (!c.route) continue;
        const same = hasPoint(c.start) && hasPoint(c.end)
            && Number(c.start.latitude) === Number(c.end.latitude) && Number(c.start.longitude) === Number(c.end.longitude);
        if (hasPoint(c.start)) markers.push({ key: `${c.key}-start`, role: same ? "Start and end" : "Start", ...c.start });
        if (hasPoint(c.end) && !same) markers.push({ key: `${c.key}-end`, role: "End", ...c.end });
    }
    return markers;
}

export default function Planner() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const day = searchParams.get("day") || toISODate(new Date());
    const [typeFilter, setTypeFilter] = useState("all");
    const [onlyAvailable, setOnlyAvailable] = useState(false);

    const [inbox, setInbox] = useState([]);
    const [dayAppointments, setDayAppointments] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectedId, setSelectedId] = useState(null);
    const [nearby, setNearby] = useState(null);
    const [placing, setPlacing] = useState(null);
    const [form, setForm] = useState(null);
    const [showDrivers, setShowDrivers] = useState(false);
    const [editingEndpoint, setEditingEndpoint] = useState(null);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    const loadDrivers = useCallback(() => listDrivers({ is_driver: 1 }).then(setDrivers).catch(() => setDrivers([])), []);

    const refresh = useCallback(async () => {
        try {
            const [open, onDay, dayRoutes] = await Promise.all([
                listAppointments({ unscheduled: 1 }),
                listAppointments({ date: day }),
                listRoutes({ date: day }),
            ]);
            setInbox(open);
            setDayAppointments(onDay);
            setRoutes(dayRoutes);
        } catch (err) {
            toast.error(apiErrorMessage(err, "Could not load appointments."));
        } finally {
            setLoading(false);
        }
    }, [day]);

    useEffect(() => { loadDrivers(); }, [loadDrivers]);

    const focus = Number(searchParams.get("focus")) || null;
    useEffect(() => {
        if (focus) setSelectedId(focus);
    }, [focus]);
    useEffect(() => { refresh(); }, [refresh]);

    // Pins are geocoded in the background right after saving; poll a few times
    // for them, then give up so a stopped worker doesn't mean polling forever.
    const locating = inbox.some((a) => a.address?.geocode_status === "pending");
    const pollsLeft = useRef(5);
    useEffect(() => {
        if (!locating || pollsLeft.current <= 0) return undefined;
        const timer = setTimeout(() => {
            pollsLeft.current -= 1;
            refresh();
        }, 3000);
        return () => clearTimeout(timer);
    }, [locating, inbox, refresh]);

    const columns = useMemo(() => buildColumns(drivers, routes, dayAppointments), [drivers, routes, dayAppointments]);

    const filteredInbox = useMemo(() => {
        const dayIds = new Set(columns.flatMap((c) => c.stops.map((s) => s.id)));
        return inbox
            .filter((a) => !dayIds.has(a.id))
            .filter((a) => typeFilter === "all" || a.type === typeFilter)
            .filter((a) => !onlyAvailable || availableOn(a, day) !== false)
            .sort((a, b) => {
                const rank = (x) => ({ true: 0, null: 1, false: 2 })[String(availableOn(x, day))];
                return rank(a) - rank(b) || a.id - b.id;
            });
    }, [inbox, columns, typeFilter, onlyAvailable, day]);

    const mapAppointments = useMemo(() => {
        const seen = new Map();
        for (const a of [...filteredInbox, ...columns.flatMap((c) => c.stops)]) seen.set(a.id, a);
        return [...seen.values()];
    }, [filteredInbox, columns]);

    const stopNumbers = useMemo(() => {
        const numbers = {};
        for (const column of columns) {
            column.stops.forEach((s, i) => { numbers[s.id] = { number: i + 1, color: column.color }; });
        }
        return numbers;
    }, [columns]);

    const allKnown = useMemo(() => {
        const map = new Map();
        for (const a of [...inbox, ...dayAppointments]) map.set(a.id, a);
        return map;
    }, [inbox, dayAppointments]);
    const selected = selectedId ? allKnown.get(selectedId) : null;

    useEffect(() => {
        if (selectedId && !allKnown.has(selectedId)) setSelectedId(null);
    }, [selectedId, allKnown]);

    function select(id) {
        setSelectedId(id);
        setNearby((prev) => (prev && prev.id === id ? prev : null));
    }

    function setDay(value) {
        const next = new URLSearchParams(searchParams);
        next.set("day", value);
        setSearchParams(next, { replace: true });
    }

    async function run(promise, success) {
        try {
            const result = await promise;
            if (success) toast.success(success);
            await refresh();
            return result;
        } catch (err) {
            toast.error(apiErrorMessage(err));
            await refresh();
            return null;
        }
    }

    function addToDay(appointment, column, position) {
        return run(
            scheduleAppointment(appointment.id, { date: day, driver: column.driverId, position }),
            position === undefined ? `${contactName(appointment)} added to ${formatDay(day)}` : null,
        );
    }

    async function handleAction(action, appointment) {
        let result = null;
        try {
            result = await runAppointmentAction(action, appointment);
            if (!result) return false;
            if (SUCCESS_MESSAGES[action]) toast.success(SUCCESS_MESSAGES[action]);
            if (result.work_item_id) {
                navigate(`/work-items/${result.work_item_id}`);
                return true;
            }
        } catch (err) {
            toast.error(apiErrorMessage(err));
        }
        await refresh();
        return Boolean(result);
    }

    async function showNearby(appointment, radiusKm) {
        if (!radiusKm) {
            setNearby(null);
            return;
        }
        try {
            const results = await nearbyAppointments(appointment.id, radiusKm);
            setNearby({ id: appointment.id, radiusKm, results });
        } catch (err) {
            toast.error(apiErrorMessage(err));
        }
    }

    async function place(lat, lng) {
        const appointment = placing;
        setPlacing(null);
        await run(setAppointmentLocation(appointment.id, lat.toFixed(6), lng.toFixed(6)), "Pin placed");
    }

    function columnOf(key) {
        return columns.find((c) => c.key === key);
    }

    async function handleDragEnd({ active, over }) {
        if (!over) return;
        const appointmentId = active.data.current?.appointmentId;
        const from = active.data.current?.column;
        const to = over.data.current?.column;
        if (!appointmentId || !to) return;
        const target = columnOf(to);
        const targetIds = target.stops.map((s) => s.id);
        const overId = over.data.current?.appointmentId;
        const overIndex = overId ? targetIds.indexOf(overId) : targetIds.length;

        if (from === to) {
            const oldIndex = targetIds.indexOf(appointmentId);
            if (oldIndex === overIndex || !target.route) return;
            const ids = arrayMove(targetIds, oldIndex, overIndex);
            setRoutes((prev) => prev.map((r) => (r.id === target.route.id ? { ...r, stop_ids: ids } : r)));
            await run(reorderRoute(target.route.id, ids), null);
            return;
        }
        const appointment = allKnown.get(appointmentId);
        if (appointment) await addToDay(appointment, target, overIndex);
    }

    async function saveEndpoint(column, which, endpoint) {
        const change = { [which]: endpoint };
        if (column.route) await updateRoute(column.route.id, change);
        else await createRoute({ date: day, driver: column.driverId, ...change });
        await refresh();
    }

    async function handleEndpointChange(column, which, kind) {
        if (kind === "other" || (kind === "home" && !column.hasHome)) {
            setEditingEndpoint({ column, which, kind });
            return;
        }
        try {
            await saveEndpoint(column, which, { kind });
        } catch (err) {
            toast.error(apiErrorMessage(err));
        }
    }

    function handleSaved(saved) {
        setForm(null);
        pollsLeft.current = 5;
        toast.success(`${saved.reference_id} saved`);
        refresh();
        setSelectedId(saved.id);
    }

    const highlightIds = nearby ? new Set(nearby.results.map((r) => r.id)) : null;
    const routeLines = columns.filter((c) => c.path.length > 1).map((c) => ({ key: c.key, positions: c.path, color: c.color }));
    const startPoints = endpointMarkers(columns);
    const notOnMap = mapAppointments.filter((a) => !hasLocation(a)).length;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="px-4 md:px-0">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <div className="mr-auto">
                        <h1 className="text-xl font-semibold text-gray-800">Route planner</h1>
                        <p className="text-sm text-gray-500">Group pickups and returns by area and plan who goes where each day.</p>
                    </div>
                    <Link
                        to="/appointments"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-gray-300"
                    >
                        <List className="w-4 h-4" /> All appointments
                    </Link>
                    <button
                        type="button"
                        onClick={() => setShowDrivers(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-gray-300"
                    >
                        <Users className="w-4 h-4" /> Drivers{drivers.length ? ` (${drivers.length})` : ""}
                    </button>
                    <button
                        type="button"
                        onClick={() => setForm({})}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        <Plus className="w-4 h-4" /> New pickup
                    </button>
                </div>

                <div className="grid gap-4 lg:h-[calc(100vh-11rem)] lg:min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)_340px]">
                    <section className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white">
                        <div className="space-y-2 border-b border-gray-100 p-3">
                            <h2 className="text-sm font-semibold text-gray-800">
                                Unscheduled <span className="font-normal text-gray-400">{filteredInbox.length}</span>
                            </h2>
                            <div className="flex flex-wrap gap-1">
                                {[["all", "All"], ["pickup", "Pickups"], ["return_delivery", "Returns"]].map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setTypeFilter(value)}
                                        className={`rounded-full px-2.5 py-1 text-xs ${
                                            typeFilter === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={onlyAvailable}
                                    onChange={(e) => setOnlyAvailable(e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-gray-300"
                                />
                                Hide people not home on {formatDay(day)}
                            </label>
                        </div>
                        <div className="max-h-[50vh] min-h-0 flex-1 overflow-y-auto p-3 lg:max-h-none">
                            {loading ? (
                                <p className="py-6 text-center text-sm text-gray-500">Loading...</p>
                            ) : (
                                <InboxList appointments={filteredInbox} day={day} selectedId={selectedId} onSelect={select} />
                            )}
                        </div>
                    </section>

                    <section className="relative isolate h-[60vh] min-h-0 lg:h-auto">
                        <AppointmentMap
                            appointments={mapAppointments}
                            stopNumbers={stopNumbers}
                            routeLines={routeLines}
                            startPoints={startPoints}
                            selectedId={selectedId}
                            highlightIds={highlightIds}
                            nearby={nearby && nearby.id === selectedId ? nearby : null}
                            placing={placing ? contactName(placing) : null}
                            onSelect={select}
                            onPlace={place}
                        />
                        {notOnMap > 0 && !selected && (
                            <div className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/95 px-3 py-1.5 text-xs text-amber-800 shadow">
                                {notOnMap} not on the map yet. Select one and choose "Place on map".
                            </div>
                        )}
                        {selected && (
                            <div className="absolute inset-x-3 bottom-3 z-[1000] flex justify-center">
                                <SelectedPanel
                                    appointment={selected}
                                    day={day}
                                    columns={columns}
                                    nearby={nearby && nearby.id === selected.id ? nearby : null}
                                    onClose={() => { setSelectedId(null); setNearby(null); }}
                                    onAddToDay={(a, column) => addToDay(a, column)}
                                    onNearby={showNearby}
                                    onPlace={(a) => setPlacing(a)}
                                    onEdit={(a) => setForm(a)}
                                    onAction={handleAction}
                                />
                            </div>
                        )}
                    </section>

                    <section className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-white">
                        <div className="flex items-center gap-1 border-b border-gray-100 p-3">
                            <button type="button" onClick={() => setDay(shiftDay(day, -1))} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Previous day">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <input
                                type="date"
                                value={day}
                                onChange={(e) => e.target.value && setDay(e.target.value)}
                                className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm"
                                aria-label="Day"
                            />
                            <button type="button" onClick={() => setDay(shiftDay(day, 1))} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Next day">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            {drivers.length === 0 && (
                                <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                    No drivers set yet. Mark who does pickups under{" "}
                                    <button type="button" onClick={() => setShowDrivers(true)} className="font-medium text-blue-700 hover:underline">Drivers</button>
                                    {" "}so routes start from their shop.
                                </p>
                            )}
                            <DayPlan
                                columns={columns}
                                selectedId={selectedId}
                                onSelect={select}
                                onAction={handleAction}
                                onEndpointChange={handleEndpointChange}
                            />
                        </div>
                    </section>
                </div>
            </div>

            {form && (
                <AppointmentForm
                    initial={form}
                    onClose={() => setForm(null)}
                    onSaved={handleSaved}
                    onAction={async (action, appointment) => {
                        if (await handleAction(action, appointment)) setForm(null);
                    }}
                />
            )}
            {editingEndpoint?.kind === "home" && (
                <EndpointModal
                    title={`Home address of ${editingEndpoint.column.name}`}
                    note="Saved on the driver, so you only enter it once. Their routes start from home by default from now on, and you can still switch any day to the shop."
                    onClose={() => setEditingEndpoint(null)}
                    onSave={async (address) => {
                        try {
                            await updateDriver(editingEndpoint.column.driverId, { home_address: address });
                            await saveEndpoint(editingEndpoint.column, editingEndpoint.which, { kind: "home" });
                            await loadDrivers();
                            setEditingEndpoint(null);
                        } catch (err) {
                            throw new Error(apiErrorMessage(err, "Could not save the home address."));
                        }
                    }}
                />
            )}
            {editingEndpoint?.kind === "other" && (
                <EndpointModal
                    title={`${editingEndpoint.which === "start" ? "Start" : "End"} of the route on ${formatDay(day)}`}
                    note="Only for this day. For the driver's home, choose Home instead; it's saved once and reused."
                    current={editingEndpoint.column[editingEndpoint.which]?.kind === "other"
                        ? editingEndpoint.column[editingEndpoint.which].fields
                        : null}
                    onClose={() => setEditingEndpoint(null)}
                    onSave={async (address) => {
                        try {
                            await saveEndpoint(editingEndpoint.column, editingEndpoint.which, { kind: "other", address });
                            setEditingEndpoint(null);
                        } catch (err) {
                            throw new Error(apiErrorMessage(err, "Could not save the address."));
                        }
                    }}
                />
            )}
            {showDrivers && (
                <DriversModal onClose={() => setShowDrivers(false)} onChanged={() => { loadDrivers(); refresh(); }} />
            )}
        </DndContext>
    );
}
