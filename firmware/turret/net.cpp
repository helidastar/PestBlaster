// PestBlaster turret firmware - HTTP to the app (see net.h).
#include "net.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h"
#include "secrets.h"

namespace net {

static volatile uint32_t okAt = 0;
static volatile bool failed = true;
static uint32_t lastReconnect = 0;

void begin() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // modem sleep adds delay to every reply
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

bool wifiUp() { return WiFi.status() == WL_CONNECTED; }

void keepWifiAlive() {
  if (wifiUp()) return;
  if (millis() - lastReconnect < LINK_RETRY_MS) return;
  lastReconnect = millis();
  Serial.println("[net] hotspot not joined, retrying");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

uint32_t lastOkMs() { return okAt; }
bool lastFailed() { return failed; }

static bool send(const char* path, const char* contentType, const uint8_t* body, size_t len, std::string& reply) {
  reply.clear();
  if (!wifiUp()) {
    failed = true;
    return false;
  }
  WiFiClient client;
  HTTPClient http;
  String url = String(APP_BASE_URL) + path;
  if (!http.begin(client, url)) {
    failed = true;
    return false;
  }
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("x-device-key", DEVICE_KEY);
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("content-type", contentType);
  int code = http.POST((uint8_t*)body, len);
  if (code > 0) reply = http.getString().c_str();
  http.end();
  bool ok = code >= 200 && code < 300;
  if (code > 0) okAt = millis();  // the app answered, even if it refused the request
  failed = code <= 0;
  if (!ok) Serial.printf("[net] POST %s -> %d %s\n", path, code, code > 0 ? reply.c_str() : "(no reply)");
  return ok;
}

bool postJson(const char* path, const std::string& body, std::string& reply) {
  return send(path, "application/json", (const uint8_t*)body.data(), body.size(), reply);
}

bool postCapture(const uint8_t* jpeg, size_t len, const std::string& head, const std::string& tail,
                 const char* boundary, std::string& reply) {
  size_t total = head.size() + len + tail.size();
  uint8_t* buf = (uint8_t*)ps_malloc(total);  // about 35 kB: PSRAM, not the small internal RAM
  if (!buf) {
    Serial.println("[net] no memory for the photo");
    return false;
  }
  memcpy(buf, head.data(), head.size());
  memcpy(buf + head.size(), jpeg, len);
  memcpy(buf + head.size() + len, tail.data(), tail.size());
  String type = String("multipart/form-data; boundary=") + boundary;
  bool ok = send("/api/device/captures", type.c_str(), buf, total, reply);
  free(buf);
  return ok;
}

}  // namespace net
