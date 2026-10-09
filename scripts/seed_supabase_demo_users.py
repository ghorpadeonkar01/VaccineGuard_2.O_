"""Provision the three local VaccineGuard demo accounts.

Run from a trusted terminal after applying the SQL migration. Uses a Supabase
secret/service_role key only for Auth Admin and profile upsert operations.
Each run generates new, memorable passphrases and applies them only to these
three demo accounts. Existing Auth users are updated, never duplicated.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
from getpass import getpass
import urllib.error
import urllib.parse
import urllib.request

ACCOUNTS = (
    ("admin@vaccineguard.demo", "VaccineGuard Administrator", "admin"),
    ("user@vaccineguard.demo", "VaccineGuard Shipment User", "user"),
    ("checkpoint@vaccineguard.demo", "VaccineGuard Checkpoint Operator", "checkpoint"),
)
WORDS = (
    "apple", "autumn", "beach", "bird", "blue", "brave", "breeze", "bright",
    "candle", "cedar", "cloud", "coral", "crystal", "daisy", "dawn", "delta",
    "dream", "eagle", "earth", "ember", "falcon", "field", "firefly", "forest",
    "frost", "garden", "gentle", "glade", "golden", "harbor", "hazel", "hill",
    "honey", "island", "ivory", "jasmine", "journey", "juniper", "lantern", "leaf",
    "lemon", "lilac", "lunar", "maple", "meadow", "mint", "misty", "moon",
    "morning", "mountain", "music", "nectar", "ocean", "olive", "orchid", "panda",
    "paper", "pearl", "pepper", "petal", "piano", "pine", "planet", "pocket",
    "pond", "prairie", "quiet", "rabbit", "rainbow", "raven", "reef", "river",
    "robin", "rocket", "saffron", "sailor", "shadow", "silver", "sky", "snow",
    "soft", "solar", "sparrow", "spring", "star", "stone", "summer", "sunrise",
    "sunset", "tiger", "timber", "tulip", "velvet", "violet", "walnut", "water",
    "willow", "window", "winter", "wonder", "yellow", "zephyr", "anchor", "arctic",
    "bamboo", "button", "canary", "castle", "copper", "comet", "dolphin", "echo",
    "flame", "ginger", "glacier", "kitten", "marble", "orange", "poppy", "sunny",
    "thunder", "trail", "village", "whisper", "woodland", "zebra", "acorn", "almond",
)


def easy_password() -> str:
    # Six independently chosen words plus four digits and a symbol are easier
    # to type and remember while keeping over 50 bits of random entropy.
    words = [secrets.choice(WORDS).capitalize() for _ in range(6)]
    digits = f"{secrets.randbelow(10_000):04d}"
    return "-".join(words) + f"-{digits}!"


def request(url: str, secret: str, method: str = "GET", payload=None, prefer=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"apikey": secret, "Content-Type": "application/json", "Accept": "application/json"}
    if not secret.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {secret}"
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase returned HTTP {error.code}: {detail}") from None
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"Could not reach Supabase: {error}") from None


def main() -> int:
    project_url = os.environ.get("SUPABASE_URL", "https://obenrwtpyglyorfvohit.supabase.co").rstrip("/")
    secret = os.environ.get("SUPABASE_SECRET_KEY") or getpass(
        "Supabase secret key (sb_secret_... or legacy service_role; not publishable): "
    )
    if not secret:
        print("A Supabase secret/service_role key is required.", file=sys.stderr)
        return 2

    admin_url = f"{project_url}/auth/v1/admin/users"
    existing = {}
    page = 1
    while True:
        result = request(f"{admin_url}?page={page}&per_page=1000", secret)
        users = result.get("users", []) if isinstance(result, dict) else result
        for user in users:
            if user.get("email"):
                existing[user["email"].lower()] = user
        if len(users) < 1000:
            break
        page += 1

    profiles = []
    for email, name, role in ACCOUNTS:
        user = existing.get(email)
        password = easy_password()
        if user:
            user_id = user["id"]
            request(f"{admin_url}/{user_id}", secret, "PUT", {"password": password})
            print(f"Updated demo account password: {email}")
        else:
            user = request(admin_url, secret, "POST", {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": name},
            })
            user_id = user.get("id") if user else None
            print(f"Created demo Auth account: {email}")
        if not user_id:
            raise RuntimeError(f"Supabase did not return a user id for {email}")
        print(f"SAVE NOW  {role:12} {email:34} {password}")
        profiles.append({"id": user_id, "role": role, "display_name": name})

    print("\nSave the generated passwords above; the seeder does not store them.")
    query = urllib.parse.urlencode({"on_conflict": "id"})
    request(f"{project_url}/rest/v1/profiles?{query}", secret, "POST", profiles,
            "resolution=merge-duplicates,return=minimal")
    print("The three profile roles were verified/upserted.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
