#!/usr/bin/env python3
"""Recalcule les trajets de Cap Templemars : vélo, marche et transports.

Pour chaque commune, et pour chaque piste dotée d'une adresse précise (champ "dest"),
le script interroge OpenStreetMap (Valhalla) et Transitous dans les deux sens :
logement vers stage (aller) et stage vers logement (retour). Les transports sont
calculés pour le prochain lundi, avec une arrivée à 9 h et un retour à 17 h 30.

Usage, depuis la racine du projet :
    python scripts/routes.py
"""
import datetime
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

DATA = pathlib.Path(__file__).resolve().parent.parent / "data" / "data.json"
URL = "https://valhalla1.openstreetmap.de/route"
TRANSIT_URL = "https://api.transitous.org/api/v5/plan"
SPEED_KMH = 16
PAUSE_S = 1.2  # serveur public : on reste en dessous d'une requête par seconde


def decode(shape, precision=6):
    """Décode une polyligne Valhalla en liste de [lat, lon]."""
    coords, index, lat, lon = [], 0, 0, 0
    factor = 10 ** precision
    while index < len(shape):
        for is_lon in (False, True):
            result, bit = 0, 0
            while True:
                b = ord(shape[index]) - 63
                index += 1
                result |= (b & 0x1F) << bit
                bit += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if is_lon:
                lon += delta
            else:
                lat += delta
        coords.append([lat / factor, lon / factor])
    return coords


def simplify(points, tol):
    """Douglas-Peucker : garde la forme du trajet avec peu de points."""
    if len(points) < 3:
        return points
    (ax, ay), (bx, by) = points[0], points[-1]
    dx, dy = bx - ax, by - ay
    norm = (dx * dx + dy * dy) or 1e-12
    best, far = -1.0, 0
    for i, (px, py) in enumerate(points[1:-1], 1):
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / norm))
        d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
        if d > best:
            best, far = d, i
    if best <= tol * tol:
        return [points[0], points[-1]]
    return simplify(points[: far + 1], tol)[:-1] + simplify(points[far:], tol)


def route(start, end):
    body = {
        "locations": [{"lat": start[0], "lon": start[1]}, {"lat": end[0], "lon": end[1]}],
        "costing": "bicycle",
        "costing_options": {"bicycle": {"bicycle_type": "Hybrid", "cycling_speed": SPEED_KMH}},
        "directions_options": {"language": "fr-FR", "units": "kilometers"},
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "cap-templemars-routes/1.0"},
    )
    with urllib.request.urlopen(req, timeout=40) as res:
        trip = json.load(res)["trip"]
    time.sleep(PAUSE_S)
    leg = trip["legs"][0]
    return {
        "km": round(trip["summary"]["length"], 1),
        "min": max(1, round(trip["summary"]["time"] / 60)),
        "steps": [{"i": m["instruction"], "km": round(m["length"], 2)} for m in leg["maneuvers"]],
        "shape": [[round(a, 5), round(b, 5)] for a, b in simplify(decode(leg["shape"]), 0.00012)],
    }


def walk(start, end):
    body = {
        "locations": [{"lat": start[0], "lon": start[1]}, {"lat": end[0], "lon": end[1]}],
        "costing": "pedestrian",
        "directions_options": {"language": "fr-FR", "units": "kilometers"},
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "cap-templemars-routes/1.0"},
    )
    with urllib.request.urlopen(req, timeout=40) as res:
        summary = json.load(res)["trip"]["summary"]
    time.sleep(PAUSE_S)
    return {"km": round(summary["length"], 1), "min": max(1, round(summary["time"] / 60))}


def leg(item):
    name = item["to"]["name"]
    if item.get("mode") == "WALK":
        return {"m": "WALK", "t": "" if name in ("START", "END") else name, "min": round(item["duration"] / 60)}
    return {
        "m": item.get("mode"),
        "l": item.get("routeShortName") or "",
        "h": item.get("headsign") or "",
        "f": item["from"]["name"],
        "t": name,
        "min": round(item["duration"] / 60),
    }


def transit(start, end, when, arrive):
    """Jusqu'à 3 itinéraires en transports (Transitous), du plus court au plus long."""
    query = urllib.parse.urlencode({
        "fromPlace": f"{start[0]},{start[1]}",
        "toPlace": f"{end[0]},{end[1]}",
        "time": when,
        "arriveBy": "true" if arrive else "false",
        "numItineraries": "4",
    })
    req = urllib.request.Request(TRANSIT_URL + "?" + query, headers={"User-Agent": "cap-templemars-routes/1.0"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=45) as res:
                found = json.load(res).get("itineraries", [])
            break
        except (urllib.error.URLError, TimeoutError) as err:
            print("  transports : nouvel essai", err)
            found = None
            time.sleep(6)
    time.sleep(PAUSE_S)
    if found is None:
        return None
    options, seen = [], set()
    for item in sorted(found, key=lambda x: x["duration"]):
        legs = [leg(x) for x in item["legs"] if x.get("mode") != "WALK" or round(x["duration"] / 60) > 0]
        lines = tuple((x.get("l"), x.get("f")) for x in legs if x["m"] != "WALK")
        if not lines or lines in seen:
            continue
        seen.add(lines)
        options.append({
            "min": round(item["duration"] / 60),
            "ch": item.get("transfers", 0),
            "dep": item["startTime"],
            "arr": item["endTime"],
            "legs": legs,
        })
    return options[:3]


def next_monday():
    today = datetime.date.today()
    return today + datetime.timedelta(days=(7 - today.weekday()) % 7 or 7)


def moment(day, hour, minute=0):
    return datetime.datetime(day.year, day.month, day.day, hour, minute).astimezone().isoformat()


def both(place, work, day, old):
    go = route(place, work)
    back = route(work, place)
    transit_go = transit(place, work, moment(day, 9), True)
    transit_back = transit(work, place, moment(day, 17, 30), False)
    return {
        "km": go["km"],
        "min": go["min"],
        "steps": go["steps"],
        "shape": go["shape"],
        "backKm": back["km"],
        "backMin": back["min"],
        "backSteps": back["steps"],
        "walk": walk(place, work),
        "backWalk": walk(work, place),
        # En cas de panne du service, on garde le dernier résultat connu.
        "transit": old.get("transit", []) if transit_go is None else transit_go,
        "backTransit": old.get("backTransit", []) if transit_back is None else transit_back,
    }


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    w = data["meta"]["workplace"]
    work = (w["lat"], w["lon"])
    routes = {}
    old = data.get("routes", {})
    day = next_monday()

    for name, c in data["communes"].items():
        r = both((c["lat"], c["lon"]), work, day, old.get(name, {}))
        routes[name] = r
        c["km"], c["min"] = r["km"], r["min"]
        print(f"{name}: {r['km']} km, {r['min']} min, {len(r['transit'])} options en transports")

    for p in data["pistes"]:
        if p.get("onsite"):
            continue
        key = p["commune"]
        if p.get("dest"):
            key = p["id"]
            routes[key] = both((p["dest"]["lat"], p["dest"]["lon"]), work, day, old.get(key, {}))
            print(f"{p['name']}: {routes[key]['km']} km, {routes[key]['min']} min, {len(routes[key]['transit'])} options")
        p["route"]["key"] = key

    data["routes"] = routes
    data["meta"]["transitDate"] = day.isoformat()
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
