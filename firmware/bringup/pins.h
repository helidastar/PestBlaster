// PestBlaster v15 - pin and address map for the ESP32-S3 CAM (H9)
// Source: blueprint v15 sheets 08, 09, 43, 50 and schematic pages 2-3.
// Board: Freenove ESP32-S3-WROOM CAM (N16R8). Confirm on your board's pinout before soldering.
#pragma once
#include <stdint.h>

// ---- ESP32 GPIO (head) ----
constexpr int PIN_I2C_SDA  = 41;  // E15 core 7  -> PCF8574, INA219, PCA9685
constexpr int PIN_I2C_SCL  = 42;  // E15 core 8
constexpr int PIN_STEP     = 14;  // E15 core 9  -> A4988 STEP (RMT / timer pulses)
constexpr int PIN_DIR      = 21;  // E15 core 10 -> A4988 DIR
constexpr int PIN_STEP_EN  = 47;  // E15 core 11 -> A4988 EN, LOW = driver on
constexpr int PIN_PCF_INT  = 1;   // E15 core 12 <- PCF8574 INT, open drain, active LOW
constexpr int PIN_IR_GATE  = 2;   // AO3400 gate (100R + 10k pull-down), HIGH = IR LEDs on
constexpr uint32_t I2C_HZ  = 100000;  // 100 kHz on the 1.5 m coiled cable (sheet 09)
// Do not use: 4-13, 15-18 (camera), 35-37 (PSRAM), 19-20 (USB), 0/3/45/46 (straps), 43-44 (UART)

// ---- I2C addresses ----
constexpr uint8_t ADDR_PCF8574 = 0x20;  // E11 enclosure (PCF8574, not PCF8574A)
constexpr uint8_t ADDR_PCA9685 = 0x40;  // H12 head
constexpr uint8_t ADDR_INA219  = 0x41;  // E10 enclosure, A0 bridged

// ---- PCF8574 bits (E11) ----
constexpr uint8_t PCF_RELAY_PUMP  = 0;  // P0 -> relay IN1, LOW = pump on
constexpr uint8_t PCF_RELAY_VALVE = 1;  // P1 -> relay IN2, LOW = valve open
constexpr uint8_t PCF_HOME_SW     = 2;  // P2 <- KW12 home switch, LOW = pressed (assumed NO wiring)
constexpr uint8_t PCF_ESTOP_SENSE = 3;  // P3 <- divider, HIGH = motor bus live, LOW = E-stop pressed
constexpr uint8_t PCF_ACT_IN1     = 4;  // P4 -> DRV8871 IN1
constexpr uint8_t PCF_ACT_IN2     = 5;  // P5 -> DRV8871 IN2
// P6, P7 spare. Inputs (P2, P3, P6, P7) must always be written 1 (PCF8574 quasi-bidirectional pins).
// Safe idle byte: relays off (P0,P1 = 1), inputs 1, actuator coast (P4,P5 = 0) -> 0b11001111
constexpr uint8_t PCF_IDLE = 0xCF;

// ---- PCA9685 channels (H12) ----
constexpr uint8_t SERVO_SWIVEL_CH = 0;  // H3 MG996R, -90..+90 deg (test +-85 first)
constexpr uint8_t SERVO_TILT_CH   = 1;  // H6 MG996R, limits measured on the build
constexpr float   SERVO_HZ        = 50.0f;

// ---- Stepper (R1 via A4988) ----
constexpr uint32_t STEPS_PER_DISC_TURN = 16000;  // 200 x 16 x 80/16 (sheet 09)

// ---- INA219 shunt (E10) ----
constexpr float INA_SHUNT_OHM = 0.010f;  // R010 fitted in place of R100 (sheet 12)

// ---- Safety numbers from the blueprint ----
constexpr uint32_t PUMP_CAP_PEST_MS   = 3000;  // sheet 36
constexpr uint32_t PUMP_CAP_DAMAGE_MS = 5000;  // sheet 50
constexpr uint32_t IR_ON_MS           = 150;   // per frame, night mode (sheet 43)
constexpr float    BATT_PARK_V        = 11.8f; // sheet 36
constexpr float    OVERCURRENT_A      = 4.5f;  // for 0.5 s -> stop all (sheet 36)
