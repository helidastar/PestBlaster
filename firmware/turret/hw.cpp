// PestBlaster turret firmware - hardware layer (see hw.h).
#include "hw.h"

#include <Adafruit_PWMServoDriver.h>
#include <Arduino.h>
#include <Wire.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#include "config.h"
#include "logic.h"
#include "pins.h"

namespace hw {

static Adafruit_PWMServoDriver pca(ADDR_PCA9685);
static SemaphoreHandle_t i2cLock = nullptr;
static uint8_t pcfOut = PCF_IDLE;

struct Lock {
  Lock() { xSemaphoreTakeRecursive(i2cLock, portMAX_DELAY); }
  ~Lock() { xSemaphoreGiveRecursive(i2cLock); }
};

static void pcfWrite(uint8_t v) {
  Lock l;
  pcfOut = v;
  Wire.beginTransmission(ADDR_PCF8574);
  Wire.write(v);
  Wire.endTransmission();
}

static void pcfBit(uint8_t bit, bool level) {
  Lock l;
  pcfWrite(level ? (pcfOut | (1 << bit)) : (pcfOut & ~(1 << bit)));
}

static bool present(uint8_t addr) {
  Lock l;
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

bool begin(char* report, int reportLen) {
  // Stepper driver off and IR off before anything else (schematic O6).
  pinMode(PIN_STEP_EN, OUTPUT);
  digitalWrite(PIN_STEP_EN, HIGH);
  pinMode(PIN_IR_GATE, OUTPUT);
  digitalWrite(PIN_IR_GATE, LOW);
  pinMode(PIN_STEP, OUTPUT);
  digitalWrite(PIN_STEP, LOW);
  pinMode(PIN_DIR, OUTPUT);
  pinMode(PIN_PCF_INT, INPUT_PULLUP);

  i2cLock = xSemaphoreCreateRecursiveMutex();
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_HZ);
  Wire.setTimeOut(20);
  pcfWrite(PCF_IDLE);  // relays off, actuator coast, inputs high

  bool pcf = present(ADDR_PCF8574), pcaOk = present(ADDR_PCA9685), ina = present(ADDR_INA219);
  if (pcaOk) {
    Lock l;
    pca.begin();
    pca.setPWMFreq(SERVO_HZ);
  }
  snprintf(report, reportLen, "PCF8574 0x20 %s, PCA9685 0x40 %s, INA219 0x41 %s", pcf ? "ok" : "MISSING",
           pcaOk ? "ok" : "MISSING", ina ? "ok" : "MISSING");
  return pcf && pcaOk && ina;
}

bool cameraBegin() {
  // Freenove ESP32-S3 WROOM CAM camera pins (GPIO 4-13, 15-18; pins.h keeps them free).
  camera_config_t c = {};
  c.pin_pwdn = -1;
  c.pin_reset = -1;
  c.pin_xclk = 15;
  c.pin_sccb_sda = 4;
  c.pin_sccb_scl = 5;
  c.pin_d7 = 16;
  c.pin_d6 = 17;
  c.pin_d5 = 18;
  c.pin_d4 = 12;
  c.pin_d3 = 10;
  c.pin_d2 = 8;
  c.pin_d1 = 9;
  c.pin_d0 = 11;
  c.pin_vsync = 6;
  c.pin_href = 7;
  c.pin_pclk = 13;
  c.xclk_freq_hz = 20000000;
  c.ledc_timer = LEDC_TIMER_0;
  c.ledc_channel = LEDC_CHANNEL_0;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_VGA;  // 640 x 480 (sheet 34)
  c.jpeg_quality = JPEG_QUALITY;
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  return esp_camera_init(&c) == ESP_OK;
}

void pump(bool on) { pcfBit(PCF_RELAY_PUMP, !on); }
void valve(bool open) { pcfBit(PCF_RELAY_VALVE, !open); }
void sprayOff() {
  Lock l;
  valve(false);
  pump(false);
}
bool pumpIsOn() { return !(pcfOut >> PCF_RELAY_PUMP & 1); }

void actuator(Act a) {
  Lock l;
  bool up = a == Act::Up, down = a == Act::Down;
  bool in1 = ACT_UP_IS_IN1 ? up : down;
  bool in2 = ACT_UP_IS_IN1 ? down : up;
  uint8_t v = pcfOut & ~((1 << PCF_ACT_IN1) | (1 << PCF_ACT_IN2));  // 0 0 = coast
  if (in1) v |= 1 << PCF_ACT_IN1;
  if (in2) v |= 1 << PCF_ACT_IN2;
  pcfWrite(v);
}

Inputs readInputs() {
  Lock l;
  Inputs in;
  if (Wire.requestFrom(ADDR_PCF8574, (uint8_t)1) == 1 && Wire.available()) {
    uint8_t v = Wire.read();
    in.ok = true;
    in.homePressed = !(v >> PCF_HOME_SW & 1);
    in.busLive = v >> PCF_ESTOP_SENSE & 1;
  }
  return in;
}

static bool inaReg(uint8_t reg, int16_t& out) {
  Lock l;
  Wire.beginTransmission(ADDR_INA219);
  Wire.write(reg);
  if (Wire.endTransmission() != 0) return false;
  if (Wire.requestFrom(ADDR_INA219, (uint8_t)2) != 2) return false;
  uint8_t hi = Wire.read();
  uint8_t lo = Wire.read();
  out = (int16_t)((hi << 8) | lo);
  return true;
}

// Shunt LSB 10 uV -> I = V / 0.010 ohm. Bus: (raw >> 3) x 4 mV (as in the bring-up sketch).
float batteryAmps() {
  int16_t r;
  return inaReg(0x01, r) ? r * 10e-6f / INA_SHUNT_OHM : -1.0f;
}
float batteryVolts() {
  int16_t r;
  return inaReg(0x02, r) ? (((uint16_t)r) >> 3) * 0.004f : -1.0f;
}

static void servoUs(uint8_t ch, float us) {
  Lock l;
  pca.setPWM(ch, 0, (uint16_t)(us * 4096.0f / 20000.0f));  // 20 ms frame at 50 Hz
}

void swivelDeg(float psi) {
  psi = pb::clampf(psi, -SWIVEL_LIMIT_DEG, SWIVEL_LIMIT_DEG);
  servoUs(SERVO_SWIVEL_CH, SWIVEL_US_CENTRE + psi * SWIVEL_US_PER_DEG);
}

void tiltDeg(float phi) {
  phi = pb::clampf(phi, TILT_MIN_DEG, TILT_MAX_DEG);
  servoUs(SERVO_TILT_CH, TILT_US_AT_0 + (TILT_US_AT_90 - TILT_US_AT_0) * phi / 90.0f);
}

void stepperEnable(bool on) { digitalWrite(PIN_STEP_EN, on ? LOW : HIGH); }
void stepperDir(bool positive) { digitalWrite(PIN_DIR, positive == STEPPER_DIR_POSITIVE_HIGH ? HIGH : LOW); }
void stepPulse() {
  digitalWrite(PIN_STEP, HIGH);
  delayMicroseconds(3);  // A4988 needs >= 1 us high
  digitalWrite(PIN_STEP, LOW);
}

void ir(bool on) { digitalWrite(PIN_IR_GATE, on ? HIGH : LOW); }

camera_fb_t* grab() { return esp_camera_fb_get(); }
void release(camera_fb_t* fb) {
  if (fb) esp_camera_fb_return(fb);
}

}  // namespace hw
