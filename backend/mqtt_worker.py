"""
ColdChain Guardian MQTT -> Supabase worker.

Run:
  pip install paho-mqtt python-dotenv supabase
  python mqtt_worker.py

Required .env values:
  MQTT_HOST, MQTT_PORT, MQTT_USERNAME, MQTT_PASSWORD,
  SUPABASE_URL, SUPABASE_SECRET_KEY
"""
import json
import math
import os
import ssl
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

MQTT_HOST = os.environ["MQTT_HOST"]
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USERNAME = os.environ["MQTT_USERNAME"]
MQTT_PASSWORD = os.environ["MQTT_PASSWORD"]
TOPIC = "coldchain/v1/shipments/+/telemetry"

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SECRET_KEY"],
)


def operational_status(temp_c: float) -> str:
    if temp_c < 1.0 or temp_c > 10.0:
        return "critical"
    if temp_c < 2.0 or temp_c > 8.0:
        return "warning"
    return "safe"


def valid_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse_reading(raw: bytes) -> dict:
    data = json.loads(raw.decode("utf-8"))
    required = ("shipment_id", "device_id", "ts", "temp_c", "source_mode")

    missing = [field for field in required if field not in data]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    if not valid_number(data["temp_c"]):
        raise ValueError("temp_c must be a finite number")

    if not -80 <= float(data["temp_c"]) <= 80:
        raise ValueError("temp_c is outside plausible device range")

    for field, low, high in (("lat", -90, 90), ("lng", -180, 180)):
        if data.get(field) is not None and (
            not valid_number(data[field]) or not low <= float(data[field]) <= high
        ):
            raise ValueError(f"{field} is invalid")

    return data


def process_reading(data: dict) -> None:
    shipment_id = data["shipment_id"]
    temp_c = float(data["temp_c"])
    status = operational_status(temp_c)

    # Read previous status to prevent a duplicate alert for every MQTT message.
    existing = (
        supabase.table("shipments")
        .select("status")
        .eq("shipment_id", shipment_id)
        .limit(1)
        .execute()
    )
    previous_status = existing.data[0]["status"] if existing.data else None

    humidity = data.get("humidity_pct")
    if not valid_number(humidity):
        humidity = None

    reading = {
        "shipment_id": shipment_id,
        "device_id": data["device_id"],
        "recorded_at": data["ts"],
        "temperature_c": temp_c,
        "humidity_pct": humidity,
        "latitude": data.get("lat"),
        "longitude": data.get("lng"),
        "source_mode": data["source_mode"],
        "sensor_type": data.get("sensor_type", "unknown"),
    }
    supabase.table("telemetry_readings").insert(reading).execute()

    shipment = {
        "shipment_id": shipment_id,
        "latest_temp_c": temp_c,
        "latest_humidity_pct": humidity,
        "latest_lat": data.get("lat"),
        "latest_lng": data.get("lng"),
        "source_mode": data["source_mode"],
        "status": status,
        "last_reading_at": data["ts"],
    }
    supabase.table("shipments").upsert(
        shipment, on_conflict="shipment_id"
    ).execute()

    if status in ("warning", "critical") and status != previous_status:
        message = (
            f"{status.upper()}: {temp_c:.1f}°C received for {shipment_id}. "
            "Operator review required."
        )
        supabase.table("alerts").insert(
            {
                "shipment_id": shipment_id,
                "severity": status,
                "message": message,
                "status": "detected",
            }
        ).execute()
        print(f"⚠️ Alert created: {message}")

    print(
        f"✅ Saved {shipment_id}: {temp_c:.1f}°C | "
        f"{status} | {data['source_mode']}"
    )


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        print("✅ Connected to EMQX Cloud")
        client.subscribe(TOPIC, qos=1)
        print(f"📡 Subscribed to {TOPIC}")
    else:
        print(f"❌ EMQX connection failed: {reason_code}")


def on_message(client, userdata, message):
    try:
        data = parse_reading(message.payload)
        process_reading(data)
    except Exception as error:
        print(f"❌ Message ignored: {error}")


client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="coldchain-supabase-worker",
)
client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
client.on_connect = on_connect
client.on_message = on_message

print("Starting ColdChain Guardian MQTT worker...")
client.connect(MQTT_HOST, MQTT_PORT, 60)
client.loop_forever()