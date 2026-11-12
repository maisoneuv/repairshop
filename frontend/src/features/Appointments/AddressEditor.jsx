import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { apiErrorMessage, geocodeAddress } from "../../api/appointments";
import AddressPinPicker from "./AddressPinPicker";

const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

export const EMPTY_ADDRESS = {
    street: "", building_number: "", apartment_number: "", postal_code: "", city: "", country: "Poland",
};

// Postal code is left out: it rarely moves the pin, and the lookup fills it in.
const LOOKUP_FIELDS = ["street", "building_number", "city", "country"];
const addressKey = (address) => LOOKUP_FIELDS.map((f) => (address[f] || "").trim().toLowerCase()).join("|");
const canLookUp = (address) => Boolean(address.street?.trim() && address.building_number?.trim() && address.city?.trim());

export function initialPin(address) {
    if (address?.latitude == null || address?.longitude == null) return null;
    return {
        latitude: Number(address.latitude),
        longitude: Number(address.longitude),
        status: address.geocode_status === "manual" ? "manual" : "ok",
    };
}

/** The address as the API takes it, carrying the pin when there is one. */
export function addressPayload(address, pin) {
    const { id, latitude, longitude, geocode_status, ...fields } = address;
    const payload = { ...fields, apartment_number: fields.apartment_number || null };
    if (pin) {
        payload.latitude = pin.latitude.toFixed(6);
        payload.longitude = pin.longitude.toFixed(6);
        payload.geocode_status = pin.status;
    }
    return payload;
}

function PinStatus({ lookup, pin, placeHint }) {
    if (lookup.state === "searching") return <p className="text-xs text-gray-500">Looking up the address...</p>;
    if (pin?.status === "manual") return <p className="text-xs text-gray-600">Pin placed by hand. Drag it again if needed.</p>;
    if (pin) {
        return (
            <p className="text-xs text-gray-600">
                {lookup.label ? <>Found: <span className="text-gray-800">{lookup.label}</span>. </> : null}
                Drag the pin if it isn't exactly right.
            </p>
        );
    }
    if (lookup.state === "notfound") {
        return (
            <p className="text-xs text-amber-800">
                Couldn't find this address. Check the street and number, or {placeHint}.
            </p>
        );
    }
    if (lookup.state === "error") return <p className="text-xs text-amber-800">{lookup.message}</p>;
    return null;
}

/**
 * Address fields that look the address up on the map once it's filled in,
 * and show the pin so it can be dragged or placed by hand.
 */
export default function AddressEditor({
    address,
    onChange,
    pin,
    onPinChange,
    title = "Address",
    placeHint = "click the map where they live",
}) {
    const [lookup, setLookup] = useState(() => ({ state: pin ? "found" : "idle" }));
    const lookedUp = useRef(pin ? addressKey(address) : null);

    const setField = (patch) => {
        const next = { ...address, ...patch };
        onChange(next);
        if (lookedUp.current !== null && addressKey(next) !== lookedUp.current) {
            lookedUp.current = null;
            onPinChange(null);
            setLookup({ state: "idle" });
        }
    };

    const findOnMap = useCallback(async (current) => {
        const key = addressKey(current);
        lookedUp.current = key;
        setLookup({ state: "searching" });
        try {
            const result = await geocodeAddress(current);
            if (lookedUp.current !== key) return;
            if (result.found) {
                onPinChange({ latitude: Number(result.latitude), longitude: Number(result.longitude), status: "ok" });
                if (result.postal_code && !current.postal_code?.trim()) {
                    onChange({ ...current, postal_code: result.postal_code });
                }
                setLookup({ state: "found", label: result.label });
            } else {
                onPinChange(null);
                setLookup({ state: "notfound" });
            }
        } catch (err) {
            if (lookedUp.current !== key) return;
            setLookup({ state: "error", message: apiErrorMessage(err, "Address lookup failed. Click the map to place the pin.") });
        }
    }, [onChange, onPinChange]);

    useEffect(() => {
        if (!pin && canLookUp(address)) findOnMap(address);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    function lookUpIfReady() {
        if (canLookUp(address) && addressKey(address) !== lookedUp.current) findOnMap(address);
    }

    function placePin(latitude, longitude) {
        onPinChange({ latitude, longitude, status: "manual" });
        lookedUp.current = addressKey(address);
    }

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
                <button
                    type="button"
                    onClick={() => findOnMap(address)}
                    disabled={!canLookUp(address) || lookup.state === "searching"}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 disabled:text-gray-400"
                >
                    <MapPin className="w-3.5 h-3.5" /> Find on map
                </button>
            </div>
            <div className="grid grid-cols-6 gap-3" onBlur={lookUpIfReady}>
                <div className="col-span-6 sm:col-span-3">
                    <label className={labelCls}>Street *</label>
                    <input required value={address.street} onChange={(e) => setField({ street: e.target.value })} className={inputCls} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                    <label className={labelCls}>Number *</label>
                    <input required value={address.building_number} onChange={(e) => setField({ building_number: e.target.value })} className={inputCls} />
                </div>
                <div className="col-span-3 sm:col-span-1">
                    <label className={labelCls}>Flat</label>
                    <input value={address.apartment_number || ""} onChange={(e) => setField({ apartment_number: e.target.value })} className={inputCls} />
                </div>
                <div className="col-span-4">
                    <label className={labelCls}>City *</label>
                    <input required value={address.city} onChange={(e) => setField({ city: e.target.value })} className={inputCls} />
                </div>
                <div className="col-span-2">
                    <label className={labelCls}>Postal code</label>
                    <input
                        value={address.postal_code || ""}
                        onChange={(e) => setField({ postal_code: e.target.value })}
                        placeholder="Auto"
                        className={inputCls}
                    />
                </div>
            </div>
            {(pin || lookup.state !== "idle") && (
                <div className="space-y-1.5">
                    <AddressPinPicker latitude={pin?.latitude} longitude={pin?.longitude} onPlace={placePin} />
                    <PinStatus lookup={lookup} pin={pin} placeHint={placeHint} />
                </div>
            )}
        </section>
    );
}
