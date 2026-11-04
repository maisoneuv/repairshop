import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./planner.css";

const POLAND = [52.07, 19.48];

const PIN_ICON = L.divIcon({
    className: "",
    html: '<div class="appt-pin appt-pin--pickup" style="background:#2563eb;cursor:grab"></div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
});

function Recenter({ position }) {
    const map = useMap();
    useEffect(() => {
        if (position) map.setView(position, Math.max(map.getZoom(), 16));
    }, [position?.[0], position?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

function ClickToPlace({ onPlace }) {
    useMapEvents({ click: (e) => onPlace(e.latlng.lat, e.latlng.lng) });
    return null;
}

/** Small map showing where an address was found; drag or click to correct it. */
export default function AddressPinPicker({ latitude, longitude, onPlace }) {
    const position = latitude != null && longitude != null ? [Number(latitude), Number(longitude)] : null;
    const handlers = useMemo(() => ({
        dragend: (e) => {
            const { lat, lng } = e.target.getLatLng();
            onPlace(lat, lng);
        },
    }), [onPlace]);

    return (
        <MapContainer
            center={position || POLAND}
            zoom={position ? 16 : 6}
            className="isolate h-56 w-full rounded-lg border border-gray-200"
            scrollWheelZoom={false}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Recenter position={position} />
            <ClickToPlace onPlace={onPlace} />
            {position && <Marker position={position} icon={PIN_ICON} draggable eventHandlers={handlers} />}
        </MapContainer>
    );
}
