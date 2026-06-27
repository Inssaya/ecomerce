#!/usr/bin/env python3
"""
Seed the 4 default MoStyle stores.

Usage:
  python scripts/seed_stores.py

Requirements: pip install httpx
The gateway must be running (docker-compose up -d gateway).
Set ADMIN_TOKEN env var or the script will log in automatically.

Environment variables:
  GATEWAY_URL   default: http://localhost:8000
  ADMIN_EMAIL   default: admin@mostyle.ma
  ADMIN_PASSWORD
  ADMIN_TOKEN   (optional, skip login)
"""

import asyncio
import os
import httpx

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@mostyle.ma")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")

STORES = [
    {
        "slug": "clothes",
        "name": "Fashion & Clothes",
        "description": "Trendy clothing, custom prints, and exclusive fashion pieces. Style meets comfort.",
        "theme_color": "#fb923c",
        "accent_color": "#fbbf24",
        "hero_tagline": "Your style, delivered.",
        "whatsapp_number": "212600000000",
        "display_order": 1,
        "is_active": True,
    },
    {
        "slug": "3dprint",
        "name": "3D Printing",
        "description": "Custom 3D printed objects, prototypes, and collectibles. Bring your ideas to life.",
        "theme_color": "#22d3ee",
        "accent_color": "#818cf8",
        "hero_tagline": "From idea to object.",
        "whatsapp_number": "212600000000",
        "display_order": 2,
        "is_active": True,
    },
    {
        "slug": "electronics",
        "name": "Electronics",
        "description": "Gadgets, accessories, smart devices, and tech essentials for everyday life.",
        "theme_color": "#34d399",
        "accent_color": "#2dd4bf",
        "hero_tagline": "Tech that moves you.",
        "whatsapp_number": "212600000000",
        "display_order": 3,
        "is_active": True,
    },
    {
        "slug": "glasses",
        "name": "Glasses & Eyewear",
        "description": "Sunglasses, prescription frames, and designer eyewear. See the world in style.",
        "theme_color": "#c084fc",
        "accent_color": "#f472b6",
        "hero_tagline": "See the world in style.",
        "whatsapp_number": "212600000000",
        "display_order": 4,
        "is_active": True,
    },
]


async def main():
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=30) as client:
        token = ADMIN_TOKEN

        if not token:
            if not ADMIN_PASSWORD:
                print("ERROR: Set ADMIN_TOKEN or ADMIN_PASSWORD env var.")
                return
            print(f"Logging in as {ADMIN_EMAIL}...")
            resp = await client.post(
                "/api/v1/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            )
            resp.raise_for_status()
            token = resp.json()["access_token"]
            print("Logged in.")

        headers = {"Authorization": f"Bearer {token}"}

        # Fetch existing stores to avoid duplicates
        resp = await client.get("/api/v1/catalog/stores/all", headers=headers)
        resp.raise_for_status()
        existing_slugs = {s["slug"] for s in resp.json()}
        print(f"Existing stores: {existing_slugs or 'none'}")

        for store in STORES:
            if store["slug"] in existing_slugs:
                print(f"  skip  {store['slug']} (already exists)")
                continue
            resp = await client.post(
                "/api/v1/catalog/stores",
                json=store,
                headers=headers,
            )
            if resp.status_code in (200, 201):
                print(f"  created  {store['slug']} — {store['name']}")
            else:
                print(f"  ERROR  {store['slug']}: {resp.status_code} {resp.text}")

        print("\nDone. Update WhatsApp numbers from the Admin Dashboard.")


if __name__ == "__main__":
    asyncio.run(main())
