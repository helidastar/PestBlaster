#pragma once
#include <stdint.h>
#include "Arduino.h"
#include "WiFi.h"
struct HTTPClient {
  bool begin(WiFiClient&, const String&) { return true; }
  void setConnectTimeout(int32_t) {}
  void setTimeout(uint16_t) {}
  void addHeader(const String&, const String&) {}
  int POST(uint8_t*, size_t) { return 200; }
  String getString() { return String("{}"); }
  void end() {}
};
