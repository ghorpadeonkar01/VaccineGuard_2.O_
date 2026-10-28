"""
VaccineGuard - Automated Setup Script for New Supabase Project

This script automates the creation of the 4 standard demo accounts
with the password 'Password@123', links them to public.profiles,
and assigns them to demo shipment VAC-104 so the 1-click evaluation
logins work out-of-the-box.

Usage:
    python3 scripts/setup_new_supabase.py

    OR with arguments:
    python3 scripts/setup_new_supabase.py --url https://xxxx.supabase.co --secret sb_secret_xxxx (or service_role key)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

# The 4 official demo evaluation accounts matching frontend 1-click buttons
DEMO_ACCOUNTS = [
    {
        "email": "admin@vaccineguard.demo",
        "name": "Operations Administrator",
        "role": "admin",
        "checkpoint_id": None,
    },
    {
        "email": "driver@vaccineguard.demo",
        "name": "Cold-Chain Fleet Driver",
        "role": "transporter",
        "checkpoint_id": None,
    },
    {
        "email": "sender@vaccineguard.demo",
        "name": "Medical Logistics Hub",
        "role": "sender_receiver",
        "checkpoint_id": None,
    },
    {
        "email": "checkpoint@vaccineguard.demo",
        "name": "Hadapsar Checkpoint Operator",
        "role": "checkpoint",
        "checkpoint_id": 1,
    },
]

DEMO_PASSWORD = "Password@123"


def api_request(url: str, secret: str, method: str = "GET", payload=None, prefer=None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "apikey": secret,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    # For legacy JWT service role keys or new sb_secret_ keys
    headers["Authorization"] = f"Bearer {secret}"

    if prefer:
        headers["Prefer"] = prefer

    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    ssl_context = None
    try:
        import certifi
        import ssl
        ssl_context = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    try:
        with urllib.request.urlopen(req, timeout=25, context=ssl_context) as resp:
            content = resp.read()
            return json.loads(content) if content else None
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase HTTP {err.code}: {err_body}") from None
    except Exception as exc:
        raise RuntimeError(f"Connection failed: {exc}") from None


def main():
    parser = argparse.ArgumentParser(description="Provision VaccineGuard demo accounts in Supabase.")
    parser.add_argument("--url", help="Supabase Project URL (e.g. https://xxx.supabase.co)")
    parser.add_argument("--secret", help="Supabase Secret / Service Role Key")
    args = parser.parse_args()

    project_url = args.url or os.environ.get("SUPABASE_URL")
    secret_key = args.secret or os.environ.get("SUPABASE_SECRET_KEY")

    if not project_url:
        print("=" * 65)
        print(" VaccineGuard - New Supabase Account Provisioner")
        print("=" * 65)
        project_url = input("\nEnter your NEW Supabase Project URL (e.g. https://xyz.supabase.co): ").strip()

    if not secret_key:
        secret_key = input("Enter your NEW Supabase service_role / secret key: ").strip()

    project_url = project_url.rstrip("/")
    if not project_url.startswith("http"):
        project_url = f"https://{project_url}"

    if not secret_key:
        print("❌ Error: A service_role / secret key is required to provision auth users.")
        sys.exit(1)

    print(f"\n🔗 Connecting to Supabase project at {project_url}...")

    # 1. Fetch existing users to avoid duplicates
    admin_auth_url = f"{project_url}/auth/v1/admin/users"
    existing_users = {}
    try:
        users_resp = api_request(f"{admin_auth_url}?page=1&per_page=1000", secret_key)
        user_list = users_resp.get("users", []) if isinstance(users_resp, dict) else (users_resp or [])
        for u in user_list:
            if u.get("email"):
                existing_users[u["email"].lower()] = u
        print(f"✅ Successfully authenticated! Found {len(existing_users)} existing auth user(s).")
    except Exception as exc:
        print(f"❌ Failed to query Supabase Auth Admin: {exc}")
        print("\nPlease check that:")
        print("1. Your project URL is correct.")
        print("2. You used the 'service_role' secret key (NOT the anon publishable key).")
        sys.exit(1)

    # 2. Provision or update the 4 demo users
    user_ids_by_role = {}
    profile_rows = []

    print("\n📦 Provisioning 4 Demo Accounts with password 'Password@123'...")
    for acc in DEMO_ACCOUNTS:
        email = acc["email"].lower()
        name = acc["name"]
        role = acc["role"]
        cp_id = acc["checkpoint_id"]

        user_id = None
        if email in existing_users:
            user_id = existing_users[email]["id"]
            # Update password
            api_request(
                f"{admin_auth_url}/{user_id}",
                secret_key,
                method="PUT",
                payload={"password": DEMO_PASSWORD, "user_metadata": {"full_name": name}},
            )
            print(f"  🔄 Updated existing account: {email}")
        else:
            # Create user
            created = api_request(
                admin_auth_url,
                secret_key,
                method="POST",
                payload={
                    "email": email,
                    "password": DEMO_PASSWORD,
                    "email_confirm": True,
                    "user_metadata": {"full_name": name},
                },
            )
            user_id = created.get("id") if created else None
            print(f"  ✨ Created new account: {email}")

        if not user_id:
            raise RuntimeError(f"Could not retrieve user ID for {email}")

        user_ids_by_role[role] = user_id
        profile_rows.append({
            "id": user_id,
            "role": role,
            "display_name": name,
            "checkpoint_id": cp_id,
        })

    # 3. Upsert profiles into public.profiles
    print("\n📝 Syncing public.profiles table...")
    profiles_url = f"{project_url}/rest/v1/profiles?on_conflict=id"
    api_request(
        profiles_url,
        secret_key,
        method="POST",
        payload=profile_rows,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print("✅ All 4 demo profiles configured with proper roles and permissions.")

    # 4. Associate demo shipment VAC-104 with sender, transporter, and receiver
    print("\n🚚 Linking demo shipment VAC-104 to driver and sender accounts...")
    shipments_url = f"{project_url}/rest/v1/shipments?shipment_id=eq.VAC-104"
    update_payload = {
        "sender_id": user_ids_by_role.get("sender_receiver"),
        "transporter_id": user_ids_by_role.get("transporter"),
        "receiver_id": user_ids_by_role.get("admin"),
    }
    try:
        api_request(shipments_url, secret_key, method="PATCH", payload=update_payload)
        print("✅ Demo shipment VAC-104 linked to driver and sender accounts.")
    except Exception as exc:
        print(f"ℹ️ (Shipment linking skipped or table not yet created: {exc})")

    print("\n" + "=" * 65)
    print(" 🎉 PROVISIONING COMPLETE!")
    print("=" * 65)
    print("The following 4 accounts are ready for testing and evaluation:")
    print("-" * 65)
    print(" 1. Operations Admin:      admin@vaccineguard.demo      (Password: Password@123)")
    print(" 2. Fleet Driver:          driver@vaccineguard.demo     (Password: Password@123)")
    print(" 3. Medical Logistics:     sender@vaccineguard.demo     (Password: Password@123)")
    print(" 4. Checkpoint Manager:    checkpoint@vaccineguard.demo (Password: Password@123)")
    print("-" * 65)
    print("Now update your frontend/assets/js/config.js and backend/.env with your new keys!")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Setup failed: {e}", file=sys.stderr)
        sys.exit(1)
