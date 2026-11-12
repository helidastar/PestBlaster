#pragma once
#include <stdint.h>
struct Adafruit_PWMServoDriver {
  explicit Adafruit_PWMServoDriver(uint8_t) {}
  bool begin() { return true; }
  void setPWMFreq(float) {}
  uint8_t setPWM(uint8_t, uint16_t, uint16_t) { return 0; }
};
