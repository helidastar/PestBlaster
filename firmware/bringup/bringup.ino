// PestBlaster bring-up test (worked example): checks every wire on schematic pages 2-3
// one part at a time. Arduino IDE, board "ESP32S3 Dev Module", PSRAM "OPI PSRAM".
// Library: Adafruit PWM Servo Driver (for the PCA9685). Open Serial Monitor at 115200.
// Run with the turret lifted off the plants and the reservoir empty.
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include "pins.h"

Adafruit_PWMServoDriver pca(ADDR_PCA9685);
uint8_t pcfOut = PCF_IDLE;

void pcfWrite(uint8_t v) { pcfOut = v; Wire.beginTransmission(ADDR_PCF8574); Wire.write(v); Wire.endTransmission(); }
uint8_t pcfRead() { Wire.requestFrom(ADDR_PCF8574, (uint8_t)1); return Wire.available() ? Wire.read() : 0xFF; }
void pcfBit(uint8_t bit, bool level) { pcfWrite(level ? (pcfOut | (1 << bit)) : (pcfOut & ~(1 << bit))); }

int16_t inaReg(uint8_t reg) {
  Wire.beginTransmission(ADDR_INA219); Wire.write(reg); Wire.endTransmission();
  Wire.requestFrom(ADDR_INA219, (uint8_t)2);
  uint8_t hi = Wire.read(), lo = Wire.read();   // two statements: C++ does not fix the order inside one expression
  return (int16_t)((hi << 8) | lo);
}
// Shunt register LSB = 10 uV -> I = V / 0.010 ohm. Bus register: (raw >> 3) x 4 mV. No calibration needed.
float inaAmps()  { return inaReg(0x01) * 10e-6f / INA_SHUNT_OHM; }
float inaVolts() { return (((uint16_t)inaReg(0x02)) >> 3) * 0.004f; }

void servoUs(uint8_t ch, int us) { pca.setPWM(ch, 0, (int)(us * 4096L / 20000L)); }  // 20 ms frame at 50 Hz

void setup() {
  // 1. Safe states first: stepper driver off, IR off (A4988 EN floats LOW at boot = on).
  pinMode(PIN_STEP_EN, OUTPUT); digitalWrite(PIN_STEP_EN, HIGH);
  pinMode(PIN_IR_GATE, OUTPUT); digitalWrite(PIN_IR_GATE, LOW);
  pinMode(PIN_STEP, OUTPUT); pinMode(PIN_DIR, OUTPUT);
  pinMode(PIN_PCF_INT, INPUT_PULLUP);
  Serial.begin(115200); delay(1500);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_HZ);
  pcfWrite(PCF_IDLE);

  // 2. I2C scan: expect 0x20, 0x40, 0x41 (sheet 31 check).
  Serial.println("I2C scan:");
  for (uint8_t a = 1; a < 127; a++) { Wire.beginTransmission(a); if (Wire.endTransmission() == 0) Serial.printf("  found 0x%02X\n", a); }

  // 3. INA219: battery volts and current.
  Serial.printf("Battery %.2f V, %.3f A\n", inaVolts(), inaAmps());

  // 4. Inputs on the PCF8574.
  uint8_t in = pcfRead();
  Serial.printf("Home switch %s, motor bus %s\n", (in >> PCF_HOME_SW & 1) ? "free" : "PRESSED",
                (in >> PCF_ESTOP_SENSE & 1) ? "live" : "DEAD (E-stop pressed)");

  // 5. Relays: each one clicks for 0.5 s. Pump never longer than its 3 s cap.
  pcfBit(PCF_RELAY_PUMP, 0);  delay(500); pcfBit(PCF_RELAY_PUMP, 1);
  pcfBit(PCF_RELAY_VALVE, 0); delay(500); pcfBit(PCF_RELAY_VALVE, 1);

  // 6. Servos to centre (1500 us), one at a time (one motion at a time rule).
  pca.begin(); pca.setPWMFreq(SERVO_HZ); delay(10);
  servoUs(SERVO_SWIVEL_CH, 1500); delay(800);
  servoUs(SERVO_TILT_CH, 1500);   delay(800);

  // 7. Stepper: 1/8 disc turn each way at low speed (2000 steps, 1 ms per step).
  digitalWrite(PIN_STEP_EN, LOW);
  for (int d = 0; d < 2; d++) {
    digitalWrite(PIN_DIR, d);
    for (int i = 0; i < STEPS_PER_DISC_TURN / 8; i++) { digitalWrite(PIN_STEP, HIGH); delayMicroseconds(5); digitalWrite(PIN_STEP, LOW); delayMicroseconds(995); }
    delay(300);
  }
  digitalWrite(PIN_STEP_EN, HIGH);

  // 8. Actuator: 1 s one way, coast, 1 s back. Note which way is UP and write it in pins.h.
  pcfBit(PCF_ACT_IN1, 1); delay(1000); pcfBit(PCF_ACT_IN1, 0); delay(500);
  pcfBit(PCF_ACT_IN2, 1); delay(1000); pcfBit(PCF_ACT_IN2, 0);

  // 9. IR LEDs: 0.15 s flash, servos still (look with a phone camera).
  digitalWrite(PIN_IR_GATE, HIGH); delay(IR_ON_MS); digitalWrite(PIN_IR_GATE, LOW);
  Serial.println("Bring-up done.");
}

void loop() {
  // Press the home switch or the E-stop: INT goes LOW and the new input state is printed.
  if (digitalRead(PIN_PCF_INT) == LOW) {
    uint8_t in = pcfRead();
    Serial.printf("INT: home %d, bus %d, %.2f V %.3f A\n", in >> PCF_HOME_SW & 1, in >> PCF_ESTOP_SENSE & 1, inaVolts(), inaAmps());
    delay(50);
  }
}
