// PestBlaster turret firmware for the ESP32-S3 CAM (H9).
// Patrols the ring (12 stops x 4 frames, blueprint sheet 20), sends every photo to the app on
// the Pi 5, aims and sprays only when the app says "fire" or a person presses Spray in the app,
// and stops everything on the E-stop, a lost link, a low battery or a jam (sheet 36).
//
// Arduino IDE: board "ESP32S3 Dev Module", PSRAM "OPI PSRAM", Partition "Huge APP" or 16 MB.
// Library: Adafruit PWM Servo Driver. Copy secrets.example.h to secrets.h first.
// Serial Monitor at 115200 shows what it is doing.
// The code is in the .cpp files next to this one (Arduino compiles them all):
//   control.cpp  setup(), loop(), patrol, aim, spray, app commands, safety and link tasks
//   hw.cpp       the parts on schematic pages 2-3      net.cpp  Wi-Fi and HTTP to the app
//   logic.cpp    plain maths and messages, tested on a laptop (test/run.sh)
//   config.h     numbers to measure and tune            pins.h   pin map (same as bringup/pins.h)
#include <Adafruit_PWMServoDriver.h>
