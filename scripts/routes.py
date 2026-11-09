#!/usr/bin/env python3
"""Recalcule les trajets à vélo de Cap Templemars.

Pour chaque commune, et pour chaque piste dotée d'une adresse précise (champ "dest"),
le script interroge le routeur cyclable OpenStreetMap (Valhalla) dans les deux sens :
logement vers stage (aller) et stage vers logement (retour).

Usage, depuis la racine du projet :
    python scripts/routes.py
"""
import json
import pathlib
import time
import urllib.request

DATA = pathlib.Path(__file__).resolve().parent.parent / "data" / "data.json"
URL = "https://valhalla1.openstreetmap.de/route"
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


def both(place, work):
    go = route(place, work)
    back = route(work, place)
    return {
        "km": go["km"],
        "min": go["min"],
        "steps": go["steps"],
        "shape": go["shape"],
        "backKm": back["km"],
        "backMin": back["min"],
        "backSteps": back["steps"],
    }


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    w = data["meta"]["workplace"]
    work = (w["lat"], w["lon"])
    routes = {}

    for name, c in data["communes"].items():
        r = both((c["lat"], c["lon"]), work)
        routes[name] = r
        c["km"], c["min"] = r["km"], r["min"]
        print(f"{name}: {r['km']} km, {r['min']} min")

    for p in data["pistes"]:
        if p.get("onsite"):
            continue
        key = p["commune"]
        if p.get("dest"):
            key = p["id"]
            routes[key] = both((p["dest"]["lat"], p["dest"]["lon"]), work)
            print(f"{p['name']}: {routes[key]['km']} km, {routes[key]['min']} min")
        p["route"]["key"] = key

    data["routes"] = routes
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
