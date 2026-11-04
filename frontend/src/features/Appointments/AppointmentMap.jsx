import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./planner.css";
import { STATUS_PIN_COLOR, TYPE_PIN_COLOR, contactName, formatAddress, hasLocation } from "./constants";

const DEFAULT_CENTER = [52.07, 19.48];
const DEFAULT_ZOOM = 6;

const START_ICON = L.divIcon({
    className: "",
    html: `<div class="appt-start"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 10.5 12 3l9 7.5V21H3z"/></svg></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

function pinIcon({ type, color, label, selected, dim }) {
    const classes = [
        "appt-pin",
        `appt-pin--${type}`,
        selected && "appt-pin--selected",
        dim && "appt-pin--dim",
    ].filter(Boolean).join(" ");
    return L.divIcon({
        className: "",
        html: `<div class="${classes}" style="background:${color}">${label ?? ""}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
    });
}

const latLng = (a) => [Number(a.address.latitude), Number(a.address.longitude)];

function FitToPoints({ points, fitKey }) {
    const map = useMap();
    const lastKey = useRef(null);
    useEffect(() => {
        if (lastKey.current === fitKey || points.length === 0) return;
        lastKey.current = fitKey;
        if (points.length === 1) map.setView(points[0], 13);
        else map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    }, [fitKey, points, map]);
    return null;
}

function FlyToSelected({ appointment }) {
    const map = useMap();
    useEffect(() => {
        if (appointment && hasLocation(appointment)) {
            map.panTo(latLng(appointment));
        }
    }, [appointment?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

function ClickToPlace({ active, onPlace }) {
    useMapEvents({
        click(e) {
            if (active) onPlace(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

export default function AppointmentMap({
    appointments,
    stopNumbers,
    routeLines,
    startPoints,
    selectedId,
    highlightIds,
    nearby,
    placing,
    onSelect,
    onPlace,
}) {
    const located = useMemo(() => appointments.filter(hasLocation), [appointments]);
    const selected = appointments.find((a) => a.id === selectedId);
    const points = useMemo(
        () => [...located.map(latLng), ...startPoints.map((p) => [Number(p.latitude), Number(p.longitude)])],
        [located, startPoints],
    );
    const fitKey = located.length > 0 ? `${located.length}-${startPoints.length}` : null;

    return (
        <div className={`relative isolate h-full w-full ${placing ? "appt-map-placing" : ""}`}>
            <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full rounded-xl" scrollWheelZoom>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitToPoints points={points} fitKey={fitKey} />
                <FlyToSelected appointment={selected} />
                <ClickToPlace active={Boolean(placing)} onPlace={onPlace} />

                {routeLines.map((line) => (
                    <Polyline key={line.key} positions={line.positions} pathOptions={{ color: line.color, weight: 3, opacity: 0.75 }} />
                ))}

                {nearby && selected && hasLocation(selected) && (
                    <Circle
                        center={latLng(selected)}
                        radius={nearby.radiusKm * 1000}
                        pathOptions={{ color: "#111827", weight: 1, fillOpacity: 0.05, dashArray: "4 4" }}
                    />
                )}

                {startPoints.map((p) => (
                    <Marker key={`start-${p.key}`} position={[Number(p.latitude), Number(p.longitude)]} icon={START_ICON}>
                        <Tooltip direction="top" offset={[0, -10]}>{p.role}: {p.label}{p.kind === "other" ? "" : ` (${p.address})`}</Tooltip>
                    </Marker>
                ))}

                {located.map((a) => {
                    const stop = stopNumbers[a.id];
                    const color = stop ? stop.color : a.status === "new" ? TYPE_PIN_COLOR[a.type] : STATUS_PIN_COLOR[a.status];
                    return (
                        <Marker
                            key={a.id}
                            position={latLng(a)}
                            icon={pinIcon({
                                type: a.type,
                                color,
                                label: stop?.number,
                                selected: a.id === selectedId,
                                dim: highlightIds && !highlightIds.has(a.id) && a.id !== selectedId,
                            })}
                            eventHandlers={{ click: () => onSelect(a.id) }}
                            zIndexOffset={a.id === selectedId ? 1000 : 0}
                        >
                            <Tooltip direction="top" offset={[0, -12]}>
                                <div className="text-xs">
                                    <div className="font-medium">{contactName(a)}</div>
                                    <div>{formatAddress(a.address)}</div>
                                </div>
                            </Tooltip>
                        </Marker>
                    );
                })}
            </MapContainer>

            <div className="pointer-events-none absolute right-3 top-3 z-[1000] space-y-1 rounded-lg bg-white/95 px-2.5 py-2 text-[11px] text-gray-700 shadow">
                <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full" style={{ background: TYPE_PIN_COLOR.pickup }} /> Pickup
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px]" style={{ background: TYPE_PIN_COLOR.return_delivery }} /> Return
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full" style={{ background: STATUS_PIN_COLOR.failed }} /> Not home
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="flex h-3 w-3 items-center justify-center rounded-full bg-gray-700 text-[8px] font-semibold text-white">1</span> Planned stop
                </div>
            </div>

            {placing && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900 text-white text-sm px-3 py-1.5 rounded-lg shadow">
                    Click the map where {placing} lives
                </div>
            )}
        </div>
    );
}
