#pragma once
#define WIFI_STA 1
#define WL_CONNECTED 3
struct WiFiClass {
  void mode(int) {}
  void setSleep(bool) {}
  void setAutoReconnect(bool) {}
  void begin(const char*, const char*) {}
  void disconnect() {}
  int status() { return WL_CONNECTED; }
};
static WiFiClass WiFi;
struct WiFiClient {};
