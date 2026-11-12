// Laptop stand-ins for the Arduino-ESP32 API: enough to type-check the firmware with g++.
// They do nothing. The real check is the Arduino IDE build (see firmware/README.md).
#pragma once
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT_PULLUP 2
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline int digitalRead(int) { return HIGH; }
inline void delay(uint32_t) {}
inline void delayMicroseconds(uint32_t) {}
inline uint32_t millis() { return 0; }
inline int64_t esp_timer_get_time() { return 0; }
inline void* ps_malloc(size_t n) { return malloc(n); }
class String {
 public:
  std::string s;
  String(const char* c = "") : s(c) {}
  String(const std::string& c) : s(c) {}
  String operator+(const char* o) const { return String(s + o); }
  String operator+(const String& o) const { return String(s + o.s); }
  const char* c_str() const { return s.c_str(); }
};
struct SerialStub {
  void begin(int) {}
  void println(const char*) {}
  int printf(const char*, ...) __attribute__((format(printf, 2, 3))) { return 0; }
};
static SerialStub Serial;
