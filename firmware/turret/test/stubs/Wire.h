#pragma once
#include <stdint.h>
struct TwoWire {
  bool begin(int, int, uint32_t) { return true; }
  void setTimeOut(uint16_t) {}
  void beginTransmission(uint8_t) {}
  size_t write(uint8_t) { return 1; }
  uint8_t endTransmission() { return 0; }
  uint8_t requestFrom(uint8_t, uint8_t q) { return q; }
  int available() { return 1; }
  int read() { return 0xFF; }
};
static TwoWire Wire;
