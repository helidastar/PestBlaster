// PestBlaster turret firmware - numbers you may need to change.
// "MEASURE" = a value from the blueprint estimate or a guess: measure it on the build
// (bring-up sketch, test sheet 19) and write the real value here.
#pragma once
#include <stdint.h>

#define FIRMWARE_VERSION "turret-0.1"

// ---- Network (Pi 5 hotspot, blueprint sheet 34; pi/setup.sh) ----
// The hotspot name, password and device key live in secrets.h (copy secrets.example.h).
constexpr const char* APP_BASE_URL = "http://10.42.0.1:3000";  // the Pi on its own hotspot
constexpr const char* DEVICE_ID = "turret-1";
constexpr uint32_t HEARTBEAT_MS = 2000;        // status every 2 s (sheet 34)
constexpr uint32_t HEARTBEAT_FAST_MS = 250;    // while a manual spray runs, so "stop" is quick (docs 10.2)
constexpr uint32_t HTTP_TIMEOUT_MS = 5000;     // no reply in 5 s = link lost, no spray (sheet 34)
constexpr uint32_t LINK_RETRY_MS = 5000;       // retry every 5 s (sheet 34)
constexpr uint32_t LINK_LOST_HOME_MS = 60000;  // about 1 min without the Pi: go home and wait (docs 6.9)

// ---- Camera OV5640 on the Freenove ESP32-S3 WROOM CAM ----
constexpr int JPEG_QUALITY = 12;  // 0-63, lower = better; 640 x 480 is about 35 kB (sheet 34)

// ---- Turntable (J1): NEMA 17 + A4988, 1/16 microstep, belt 80T:16T (sheet 09, 17) ----
constexpr float TURN_ACCEL_RAD_S2 = 0.85f;  // alpha, sheet 17 (MEASURE: 30 deg in about 1.57 s)
constexpr float TURN_MAX_RAD_S = 1.6f;      // top speed (a 180 deg turn peaks at about 1.63 rad/s)
constexpr float HOME_SPEED_RAD_S = 0.5f;    // steady turn while looking for home switch R7 (a full turn = 12.6 s)
constexpr float HOME_MAX_TURNS = 1.1f;      // give up if R7 does not click within this
constexpr bool STEPPER_DIR_POSITIVE_HIGH = true;  // MEASURE: DIR level that turns the disc to bigger angles
constexpr uint32_t TURN_SETTLE_MS = 300;    // arm settles after a turn (sheet 20)

// ---- Lift (J2): actuator L7 on DRV8871, no position sensor (schematic O8) ----
constexpr float LIFT_STROKE_MM = 300.0f;
constexpr float LIFT_MM_PER_S = 19.6f;          // about 5.1 s per 100 mm (sheet 17). MEASURE
constexpr uint32_t LIFT_END_EXTRA_MS = 1500;    // keep driving this long into an end stop to be sure
constexpr bool ACT_UP_IS_IN1 = true;            // MEASURE in bring-up step 8: IN1 high = up?
constexpr float PATROL_LIFT_MM = 0.0f;          // patrol with the lift down (sheet 20)

// ---- Head servos (J3 swivel, J4 tilt): MG996R on PCA9685 (sheet 09, 18) ----
constexpr float SWIVEL_US_CENTRE = 1500.0f;  // psi = 0 (along the arm). MEASURE
constexpr float SWIVEL_US_PER_DEG = 11.1f;   // about 2000 us per 180 deg. MEASURE (sign too)
constexpr float SWIVEL_LIMIT_DEG = 85.0f;    // test +-85 first (sheet 09)
constexpr float TILT_US_AT_0 = 1000.0f;      // phi = 0 (level). MEASURE on the fork
constexpr float TILT_US_AT_90 = 2000.0f;     // phi = 90 (straight down). MEASURE on the fork
constexpr float TILT_MIN_DEG = 0.0f;
constexpr float TILT_MAX_DEG = 90.0f;
constexpr uint32_t SERVO_MOVE_MS = 150;      // servo move (sheet 20)
constexpr uint32_t SERVO_SETTLE_MS = 200;    // settle before the photo (sheet 20)
constexpr float PARK_TILT_DEG = 35.0f;       // head angle when homed or parked (first patrol tilt)

// ---- Aim (sheet 36) ----
constexpr float AIM_PSI_MAX_DEG = 80.0f;     // further off the arm than this: coarse turn first
constexpr float AIM_PSI_COARSE_DEG = 30.0f;  // after a coarse turn the target is 30 deg off the arm
constexpr float AIM_TOLERANCE_DEG = 3.0f;    // same as the app (src/lib/targeting.ts)
constexpr int AIM_MAX_CONFIRMS = 2;          // confirm frames per target before giving up

// ---- Spray (sheets 34, 36) ----
constexpr uint32_t PUMP_LEAD_MS = 300;       // pump runs at least 0.3 s before the valve opens
constexpr uint32_t PUMP_TAIL_MS = 0;         // valve closed -> pump off straight away
constexpr float RESERVOIR_PCT_PER_S = 1.3f;  // 2.5 L bottle, pump about 2 L/min (same estimate as the simulator). MEASURE
constexpr uint32_t REFILL_HOLD_MS = 3000;    // hold the BOOT button 3 s after a refill = 100 %

// ---- Patrol ----
constexpr uint32_t PATROL_GAP_S = 60;  // auto mode: rest between patrols. The app has no schedule yet (sheet 45)
constexpr bool NIGHT_MODE = false;      // IR LEDs on for each frame; set by the schedule once the app has one

// ---- Safety (sheet 36) ----
constexpr uint32_t SAFETY_PERIOD_MS = 20;
// BATT_PARK_V (11.8 V), OVERCURRENT_A (4.5 A) and the pump caps are in pins.h.
constexpr uint32_t BATTERY_LOW_HOLD_MS = 5000;  // must stay low this long (motor starts dip the voltage). Assumed
constexpr uint32_t OVERCURRENT_HOLD_MS = 500;
