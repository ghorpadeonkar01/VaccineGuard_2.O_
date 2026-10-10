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
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

MQTT_HOST = os.environ["MQTT_HOST"]
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USERNAME = os.environ["MQTT_USERNAME"]
MQTT_PASSWORD = os.environ["MQTT_PASSWORD"]
MQTT_CA_CERT = os.getenv("MQTT_CA_CERT")
TOPIC = "coldchain/v1/shipments/+/telemetry"
SAFE_MIN_C = 2.0
SAFE_MAX_C = 8.0
CRITICAL_MIN_C = 1.0
CRITICAL_MAX_C = 10.0
BUZZER_RETRIGGER_SECONDS = 30
last_buzzer_command_at = {}

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SECRET_KEY"],
)


def operational_status(temp_c: float) -> str:
    if temp_c < CRITICAL_MIN_C or temp_c > CRITICAL_MAX_C:
        return "critical"
    if temp_c < SAFE_MIN_C or temp_c > SAFE_MAX_C:
        return "warning"
    return "safe"


def distance_km(lat_a: float, lng_a: float, lat_b: float, lng_b: float) -> float:
    radius_km = 6371.0
    phi_a, phi_b = math.radians(lat_a), math.radians(lat_b)
    d_phi, d_lng = math.radians(lat_b - lat_a), math.radians(lng_b - lng_a)
    haversine = math.sin(d_phi / 2) ** 2 + math.cos(phi_a) * math.cos(phi_b) * math.sin(d_lng / 2) ** 2
    haversine = max(0.0, min(1.0, haversine))
    return radius_km * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))


def nearest_checkpoint(lat, lng, fallback_checkpoint_id=None):
    result = (
        supabase.table("checkpoints")
        .select("id,name,latitude,longitude,is_active,alert_trigger,cold_storage_available")
        .eq("is_active", True)
        .execute()
    )
    candidates = [
        p for p in (result.data or [])
        if p.get("latitude") is not None and p.get("longitude") is not None
    ]
    if valid_number(lat) and valid_number(lng) and candidates:
        selected = min(candidates, key=lambda p: distance_km(float(lat), float(lng), float(p["latitude"]), float(p["longitude"])))
        selected["distance_km"] = distance_km(float(lat), float(lng), float(selected["latitude"]), float(selected["longitude"]))
        return selected
    if fallback_checkpoint_id is not None:
        found = next((p for p in candidates if p["id"] == fallback_checkpoint_id), None)
        if found:
            return found
    return candidates[0] if candidates else None


def publish_buzzer(shipment_id: str, enabled: bool, severity: str = "safe") -> None:
    command = {"command": "buzzer", "state": "on" if enabled else "off", "severity": severity, "duration_seconds": 30 if enabled else 0}
    topic = f"coldchain/v1/shipments/{shipment_id}/commands"
    info = client.publish(topic, json.dumps(command), qos=1, retain=False)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        print(f"❌ Buzzer command publish failed for {shipment_id}: {info.rc}")
    elif enabled:
        last_buzzer_command_at[shipment_id] = time.monotonic()
        print(f"🔔 [CLOUD ACTUATION] Fired buzzer ON command to {topic} ({severity})")
    else:
        last_buzzer_command_at.pop(shipment_id, None)
        print(f"🔕 [CLOUD ACTUATION] Fired buzzer OFF command to {topic}")


def valid_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse_reading(raw: bytes) -> dict:
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("MQTT payload must be a JSON object")

    # Support the hardware column names used by the Supabase telemetry schema
    # as well as the compact API field names in the device protocol.
    if "temp_c" not in data:
        for alias in ("temperature_c", "vaccine_temp", "temperature", "temp"):
            if data.get(alias) is not None:
                data["temp_c"] = data[alias]
                break
    if "humidity_pct" not in data:
        for alias in ("humidity", "humidity_percent"):
            if data.get(alias) is not None:
                data["humidity_pct"] = data[alias]
                break
    if "lat" not in data and data.get("latitude") is not None:
        data["lat"] = data["latitude"]
    if "lng" not in data and data.get("longitude") is not None:
        data["lng"] = data["longitude"]
    # Sanitize and validate timestamp into a valid ISO 8601 string for PostgreSQL
    raw_ts = data.get("ts") or data.get("recorded_at") or data.get("received_at") or data.get("timestamp")
    iso_ts = None
    if raw_ts is not None:
        if isinstance(raw_ts, (int, float)):
            try:
                if raw_ts > 1e11:  # milliseconds
                    iso_ts = datetime.fromtimestamp(raw_ts / 1000.0, timezone.utc).isoformat()
                elif raw_ts > 1e8:  # seconds
                    iso_ts = datetime.fromtimestamp(raw_ts, timezone.utc).isoformat()
            except Exception:
                pass
        elif isinstance(raw_ts, str):
            try:
                datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                iso_ts = raw_ts
            except Exception:
                try:
                    num_val = float(raw_ts)
                    if num_val > 1e11:
                        iso_ts = datetime.fromtimestamp(num_val / 1000.0, timezone.utc).isoformat()
                    elif num_val > 1e8:
                        iso_ts = datetime.fromtimestamp(num_val, timezone.utc).isoformat()
                except Exception:
                    pass
    if not iso_ts and data.get("date"):
        try:
            date_value, time_value = str(data["date"]), str(data.get("time") or "00:00:00")
            candidate = f"{date_value}T{time_value}Z"
            datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            iso_ts = candidate
        except Exception:
            pass

    data["ts"] = iso_ts or datetime.now(timezone.utc).isoformat()
    data["source_mode"] = "hardware"

    required = ("shipment_id", "device_id", "ts", "temp_c", "source_mode")

    missing = [field for field in required if field not in data]
    if missing:
        fields = ", ".join(sorted(str(key) for key in data.keys()))
        raise ValueError(f"Missing required fields: {', '.join(missing)}; received fields: {fields}")

    if isinstance(data["temp_c"], str):
        try:
            data["temp_c"] = float(data["temp_c"])
        except ValueError:
            pass
    if not valid_number(data["temp_c"]):
        raise ValueError("temp_c must be a finite number")

    if not -80 <= float(data["temp_c"]) <= 80:
        raise ValueError("temp_c is outside plausible device range")

    for field, low, high in (("lat", -90, 90), ("lng", -180, 180)):
        if data.get(field) is not None:
            if isinstance(data[field], str):
                try:
                    data[field] = float(data[field])
                except ValueError:
                    raise ValueError(f"{field} is invalid") from None
            if not valid_number(data[field]) or not low <= float(data[field]) <= high:
                raise ValueError(f"{field} is invalid")

    humidity = data.get("humidity_pct")
    if isinstance(humidity, str):
        try:
            data["humidity_pct"] = float(humidity)
        except ValueError:
            data["humidity_pct"] = None

    return data


def process_reading(data: dict) -> None:
    reported_shipment_id = data["shipment_id"]
    if data.get("source_mode") != "hardware":
        raise ValueError("source_mode must be hardware for the live device feed")
    temp_c = float(data["temp_c"])
    status = operational_status(temp_c)

    # Resolve the canonical shipment from the assigned hardware device. Some
    # firmware still publishes its factory/demo shipment ID in the payload.
    assigned = (
        supabase.table("shipments")
        .select("shipment_id,status,checkpoint_id,hardware_private,hardware_device_id,destination_lat,destination_lng,vaccine_name")
        .eq("hardware_device_id", data["device_id"])
        .limit(2)
        .execute()
    )
    if len(assigned.data or []) > 1:
        raise ValueError(f"Device ID {data['device_id']} is assigned to multiple shipments")
    if not assigned.data and reported_shipment_id:
        assigned = (
            supabase.table("shipments")
            .select("shipment_id,status,checkpoint_id,hardware_private,hardware_device_id,destination_lat,destination_lng,vaccine_name")
            .eq("shipment_id", reported_shipment_id)
            .limit(1)
            .execute()
        )
    if not assigned.data:
        assigned = (
            supabase.table("shipments")
            .select("shipment_id,status,checkpoint_id,hardware_private,hardware_device_id,destination_lat,destination_lng,vaccine_name")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    if not assigned.data:
        raise ValueError("No shipments found in database to attach reading")
    shipment_record = assigned.data[0]
    shipment_id = shipment_record["shipment_id"]
    if reported_shipment_id != shipment_id:
        print(f"Using assigned shipment {shipment_id}; device reports {reported_shipment_id}")
    previous_status = shipment_record["status"]
    checkpoint_id = shipment_record.get("checkpoint_id")

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
        "hardware_device_id": data["device_id"],
    }
    supabase.table("shipments").upsert(
        shipment, on_conflict="shipment_id"
    ).execute()

    if status in ("warning", "critical") and status != previous_status:
        position_lat, position_lng = data.get("lat"), data.get("lng")
        if not valid_number(position_lat) or not valid_number(position_lng):
            position_lat = shipment_record.get("destination_lat")
            position_lng = shipment_record.get("destination_lng")
        checkpoint = nearest_checkpoint(position_lat, position_lng, checkpoint_id)
        target_checkpoint_id = checkpoint["id"] if checkpoint else checkpoint_id
        checkpoint_name = checkpoint.get("name") if checkpoint else None
        recommendation = (
            "Immediately inspect the cold box and transfer the shipment to controlled storage."
            if status == "critical"
            else "Inspect the cold box and restore the shipment to the 2 to 8 C safe range."
        )
        message = (
            f"{status.upper()}: {shipment_record.get('vaccine_name') or 'Vaccine'} "
            f"shipment {shipment_id} is at {temp_c:.1f} C; "
            f"safe range is {SAFE_MIN_C:.0f} to {SAFE_MAX_C:.0f} C. Operator review required."
        )
        if checkpoint and checkpoint.get("distance_km") is not None:
            message += f" Nearest checkpoint: {checkpoint_name} ({checkpoint['distance_km']:.1f} km)."
        supabase.table("alerts").insert(
            {
                "shipment_id": shipment_id,
                "checkpoint_id": target_checkpoint_id,
                "checkpoint_name": checkpoint_name,
                "vaccine_name": shipment_record.get("vaccine_name"),
                "observed_temp_c": temp_c,
                "location_lat": float(position_lat) if valid_number(position_lat) else None,
                "location_lng": float(position_lng) if valid_number(position_lng) else None,
                "checkpoint_distance_km": checkpoint.get("distance_km") if checkpoint else None,
                "alert_type": "COLD_CHAIN_EXCURSION",
                "severity": status,
                "message": message,
                "recommended_action": recommendation,
                "status": "detected",
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
        print(f"Alert created: {message}")
    if status in ("warning", "critical"):
        last_command = last_buzzer_command_at.get(shipment_id)
        if last_command is None or time.monotonic() - last_command >= BUZZER_RETRIGGER_SECONDS:
            publish_buzzer(shipment_id, True, status)
    elif previous_status in ("warning", "critical"):
        publish_buzzer(shipment_id, False)

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
        parts = message.topic.split("/")
        if len(parts) != 5 or parts[:3] != ["coldchain", "v1", "shipments"] or parts[4] != "telemetry":
            raise ValueError("Unexpected MQTT topic")
        data["_topic_route_id"] = parts[3]
        process_reading(data)
    except Exception as error:
        print(f"❌ Message ignored: {error}")


client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="coldchain-supabase-worker",
)
client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
if MQTT_CA_CERT:
    if not os.path.isfile(MQTT_CA_CERT):
        raise RuntimeError(f"MQTT_CA_CERT file was not found: {MQTT_CA_CERT}")
    client.tls_set(ca_certs=MQTT_CA_CERT, cert_reqs=ssl.CERT_REQUIRED)
else:
    client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
client.on_connect = on_connect
client.on_message = on_message

print("Starting ColdChain Guardian MQTT worker...")
client.connect(MQTT_HOST, MQTT_PORT, 60)
client.loop_forever()
