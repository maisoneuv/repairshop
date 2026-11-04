import math
from urllib.parse import urlencode

# Google Maps "dir" URLs accept at most 9 waypoints besides origin and destination.
MAX_WAYPOINTS = 9
EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(math.radians, map(float, (lat1, lng1, lat2, lng2)))
    a = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _coord(address):
    if address is None or address.latitude is None:
        return None
    return f"{address.latitude},{address.longitude}"


def _place(address):
    # Google snaps bare coordinates to the nearest named place (a parcel
    # locker, a shop), so the written address is the better hint whenever
    # there is one. The postal code is left out: a wrongly typed one sends
    # Google to another district, while street, number and city suffice.
    if address.street and address.city:
        street = f"{address.street} {address.building_number}".strip()
        return ", ".join(filter(None, [street, address.city, address.country]))
    return _coord(address) or address.geocode_query()


def google_maps_urls(start, stops, end=None):
    """Driving-directions links from `start` through every stop to `end`,
    split into legs of at most MAX_WAYPOINTS. Each leg starts where the
    previous one ended. A missing start or end is simply left out."""
    if not stops:
        return []
    points = [p for p in [start, *stops, end] if p is not None]
    if len(points) == 1:
        points = points * 2
    urls = []
    leg_size = MAX_WAYPOINTS + 1
    i = 0
    while i < len(points) - 1:
        leg = points[i:i + leg_size + 1]
        params = {
            "api": 1,
            "travelmode": "driving",
            "origin": _place(leg[0]),
            "destination": _place(leg[-1]),
        }
        if len(leg) > 2:
            params["waypoints"] = "|".join(_place(p) for p in leg[1:-1])
        urls.append("https://www.google.com/maps/dir/?" + urlencode(params))
        i += leg_size
    return urls

