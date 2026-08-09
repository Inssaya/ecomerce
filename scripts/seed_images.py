"""Seed the catalogue from a folder of real photographs.

Development only. One category per subfolder, one product per image, plus a
drawn icon for each line of work so the shop's category rail has marks rather
than initials.

The images are never opened or examined — the folder name and the file name are
the only things read, and the titles are written from those. Files that arrive
with a hash for a name carry no information at all, so those get a title from
the line's own vocabulary instead.

    python scripts/seed_images.py --folder "C:/Users/yassi/Desktop/images"
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import struct
import sys
import urllib.error
import urllib.request
import zlib
from pathlib import Path

# ── Icons ─────────────────────────────────────────────────────────────────────
#
# Drawn here, stdlib only. Each icon is a handful of strokes described as line
# segments and arcs; a pixel's alpha is its distance to the nearest stroke,
# which anti-aliases for free and keeps the whole rasteriser to a few lines.

SIZE = 64
#: Heavy enough to still read as a line at the 24px the rail draws these at —
#: a hairline here disappears into the page at that size.
STROKE = 5.0


def _segment(x0: float, y0: float, x1: float, y1: float) -> tuple:
    return ("seg", x0, y0, x1, y1)


def _arc(cx: float, cy: float, r: float, a0: float, a1: float) -> tuple:
    """Degrees, clockwise from three o'clock — screen space, so y grows down."""
    return ("arc", cx, cy, r, a0, a1)


def _distance(shape: tuple, px: float, py: float) -> float:
    if shape[0] == "seg":
        _, x0, y0, x1, y1 = shape
        dx, dy = x1 - x0, y1 - y0
        span = dx * dx + dy * dy
        t = 0.0 if span == 0 else max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / span))
        return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))
    _, cx, cy, r, a0, a1 = shape
    angle = math.degrees(math.atan2(py - cy, px - cx)) % 360
    lo, hi = a0 % 360, a1 % 360
    inside = lo <= angle <= hi if lo <= hi else angle >= lo or angle <= hi
    if inside:
        return abs(math.hypot(px - cx, py - cy) - r)
    ends = [
        (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in (a0, a1)
    ]
    return min(math.hypot(px - ex, py - ey) for ex, ey in ends)


def _icon_png(shapes: list[tuple]) -> bytes:
    """Black strokes on transparency, so the rail can invert them when active."""
    half = STROKE / 2
    rows = bytearray()
    for y in range(SIZE):
        rows.append(0)  # PNG filter type 0
        for x in range(SIZE):
            px, py = x + 0.5, y + 0.5
            near = min(_distance(shape, px, py) for shape in shapes)
            # One pixel of feather either side of the stroke edge.
            alpha = max(0.0, min(1.0, (half + 0.5 - near)))
            rows.extend((0, 0, 0, round(alpha * 255)))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows), 6))
        + chunk(b"IEND", b"")
    )


def _cube() -> list[tuple]:
    """An isometric cube: a hexagon with three spokes to its centre."""
    cx = cy = SIZE / 2
    r = 21.0
    corners = [
        (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
        for a in (90, 150, 210, 270, 330, 30)
    ]
    shapes = [
        _segment(*corners[i], *corners[(i + 1) % 6]) for i in range(6)
    ]
    for a in (90, 210, 330):
        shapes.append(
            _segment(cx, cy, cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
        )
    return shapes


def _tshirt() -> list[tuple]:
    outline = [
        (26, 17), (20, 15), (11, 23), (17, 31), (22, 27), (22, 50),
        (42, 50), (42, 27), (47, 31), (53, 23), (44, 15), (38, 17),
    ]
    shapes = [_segment(*outline[i], *outline[i + 1]) for i in range(len(outline) - 1)]
    shapes.append(_arc(32, 14, 6.4, 15, 165))  # the neckline, dipping down
    return shapes


def _mug() -> list[tuple]:
    return [
        _segment(19, 21, 19, 41),
        _arc(24, 41, 5, 90, 180),
        _segment(24, 46, 34, 46),
        _arc(34, 41, 5, 0, 90),
        _segment(39, 21, 39, 41),
        _segment(19, 21, 39, 21),
        _arc(40, 29, 8, 285, 75),  # the handle, wrapping the right side
    ]


def _laser() -> list[tuple]:
    """A head, a beam, and the work under it. Nothing finer survives 24px."""
    return [
        _segment(21, 12, 43, 12),
        _segment(21, 12, 32, 27),
        _segment(43, 12, 32, 27),
        _segment(32, 27, 32, 41),
        _segment(14, 48, 50, 48),
    ]


# ── The lines of work ─────────────────────────────────────────────────────────

#: folder → (English name, Arabic name, icon, subcategories, price range)
LINES = {
    "3D": (
        "3D Objects",
        "قطع مطبوعة ثلاثية الأبعاد",
        _cube,
        [
            ("Desk & Office", "المكتب", ("pen", "holder", "laptop", "book", "phone", "desk", "organizer")),
            ("Figurines", "مجسمات", ("ninja", "samurai", "spartan", "ghost", "figurine", "dog", "man")),
            ("Home & Decor", "ديكور", ("lamp", "wall", "decor", "vortex", "lighting")),
        ],
        (140, 420),
    ),
    "T-Shirt": (
        "Clothing",
        "ملابس",
        _tshirt,
        [("T-Shirts", "تي شيرت", ())],
        (120, 260),
    ),
    "laser": (
        "Laser Engraving",
        "نقش بالليزر",
        _laser,
        [
            ("Key Holders", "حاملات المفاتيح", ("key", "portclee", "clee")),
            ("Name Plates", "لوحات الأسماء", ("bureau", "name", "medical", "dentical")),
            ("QR Signs", "لوحات QR", ("qr", "wifi", "code")),
        ],
        (90, 340),
    ),
    "Mugs": (
        "Mugs",
        "أكواب",
        _mug,
        [("Printed Mugs", "أكواب مطبوعة", ())],
        (70, 180),
    ),
}

#: Titles for files whose name is a hash and therefore says nothing.
NAMELESS = {
    "3D Objects": ["Printed Desk Piece", "Printed Object", "Printed Stand", "Printed Ornament"],
    "Clothing": [
        "Cotton Tee", "Printed Tee", "Everyday Tee", "Heavy Cotton Tee", "Studio Tee",
        "Workshop Tee", "Boxy Tee", "Washed Tee", "Relaxed Tee", "Classic Tee",
        "Graphic Tee", "Oversized Tee", "Ribbed Tee", "Soft-Wash Tee", "Weekend Tee",
    ],
    "Laser Engraving": ["Engraved Panel", "Engraved Plaque", "Engraved Piece"],
    "Mugs": [
        "Glazed Mug", "Printed Mug", "Morning Mug", "Stoneware Mug", "Matte Mug",
        "Two-Tone Mug", "Enamel Mug", "Wide Mug", "Tall Mug", "Everyday Mug",
    ],
}

#: Assembled at random per product, so no two descriptions read the same.
OPENERS = [
    "Made here, one at a time.",
    "Finished by hand in the workshop.",
    "Cut, cleaned up and checked before it goes out.",
    "A small run, made properly.",
    "Built to be used, not looked after.",
]
MIDDLES = [
    "The edges are worked back so nothing catches.",
    "Every one is gone over by hand before it is packed.",
    "No two come out exactly alike, and that is the point.",
    "The finish is matte, so it does not show every fingerprint.",
    "Solid in the hand, with a bit of weight to it.",
    "Simple enough to live with for a long time.",
]
CLOSERS = [
    # No city named here — delivery covers the whole country and the
    # workshop's own location is not something this business publishes.
    "Cash on delivery, anywhere in Morocco.",
    "Ask if you want it in another colour.",
    "Wipe it clean and it stays looking new.",
    "If something is wrong with it, tell us and we will make it again.",
    "Made to order in small batches.",
]
STORIES = [
    "This one started as a request we could not find anywhere else, so we made it.",
    "It has been through a few versions. This is the one that stayed.",
    "We keep making it because people keep coming back for it.",
    "Drawn one evening, cut the next morning, and it has not changed much since.",
]


def title_from(name: str, line: str, used: set[str], rng: random.Random) -> str:
    """A name for the piece, from the file name and nothing else."""
    stem = Path(name).stem
    # A hash, a camera dump, a browser's "download" — no information in any.
    if re.fullmatch(r"[0-9a-f]{16,}", stem) or stem.lower() in {"download", "images", "untitled"}:
        pool = NAMELESS[line]
        for _ in range(60):
            pick = rng.choice(pool)
            if pick not in used:
                return pick
        return f"{rng.choice(pool)} {rng.randint(2, 40)}"

    words = re.split(r"[^A-Za-z0-9]+", stem)
    words = [w for w in words if w and not re.fullmatch(r"\d+", w)]
    # Anything after a marketing dash is a sales pitch, not a name.
    if len(words) > 6:
        words = words[:6]
    cleaned = " ".join(w if w.isupper() and len(w) <= 3 else w.capitalize() for w in words)
    cleaned = cleaned.replace("3 D", "3D").strip()
    return cleaned or rng.choice(NAMELESS[line])


# ── Talking to the API ────────────────────────────────────────────────────────


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.token: str | None = None

    def _open(self, request: urllib.request.Request) -> dict:
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            raise SystemExit(
                f"{request.get_method()} {request.full_url} → {error.code}: {detail}"
            ) from error

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(f"{self.base}{path}", data=data, method=method)
        if data:
            request.add_header("Content-Type", "application/json")
        return self._open(request)

    def upload(self, path: str, filename: str, content: bytes, mime: str) -> dict:
        """Multipart by hand — this script carries no dependencies."""
        boundary = "----mostyleimages" + str(random.randint(10**8, 10**9))
        body = bytearray()
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
        )
        body.extend(f"Content-Type: {mime}\r\n\r\n".encode())
        body.extend(content)
        body.extend(f"\r\n--{boundary}--\r\n".encode())
        request = urllib.request.Request(f"{self.base}{path}", data=bytes(body), method="POST")
        request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        return self._open(request)


MIMES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--folder", required=True)
    parser.add_argument("--email", default="workshop@mostyle.ma")
    # Not defaulted to a literal. The other seeders in here carry the owner
    # password in the file itself and this repository is public, so anything
    # written there is published; this one takes it from the environment.
    parser.add_argument("--password", default=os.environ.get("MOSTYLE_OWNER_PASSWORD", ""))
    parser.add_argument(
        "--icons-only",
        action="store_true",
        help="Redraw and re-upload the category icons, leaving the catalogue alone.",
    )
    args = parser.parse_args()

    root = Path(args.folder)
    if not root.is_dir():
        raise SystemExit(f"No such folder: {root}")
    if not args.password:
        raise SystemExit("Set MOSTYLE_OWNER_PASSWORD, or pass --password.")

    rng = random.Random(20260809)
    api = Api(args.api)
    session = api.call("POST", "/api/auth/login", {"email": args.email, "password": args.password})
    api.token = session["access_token"]

    existing = {row["name_en"]: row for row in api.call("GET", "/api/admin/categories")}

    for order, (folder, (name_en, name_ar, icon, subs, prices)) in enumerate(LINES.items()):
        source = root / folder
        if not source.is_dir():
            print(f"skipping {folder}: not in the folder")
            continue

        print(f"{name_en}…")
        if name_en in existing:
            line = existing[name_en]
        else:
            line = api.call(
                "POST",
                "/api/admin/categories",
                {"name_en": name_en, "name_ar": name_ar, "display_order": order},
            )
            existing[name_en] = line

        api.upload(
            f"/api/admin/categories/{line['id']}/icon", "icon.png", _icon_png(icon()), "image/png"
        )
        if args.icons_only:
            continue

        children: list[tuple[str, tuple, str]] = []
        for index, (sub_en, sub_ar, keywords) in enumerate(subs):
            if sub_en in existing:
                child = existing[sub_en]
            else:
                child = api.call(
                    "POST",
                    "/api/admin/categories",
                    {
                        "name_en": sub_en,
                        "name_ar": sub_ar,
                        "parent_id": line["id"],
                        "display_order": index,
                    },
                )
                existing[sub_en] = child
            children.append((sub_en, keywords, child["id"]))

        files = sorted(
            path for path in source.iterdir() if path.suffix.lower() in MIMES and path.is_file()
        )
        used: set[str] = set()
        for path in files:
            title = title_from(path.name, name_en, used, rng)
            used.add(title)

            # The subcategory is chosen from the file name too — first keyword
            # that appears wins, and anything unrecognised falls to the first.
            stem = path.stem.lower()
            landed = children[0][2] if children else line["id"]
            for _, keywords, child_id in children:
                if any(word in stem for word in keywords):
                    landed = child_id
                    break

            description = " ".join(
                (rng.choice(OPENERS), rng.choice(MIDDLES), rng.choice(CLOSERS))
            )
            price = rng.randrange(prices[0], prices[1], 10)
            product = api.call(
                "POST",
                "/api/admin/products",
                {
                    "kind": "shelf",
                    "title_en": title,
                    "title_ar": title,
                    "description_en": description,
                    "description_ar": description,
                    "story_en": rng.choice(STORIES),
                    "story_ar": rng.choice(STORIES),
                    "price": price,
                    "category_id": landed,
                    "show_piece_numbers": True,
                },
            )
            api.upload(
                f"/api/admin/products/{product['id']}/media",
                path.name,
                path.read_bytes(),
                MIMES[path.suffix.lower()],
            )
            api.call(
                "POST", f"/api/admin/products/{product['id']}/pieces", {"quantity": rng.randint(2, 9)}
            )
            api.call("PATCH", f"/api/admin/products/{product['id']}", {"status": "active"})
            print(f"  {title}  {price} MAD")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
