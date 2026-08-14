"""Seed a realistic demo catalogue.

Development only. The storefront is photograph-first, so an empty database
tells you nothing about whether it works — you cannot judge a wall of images
with no images. This fills the shop with a coherent product line, real
numbered batches, orders at every stage of the lifecycle, browsing signals,
custom requests and contact messages, so every screen has something true to
draw.

The photographs are generated here rather than downloaded: stdlib only, no
Pillow, no network. They are deliberately abstract — a material, a form, a
shadow — because their job is to exercise composition, aspect ratio and
colour, not to pretend to be real product shots.

    python scripts/seed_demo.py [--api http://localhost:8000] [--reset]
"""
from __future__ import annotations

import argparse
import json
import math
import random
import struct
import sys
import urllib.error
import urllib.request
import zlib

# ── Photographs ───────────────────────────────────────────────────────────────

#: Warm neutrals to stand an object on, as (r, g, b).
BACKDROPS = [
    (243, 238, 230),
    (234, 227, 216),
    (226, 219, 208),
    (247, 245, 241),
    (214, 205, 193),
]

#: What the workshop actually works in.
MATERIALS = {
    "charcoal": ((58, 56, 60), (28, 27, 30)),
    "brass": ((186, 148, 84), (128, 96, 46)),
    "walnut": ((122, 82, 52), (74, 47, 28)),
    "clay": ((198, 92, 58), (140, 58, 34)),
    "steel": ((150, 152, 156), (96, 98, 104)),
    "cream": ((236, 230, 220), (198, 190, 178)),
}


def _png(width: int, height: int, pixels: bytearray) -> bytes:
    """Encode raw RGB rows as a PNG. Stdlib zlib does the compression."""
    raw = bytearray()
    stride = width * 3
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        raw.extend(pixels[y * stride : (y + 1) * stride])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
        + chunk(b"IEND", b"")
    )


def photograph(seed: int, width: int, height: int) -> bytes:
    """One object, lit from the upper left, on a warm backdrop.

    Not a render — a suggestion of one. A soft radial pool of light, a form
    with a vertical gradient across it, a contact shadow underneath, and a
    little grain over everything so flat colour never reads as a placeholder
    swatch.
    """
    rng = random.Random(seed)
    back = rng.choice(BACKDROPS)
    material_hi, material_lo = MATERIALS[rng.choice(list(MATERIALS))]

    # The form: a rounded column, a disc, or a wide slab — the three shapes a
    # hook, a lamp and a board actually are.
    form = rng.choice(("column", "disc", "slab", "arch"))
    cx, cy = width * 0.5, height * 0.54

    if form == "column":
        half_w, half_h = width * rng.uniform(0.13, 0.19), height * rng.uniform(0.26, 0.34)
    elif form == "disc":
        half_w = half_h = min(width, height) * rng.uniform(0.22, 0.29)
    elif form == "arch":
        half_w, half_h = width * rng.uniform(0.18, 0.24), height * rng.uniform(0.24, 0.31)
    else:  # slab
        half_w, half_h = width * rng.uniform(0.28, 0.35), height * rng.uniform(0.13, 0.18)

    radius = min(half_w, half_h) * (1.0 if form == "disc" else rng.uniform(0.18, 0.42))
    pixels = bytearray(width * height * 3)

    for y in range(height):
        for x in range(width):
            # Backdrop, with a soft pool of light up and to the left.
            lift = 1.0 - math.hypot((x - width * 0.34) / width, (y - height * 0.28) / height) * 0.78
            lift = max(0.72, min(1.10, lift))
            r = back[0] * lift
            g = back[1] * lift
            b = back[2] * lift

            dx, dy = abs(x - cx), abs(y - cy)

            # Contact shadow: an ellipse under the form, offset down-right.
            sx = (x - (cx + half_w * 0.10)) / (half_w * 1.28)
            sy = (y - (cy + half_h * 0.94)) / (half_h * 0.30)
            shade = sx * sx + sy * sy
            if shade < 1.0:
                strength = (1.0 - shade) ** 1.6 * 0.34
                r *= 1 - strength
                g *= 1 - strength
                b *= 1 - strength

            # The form itself: a superellipse, so corners round without a
            # cheap rounded-rectangle silhouette.
            ex = max(0.0, dx - (half_w - radius))
            ey = max(0.0, dy - (half_h - radius))
            inside = dx <= half_w and dy <= half_h and math.hypot(ex, ey) <= radius
            if form == "arch" and y < cy - half_h * 0.1:
                inside = inside and math.hypot((x - cx) / half_w, (y - (cy - half_h * 0.1)) / half_h) <= 1.0

            if inside:
                # Top-lit: brighter at the top edge, falling to the base.
                t = (y - (cy - half_h)) / (2 * half_h)
                t = max(0.0, min(1.0, t)) ** 0.85
                r = material_hi[0] * (1 - t) + material_lo[0] * t
                g = material_hi[1] * (1 - t) + material_lo[1] * t
                b = material_hi[2] * (1 - t) + material_lo[2] * t
                # A specular edge along the upper-left, where the light is.
                rim = 1.0 - math.hypot((x - (cx - half_w * 0.45)) / half_w,
                                       (y - (cy - half_h * 0.62)) / half_h)
                if rim > 0:
                    r += 46 * rim
                    g += 44 * rim
                    b += 40 * rim

            grain = rng.randint(-4, 4)
            index = (y * width + x) * 3
            pixels[index] = max(0, min(255, int(r + grain)))
            pixels[index + 1] = max(0, min(255, int(g + grain)))
            pixels[index + 2] = max(0, min(255, int(b + grain)))

    return _png(width, height, pixels)


#: Portrait, square and landscape, so the masonry wall packs unevenly the way
#: a pinboard does rather than resolving into rows.
SHAPES = [(900, 1200), (1000, 1000), (900, 1125), (1000, 750), (900, 1350)]


# ── The API ───────────────────────────────────────────────────────────────────


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    def _open(self, request: urllib.request.Request) -> dict:
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            raise SystemExit(f"{request.get_method()} {request.full_url} → {error.code}: {detail}")

    def call(self, method: str, path: str, body: dict | None = None, **headers: str) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(f"{self.base}{path}", data=data, method=method)
        if data:
            request.add_header("Content-Type", "application/json")
        for name, value in headers.items():
            request.add_header(name.replace("_", "-"), value)
        return self._open(request)

    def upload(self, path: str, filename: str, content: bytes) -> dict:
        """Multipart by hand — this script carries no dependencies."""
        boundary = "----mostyleseed" + str(random.randint(10**8, 10**9))
        body = bytearray()
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
        )
        body.extend(b"Content-Type: image/png\r\n\r\n")
        body.extend(content)
        body.extend(f"\r\n--{boundary}--\r\n".encode())

        request = urllib.request.Request(f"{self.base}{path}", data=bytes(body), method="POST")
        request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        return self._open(request)


# ── The catalogue ─────────────────────────────────────────────────────────────

CATEGORIES = [
    ("Hooks", "خطّافات"),
    ("Lamps", "مصابيح"),
    ("Boards", "ألواح"),
    ("Signs", "لافتات"),
    ("Desk", "مكتب"),
]

#: (category, kind, en, ar, price, description, story, made, lead_time)
PRODUCTS = [
    ("Hooks", "shelf", "Matte Black Hook", "خطّاف أسود مطفي", 180,
     "A single wall hook, printed solid and finished by hand.",
     "Printed overnight in matte black, then filed square at the shoulder and oiled. The screw sits flush — we counterbore every one.", 8, None),
    ("Hooks", "shelf", "Brass Peg", "وتد نحاسي", 240,
     "A turned peg for a coat, a bag, a hat.",
     "Turned from solid brass on the lathe, then left raw so it darkens with handling. It will not look like this in a year, and that is the point.", 5, None),
    ("Hooks", "workshop", "Row of Five", "صف من خمسة", 620,
     "Five hooks on one rail, spaced for a hallway.",
     "We cut the rail to your wall, not to a catalogue length. Tell us the run and we space the hooks so the ends are even.", 0, 6),
    ("Lamps", "shelf", "Desk Lamp 01", "مصباح مكتب ٠١", 890,
     "A small directional lamp for a working desk.",
     "The shade is spun aluminium, the arm machined from one billet. It moves with friction, not a spring, so it stays where you leave it.", 3, None),
    ("Lamps", "shelf", "Paper Shade", "غطاء ورقي", 420,
     "A soft, diffused light for a corner.",
     "The shade is a single sheet, scored and folded by hand. Every crease is placed by eye, which is why no two throw the same shadow.", 6, None),
    ("Lamps", "workshop", "Pendant, Made to Length", "مصباح معلّق بطول مخصص", 1150,
     "A hanging lamp, cut to your ceiling.",
     "You give us the drop, we cut the cord and the rod to match. A pendant that hangs at the wrong height is furniture you resent.", 0, 12),
    ("Boards", "shelf", "Walnut Serving Board", "لوح تقديم من الجوز", 340,
     "A board for bread, cheese, or nothing in particular.",
     "One piece of walnut, planed and sanded to 400, then finished with oil we mix ourselves. The grain runs long so it will not cup.", 4, None),
    ("Boards", "shelf", "Small Cutting Board", "لوح تقطيع صغير", 210,
     "The one you actually reach for.",
     "Small enough to leave on the counter. Beech, because it takes a knife without dulling it and washes clean.", 9, None),
    ("Boards", "workshop", "Engraved Board", "لوح محفور", 460,
     "A board with a name, a date, or a line on it.",
     "We burn the mark in rather than print it, so it survives washing and does not sit on the surface waiting to peel.", 0, 8),
    ("Signs", "shelf", "House Number", "رقم المنزل", 260,
     "A number for a door, cut clean.",
     "Cut from 4mm brass on the CNC, deburred by hand, and drilled for two fixings. It reads from the street, which is the only test.", 7, None),
    ("Signs", "workshop", "Name Plate", "لوحة اسم", 380,
     "A plate with your words on it.",
     "You send the words, we set them and send back a proof before anything is cut. Nothing is made until you have seen it.", 0, 7),
    ("Desk", "shelf", "Pen Rest", "مسند قلم", 120,
     "A small object that stops a pen rolling.",
     "Machined from offcuts. It exists because pens roll off desks, and because we had the brass already.", 12, None),
    ("Desk", "shelf", "Card Tray", "صينية بطاقات", 190,
     "A shallow tray for the things in your pockets.",
     "Folded from one sheet, brazed at the corners. The inside is left rough from the mill — it holds keys without them sliding about.", 6, None),
    ("Desk", "workshop", "Desk Set", "طقم مكتب", 720,
     "Tray, pen rest and a small stand, matched.",
     "Made together from the same bar so the colour matches across all three. Bought separately they never quite do.", 0, 10),
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--email", default="workshop@mostyle.ma")
    parser.add_argument("--password", default="TempWorkshop2026!")
    args = parser.parse_args()

    api = Api(args.api)
    print("Signing in…")
    session = api.call("POST", "/api/auth/login", {"email": args.email, "password": args.password})
    api.token = session["access_token"]
    if session.get("user", {}).get("role") != "owner":
        raise SystemExit("That account is not the workshop's.")

    print("Categories…")
    existing = {row["name_en"]: row["id"] for row in api.call("GET", "/api/admin/categories")}
    categories: dict[str, str] = {}
    for name_en, name_ar in CATEGORIES:
        if name_en in existing:
            categories[name_en] = existing[name_en]
        else:
            created = api.call(
                "POST", "/api/admin/categories", {"name_en": name_en, "name_ar": name_ar}
            )
            categories[name_en] = created["id"]

    made: list[dict] = []
    for index, (category, kind, en, ar, price, description, story, pieces, lead) in enumerate(PRODUCTS):
        print(f"  {en}…")
        body = {
            "kind": kind,
            "title_en": en,
            "title_ar": ar,
            "description_en": description,
            "description_ar": description,
            "story_en": story,
            "story_ar": story,
            "price": price,
            "category_id": categories[category],
            "show_piece_numbers": kind == "shelf",
        }
        if kind == "workshop":
            body["lead_time_days"] = lead
        product = api.call("POST", "/api/admin/products", body)

        # Three photographs each: the piece, a second angle, a detail.
        for shot in range(3):
            width, height = SHAPES[(index + shot) % len(SHAPES)]
            image = photograph(index * 13 + shot * 7 + 1, width, height)
            api.upload(f"/api/admin/products/{product['id']}/media", f"{shot}.png", image)

        if kind == "shelf" and pieces:
            api.call("POST", f"/api/admin/products/{product['id']}/pieces", {"quantity": pieces})

        api.call("PATCH", f"/api/admin/products/{product['id']}", {"status": "active"})
        made.append({"id": product["id"], "slug": product["slug"], "title": en, "price": price})

    print("Orders…")
    cities = ["Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir"]
    names = [
        ("Youssef Amrani", "0611234501"), ("Salma Bennani", "0611234502"),
        ("Omar Tazi", "0611234503"), ("Hind Alaoui", "0611234504"),
        ("Karim Idrissi", "0611234505"), ("Nadia Cherkaoui", "0611234506"),
        ("Mehdi Ouazzani", "0611234507"), ("Imane Fassi", "0611234508"),
    ]
    walks = [
        ["confirmed", "preparing", "ready", "out_for_delivery", "delivered"],
        ["confirmed", "preparing", "ready", "out_for_delivery", "delivered"],
        ["confirmed", "preparing", "ready", "out_for_delivery", "delivered"],
        ["confirmed", "preparing", "ready", "out_for_delivery", "failed"],
        ["confirmed", "preparing"],
        ["confirmed"],
        [],
        ["cancelled"],
    ]
    rng = random.Random(7)
    for (name, phone), steps in zip(names, walks):
        shelf = [p for p in made if p["price"] < 900]
        picked = rng.sample(shelf, rng.randint(1, 2))
        order = api.call("POST", "/api/orders", {
            "full_name": name,
            "phone": phone,
            "email": f"{phone}@example.ma",
            "address": {"line1": f"{rng.randint(2, 180)} Rue des Oliviers", "city": rng.choice(cities)},
            "items": [{"product_id": p["id"], "quantity": 1} for p in picked],
        })
        for step in steps:
            api.call("POST", f"/api/admin/orders/{order['reference']}/status", {"status": step})

    print("Custom requests…")
    for description, name, phone in [
        ("A brass house number, two digits, to match a dark green door.", "Rachid Alami", "0611234510"),
        ("Could you make a lamp like the desk one but taller, for a bedside table?", "Leila Saidi", "0611234511"),
        ("Twelve small hooks for a workshop wall, all the same.", "Tarik Bennis", "0611234512"),
    ]:
        api.call("POST", "/api/requests", {
            "full_name": name, "phone": phone, "description": description,
        })

    print("Messages…")
    for name, email, message in [
        ("Sofia Berrada", "sofia@example.ma", "Do you ship to Essaouira? And how long would a serving board take?"),
        ("Anas Kettani", "anas@example.ma", "Is the brass peg strong enough for a heavy winter coat?"),
    ]:
        api.call("POST", "/api/contact", {"name": name, "email": email, "message": message})

    print("Browsing signals…")
    for visitor in range(24):
        headers = {"X_Visitor_Id": f"seed-visitor-{visitor:02d}"}
        seen = rng.sample(made, rng.randint(2, 6))
        signals: list[dict] = [{"type": "impression", "product_id": p["id"]} for p in seen]
        for piece in seen[: rng.randint(1, 3)]:
            signals.append({"type": "click", "product_id": piece["id"], "path": "/piece/[slug]"})
            signals.append({"type": "dwell", "product_id": piece["id"], "value": rng.randint(4, 90)})
        if rng.random() < 0.4:
            signals.append({"type": "search", "query": rng.choice(
                ["brass lamp", "coat hook", "cutting board", "house number", "shelf bracket"]
            ), "value": rng.randint(0, 4)})
        if rng.random() < 0.3:
            signals.append({"type": "add_to_cart", "product_id": rng.choice(seen)["id"]})
        api.call("POST", "/api/signals", {"signals": signals}, **headers)

    print(f"\nDone. {len(made)} pieces, {len(names)} orders, 3 requests, 2 messages.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
