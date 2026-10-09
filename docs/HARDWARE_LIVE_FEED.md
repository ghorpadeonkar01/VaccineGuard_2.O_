# Hardware live shipment feed

## Configure a shipment

1. Apply migrations `202610090003_hardware_live_visibility.sql` and `202610090004_checkpoint_excursion_alerts.sql` in the Supabase SQL editor, in order.
2. Sign in as the sender and create a shipment with a receiver selected.
3. Enable **assigned live hardware feed** and enter the device's exact `device_id`.
4. Run `backend/mqtt_worker.py` with the MQTT broker and Supabase service key settings in `backend/.env`.
5. Connect the sensor device to the broker over Wi-Fi and publish the payload below.

The live shipment and its readings are visible to its assigned sender and receiver, and to administrators. Drivers and checkpoint managers cannot read the shipment or its readings. The nearest assigned checkpoint manager can see and act on the excursion alert addressed to that checkpoint. The receiver can mark it received as usual.

## MQTT message format

Publish JSON to `coldchain/v1/shipments/<shipment_id>/telemetry` (QoS 1 recommended):

```json
{
  "shipment_id": "VG-1234567890",
  "device_id": "esp32-vaccine-01",
  "ts": "2026-10-09T16:30:00Z",
  "temp_c": 5.2,
  "humidity_pct": 48.5,
  "lat": 12.9716,
  "lng": 77.5946,
  "source_mode": "hardware",
  "sensor_type": "temperature-humidity-gps"
}
```

`shipment_id` must match the topic and an existing shipment. `device_id` must exactly match the ID assigned on that shipment. The worker rejects unregistered shipments, mismatched IDs, and non-hardware messages. Temperature is required; humidity and GPS may be omitted or `null`.

The sender/receiver dashboard updates from Supabase Realtime and shows latest conditions, recent reading history, temperature and humidity trends, observed averages/ranges, GPS, and generated alert history. Trend summaries use available stored readings; missing database values display as `null`.

## Excursion alerts and buzzer

The worker treats 2-8 C as the operating band. It creates a warning alert outside that band; below 1 C or above 10 C is critical. On an excursion it selects the nearest active checkpoint with `alert_trigger` enabled and a manager assigned, using device GPS, then shipment destination coordinates, then the shipment's assigned checkpoint as a fallback. Ensure checkpoint latitude/longitude, alert settings, and manager assignment are configured in Supabase. The alert appears in that checkpoint manager's live queue with vaccine, observed temperature, location, distance, and recommended action.

On the same excursion transition, the worker publishes a buzzer command to `coldchain/v1/shipments/<shipment_id>/commands`:

```json
{"command":"buzzer","state":"on","severity":"warning","duration_seconds":30}
```

The sensor firmware must subscribe to this command topic and drive its buzzer for the requested duration; the worker sends `state: "off"` when readings return to 2-8 C. Configure MQTT broker permissions so the worker can publish commands and the device can subscribe to its shipment's command topic.
