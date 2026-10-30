/*
  ColdChain Guardian — ESP32 Live MQTT Telemetry + Cloud Actuation
  VaccineGuard 2.0 (Pune ➔ Nanded Logistics Corridor)
  
  Bi-directional IoT:
  - Publishes sensor telemetry to: coldchain/v1/shipments/VAC-104/telemetry
  - Subscribes to cloud commands on: coldchain/v1/shipments/VAC-104/commands
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <TinyGPSPlus.h>
#include <time.h>

// ---------- Wi-Fi Credentials ----------
const char* WIFI_SSID     = "10106629022";
const char* WIFI_PASSWORD = "10106629022";

// ---------- EMQX MQTT Broker (TLS 8883) ----------
const char* MQTT_HOST     = "ta3aa281.ala.asia-southeast1.emqxsl.com";
const int   MQTT_PORT     = 8883;
const char* MQTT_USERNAME = "esp32-vac104";
const char* MQTT_PASSWORD = "Onkar@2007";

const char* SHIPMENT_ID   = "VAC-104";
const char* DEVICE_ID     = "ESP32-CC-001";
const char* MQTT_TELEMETRY_TOPIC = "coldchain/v1/shipments/VAC-104/telemetry";
const char* MQTT_COMMAND_TOPIC   = "coldchain/v1/shipments/VAC-104/commands";

// ---------- GPIO Pin Definitions ----------
constexpr int DS18B20_PIN = 5;   // Core Probe Data (requires 4.7k pullup to 3.3V)
constexpr int DHT22_PIN   = 4;   // Ambient Sensor Data
constexpr int GPS_RX_PIN  = 16;  // Connects to GPS Module TX
constexpr int GPS_TX_PIN  = 17;  // Connects to GPS Module RX

constexpr int LED_GREEN   = 18;  // Safe indicator (2°C to 8°C)
constexpr int LED_YELLOW  = 25;  // Warning indicator (1-2°C or 8-10°C)
constexpr int LED_RED     = 26;  // Critical excursion / Strobe indicator
constexpr int BUZZER_PIN  = 19;  // Active 5V/3.3V buzzer

constexpr unsigned long SEND_EVERY_MS = 5000; // 5-second live telemetry interval

// Local temperature threshold bands
constexpr float LOCAL_MIN_TEMP_C     = 2.0;
constexpr float LOCAL_MAX_TEMP_C     = 8.0;
constexpr float LOCAL_CRITICAL_LOW_C = 1.0;
constexpr float LOCAL_CRITICAL_HIGH_C= 10.0;

// Demo Indoor Corridor Fallback Coordinates (Near Beed Regional Hub CP-03)
constexpr double FALLBACK_LAT = 18.9894;
constexpr double FALLBACK_LNG = 75.7601;

OneWire oneWire(DS18B20_PIN);
DallasTemperature coldBox(&oneWire);
DHT dht(DHT22_PIN, DHT22);
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

WiFiClientSecure tlsClient;
PubSubClient mqtt(tlsClient);

unsigned long lastSend = 0;
unsigned long lastMqttReconnectTry = 0;
unsigned long buzzerCycleStarted = 0;
bool localCriticalState = false;

// Cloud actuation state variables
bool cloudBuzzerActive = false;
unsigned long cloudBuzzerExpiresAt = 0;
String cloudSeverity = "safe";

// ---------- Wi-Fi Connection ----------
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 25) {
    delay(300);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi connected! IP: " + WiFi.localIP().toString());
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println("\n⚠️ Wi-Fi connection timed out. Will retry.");
  }
}

// ---------- Incoming MQTT Command Callback (Cloud Actuation) ----------
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char message[256];
  if (length >= sizeof(message)) length = sizeof(message) - 1;
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.printf("\n📥 [CLOUD ACTUATION RECEIVED] Topic: %s\nPayload: %s\n", topic, message);

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, message);
  if (err) {
    Serial.printf("❌ JSON parse error: %s\n", err.c_str());
    return;
  }

  const char* command = doc["command"];
  const char* state = doc["state"];
  const char* severity = doc["severity"];
  int duration = doc["duration_seconds"] | 30;

  if (command && strcmp(command, "buzzer") == 0) {
    if (state && strcmp(state, "on") == 0) {
      cloudBuzzerActive = true;
      cloudBuzzerExpiresAt = millis() + ((unsigned long)duration * 1000UL);
      cloudSeverity = severity ? String(severity) : "critical";
      Serial.printf("🔔 [ALARM ACTIVATED BY CLOUD] Severity: %s, Duration: %ds\n", cloudSeverity.c_str(), duration);
    } else {
      cloudBuzzerActive = false;
      Serial.println("🔕 [ALARM CLEARED BY CLOUD]");
    }
  }
}

// ---------- MQTT Connection & Subscription ----------
void connectMqtt() {
  if (mqtt.connected()) {
    return;
  }

  if (millis() - lastMqttReconnectTry < 4000) {
    return;
  }

  lastMqttReconnectTry = millis();
  String clientId = "esp32-vac104-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  Serial.print("Connecting to EMQX MQTT Broker...");

  if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.println(" connected! ✅");
    
    // Subscribe to cloud actuation command topic (QoS 1)
    mqtt.subscribe(MQTT_COMMAND_TOPIC, 1);
    Serial.printf("📡 Subscribed to cloud commands: %s\n", MQTT_COMMAND_TOPIC);
  } else {
    Serial.printf(" failed, rc=%d (will retry)\n", mqtt.state());
  }
}

// ---------- UTC Timestamp (NTP or empty fallback) ----------
String utcNow() {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo, 1000)) {
    return ""; // Backend fills current timestamp if empty
  }
  char output[25];
  strftime(output, sizeof(output), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  return String(output);
}

// ---------- GPS Polling ----------
void pollGps() {
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }
}

bool hasLiveGpsFix() {
  return gps.location.isValid() && gps.location.age() < 10000 && gps.location.lat() != 0.0;
}

// ---------- State Calculation ----------
const char* temperatureState(float temperatureC) {
  if (isnan(temperatureC)) return "sensor_error";
  if (temperatureC < LOCAL_CRITICAL_LOW_C || temperatureC > LOCAL_CRITICAL_HIGH_C) return "critical";
  if (temperatureC < LOCAL_MIN_TEMP_C || temperatureC > LOCAL_MAX_TEMP_C) return "warning";
  return "safe";
}

// ---------- Visual LED Indicators ----------
void updateIndicators(const char* state) {
  if (cloudBuzzerActive && millis() > cloudBuzzerExpiresAt) {
    cloudBuzzerActive = false;
  }

  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);

  localCriticalState = (strcmp(state, "critical") == 0);

  // CLOUD EXCURSION COMMAND HAS PRIORITY: Fast Strobe Red LED
  if (cloudBuzzerActive) {
    digitalWrite(LED_RED, (millis() / 150) % 2 == 0 ? HIGH : LOW);
    return;
  }

  // Normal local state indicators
  if (strcmp(state, "safe") == 0) {
    digitalWrite(LED_GREEN, HIGH);
  } else if (strcmp(state, "warning") == 0) {
    digitalWrite(LED_YELLOW, HIGH);
  } else if (localCriticalState) {
    digitalWrite(LED_RED, (millis() / 400) % 2 == 0 ? HIGH : LOW);
  } else {
    // Sensor disconnected / error: blinking yellow
    digitalWrite(LED_YELLOW, (millis() / 500) % 2 == 0 ? HIGH : LOW);
  }
}

// ---------- Physical Buzzer Audio Feedback ----------
void updateBuzzer() {
  bool shouldBuzz = cloudBuzzerActive || localCriticalState;

  if (!shouldBuzz) {
    digitalWrite(BUZZER_PIN, LOW);
    return;
  }

  // Cloud Excursion Alarm: Urgent Double-Beep (Beep-Beep... pause)
  if (cloudBuzzerActive) {
    unsigned long phase = millis() % 1000;
    bool beep = (phase < 120) || (phase >= 200 && phase < 320);
    digitalWrite(BUZZER_PIN, beep ? HIGH : LOW);
    return;
  }

  // Local temperature fallback: single beep every 2s
  if (millis() - buzzerCycleStarted > 2000) {
    buzzerCycleStarted = millis();
  }
  digitalWrite(BUZZER_PIN, (millis() - buzzerCycleStarted < 180) ? HIGH : LOW);
}

// ---------- Publish Live Telemetry to MQTT ----------
void publishTelemetry(float coldBoxTemperatureC, float humidityPct) {
  if (!mqtt.connected()) {
    Serial.println("⚠️ MQTT not connected; skipping publish.");
    return;
  }

  // Build JSON payload
  StaticJsonDocument<512> doc;
  doc["shipment_id"]  = SHIPMENT_ID;
  doc["device_id"]    = DEVICE_ID;
  doc["source_mode"]  = "hardware";
  doc["temp_c"]       = coldBoxTemperatureC;
  doc["sensor_type"]  = "DS18B20+DHT22";

  // Use NTP time if available, otherwise omit so cloud worker fills UTC now
  String timestamp = utcNow();
  if (timestamp.length() > 0) {
    doc["ts"] = timestamp;
  }

  // Humidity
  if (!isnan(humidityPct)) {
    doc["humidity_pct"] = humidityPct;
  } else {
    doc["humidity_pct"] = nullptr;
  }

  // GPS Coordinates: Use live satellite lock if available; otherwise use Demo Corridor coordinates
  if (hasLiveGpsFix()) {
    doc["lat"] = gps.location.lat();
    doc["lng"] = gps.location.lng();
  } else {
    // Indoor Demo Fallback: Place along Pune -> Nanded corridor
    doc["lat"] = FALLBACK_LAT;
    doc["lng"] = FALLBACK_LNG;
  }

  char message[512];
  size_t messageLength = serializeJson(doc, message);

  bool sent = mqtt.publish(MQTT_TELEMETRY_TOPIC, (const uint8_t*)message, messageLength, false);

  Serial.printf("📤 [MQTT OUT] %s | Temp: %.2f°C | Hum: %.1f%% | Sent: %s\n",
    MQTT_TELEMETRY_TOPIC, coldBoxTemperatureC, humidityPct, sent ? "SUCCESS ✅" : "FAILED ❌");
}

// ---------- Setup ----------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n==================================================");
  Serial.println("  VaccineGuard 2.0 - Cold Chain IoT Node");
  Serial.println("==================================================");

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Initialize sensors
  coldBox.begin();
  dht.begin();
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  // TLS 8883 security setup (skip CA verification on ESP32 to save RAM)
  tlsClient.setInsecure();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);
  mqtt.setCallback(mqttCallback);

  connectWiFi();
  Serial.println("🚀 Node initialized and ready.");
}

// ---------- Main Loop ----------
void loop() {
  connectWiFi();
  connectMqtt();
  mqtt.loop(); // Crucial: processes cloud buzzer actuation commands immediately

  pollGps();

  // Read DS18B20 core temperature probe
  coldBox.requestTemperatures();
  float boxTemperatureC = coldBox.getTempCByIndex(0);
  if (boxTemperatureC == DEVICE_DISCONNECTED_C || boxTemperatureC < -50.0) {
    boxTemperatureC = NAN;
  }

  // Read DHT22 ambient humidity
  float humidityPct = dht.readHumidity();

  const char* state = temperatureState(boxTemperatureC);
  updateIndicators(state);
  updateBuzzer();

  // Periodic telemetry transmit
  if (millis() - lastSend >= SEND_EVERY_MS) {
    lastSend = millis();

    Serial.printf("📊 [STATUS] Core: %.2f°C | Ambient: %.1f%% | Status: %s | Alarm: %s\n",
      boxTemperatureC, humidityPct, state, cloudBuzzerActive ? "CLOUD ACTIVE 🔔" : "IDLE");

    if (!isnan(boxTemperatureC)) {
      publishTelemetry(boxTemperatureC, humidityPct);
    } else {
      Serial.println("⚠️ Warning: DS18B20 disconnected or reading error. Check pin 5 & 4.7k resistor.");
    }
  }
}
