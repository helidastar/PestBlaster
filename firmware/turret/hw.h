// PestBlaster turret firmware - the parts on schematic pages 2-3, one function each.
// Every I2C call takes the same lock, so the safety task and the main loop can share the bus.
#pragma once
#include <stdint.h>
#include "esp_camera.h"

namespace hw {

struct Inputs {
  bool ok = false;          // the PCF8574 answered
  bool homePressed = false; // R7 on P2 (pressed = 0, schematic O4)
  bool busLive = false;     // P3 high = motor bus live, low = E-stop pressed
};

// Safe states first, then I2C, PCF8574 idle byte and the PCA9685. Returns false if a chip is missing.
bool begin(char* report, int reportLen);
bool cameraBegin();

// Relays (PCF8574 P0 pump, P1 valve; LOW = on)
void pump(bool on);
void valve(bool open);
void sprayOff();  // valve shut first, then pump off
bool pumpIsOn();

// Actuator L7 on the DRV8871 (IN1/IN2 on P4/P5)
enum class Act { Coast, Up, Down };
void actuator(Act a);

Inputs readInputs();
float batteryVolts();
float batteryAmps();

// Servos on the PCA9685 (H12)
void swivelDeg(float psi);
void tiltDeg(float phi);

// Stepper on the A4988 (STEP/DIR/EN straight from the ESP32)
void stepperEnable(bool on);
void stepperDir(bool positive);
void stepPulse();

// IR LEDs H11 (night patrol)
void ir(bool on);

// Camera: grab() returns a frame that must be given back with release().
camera_fb_t* grab();
void release(camera_fb_t* fb);

}  // namespace hw
