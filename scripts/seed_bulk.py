"""Pad the demo catalogue out past one page.

Development only, and a companion to `seed_demo.py` rather than a replacement:
that one writes a hand-authored product line worth reading, this one bulks the
shelf out so paging, infinite scroll and a five-column wall can actually be
looked at. Fourteen pieces cannot show you whether the thirtieth loads.

One photograph each and a smaller frame than the showcase seeder uses, because
these exist to fill a grid, not to be studied.

    python scripts/seed_bulk.py [--count 40]
"""
from __future__ import annotations

import argparse
import random
import sys

from seed_demo import SHAPES, Api, photograph  # noqa: E402

FORMS = [
    ("Wall Hook", "خطّاف حائط", "Hooks"),
    ("Coat Peg", "وتد معطف", "Hooks"),
    ("Shelf Bracket", "حامل رف", "Hooks"),
    ("Reading Lamp", "مصباح قراءة", "Lamps"),
    ("Bedside Light", "ضوء جانبي", "Lamps"),
    ("Wall Sconce", "إضاءة جدارية", "Lamps"),
    ("Bread Board", "لوح خبز", "Boards"),
    ("Cheese Slab", "لوح جبن", "Boards"),
    ("Chopping Block", "قطعة تقطيع", "Boards"),
    ("Door Plate", "لوحة باب", "Signs"),
    ("Studio Sign", "لافتة استوديو", "Signs"),
    ("Numeral", "رقم", "Signs"),
    ("Pen Tray", "صينية أقلام", "Desk"),
    ("Key Dish", "طبق مفاتيح", "Desk"),
    ("Card Stand", "حامل بطاقات", "Desk"),
]

FINISHES = ["Brass", "Charcoal", "Walnut", "Steel", "Oiled", "Raw", "Matte", "Burnished"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--email", default="workshop@mostyle.ma")
    parser.add_argument("--password", default="TempWorkshop2026!")
    parser.add_argument("--count", type=int, default=40)
    args = parser.parse_args()

    api = Api(args.api)
    session = api.call("POST", "/api/auth/login", {"email": args.email, "password": args.password})
    api.token = session["access_token"]

    categories = {row["name_en"]: row["id"] for row in api.call("GET", "/api/admin/categories")}
    if not categories:
        raise SystemExit("Run scripts/seed_demo.py first — there are no categories to file these under.")

    rng = random.Random(20260809)
    made = 0
    for index in range(args.count):
        form, form_ar, category = FORMS[index % len(FORMS)]
        finish = FINISHES[(index // len(FORMS) + index) % len(FINISHES)]
        title = f"{finish} {form}"
        kind = "shelf" if index % 4 else "workshop"

        body = {
            "kind": kind,
            "title_en": title,
            "title_ar": f"{form_ar}",
            "description_en": f"A {form.lower()} in a {finish.lower()} finish, made in the workshop.",
            "description_ar": "قطعة مصنوعة في الورشة.",
            "story_en": "Cut, filed and finished by hand. No two come out identical, which is the point.",
            "story_ar": "تُقطع وتُبرد وتُنهى يدوياً.",
            "price": rng.choice([90, 120, 150, 180, 210, 240, 280, 320, 380, 420, 480, 560, 640]),
            "category_id": categories.get(category) or next(iter(categories.values())),
            "show_piece_numbers": kind == "shelf",
        }
        if kind == "workshop":
            body["lead_time_days"] = rng.choice([4, 6, 7, 10, 14])

        product = api.call("POST", "/api/admin/products", body)

        width, height = SHAPES[index % len(SHAPES)]
        # Two-thirds scale: still varied in proportion, a third of the pixels.
        image = photograph(1000 + index * 17, width * 2 // 3, height * 2 // 3)
        api.upload(f"/api/admin/products/{product['id']}/media", "0.png", image)

        if kind == "shelf":
            api.call(
                "POST",
                f"/api/admin/products/{product['id']}/pieces",
                {"quantity": rng.randint(1, 9)},
            )

        api.call("PATCH", f"/api/admin/products/{product['id']}", {"status": "active"})
        made += 1
        print(f"  {made}/{args.count}  {title}")

    print(f"\nAdded {made} pieces.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
