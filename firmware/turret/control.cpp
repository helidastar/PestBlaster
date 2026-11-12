// PestBlaster turret firmware - patrol, aim, spray, app commands and safety (setup() and loop()).
// The overview is at the top of turret.ino.
#include <Arduino.h>
#include <esp_timer.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <math.h>

#include "config.h"
#include "hw.h"
#include "logic.h"
#include "net.h"
#include "pins.h"

using pb::AppPose;
using pb::Joints;

constexpr int PIN_BOOT_BTN = 0;  // the board's BOOT button, read only after boot (refill reset)
constexpr int32_t STEPS_PER_TURN = (int32_t)STEPS_PER_DISC_TURN;
constexpr float STEPS_PER_RAD = STEPS_PER_TURN / (2.0f * (float)M_PI);
static const char* BOUNDARY = "----pestblaster-frame-7d3f";

// ---------------- shared state ----------------
// Written by one task, read by the others. Small values are volatile; the pose and the
// settings are copied under 'mux' so a reader never sees half an update.
static portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
static Joints joints;               // where the turret is now (main loop writes)
static int32_t t1Steps = 0;         // turntable position in steps from home
static pb::Settings settings;       // from the app (link task writes)
static volatile bool paused = false;
static volatile bool resumeRequested = false;  // app went from Paused to Auto
static volatile uint32_t stopCount = 0;       // +1 for every "stop" from the app (hold to spray released)
static volatile bool fastPoll = false;         // check in every 250 ms while a manual spray runs
static volatile bool estop = false;            // motor bus dead
static volatile bool estopLatched = false;     // stays set until released + Home (or Resume) in the app
static volatile bool overcurrent = false;      // jam: latched until Home in the app
static volatile bool batteryLow = false;
static volatile bool homed = false;            // turntable zero found on R7, lift at its bottom stop
static volatile float batteryV = 0, currentA = 0;
static volatile float reservoirPct = 100;
static volatile uint32_t pumpOnAt = 0;
static const char* volatile stateText = "booting";
static QueueHandle_t commandQueue;
static Preferences prefs;

static Joints getJoints() {
  portENTER_CRITICAL(&mux);
  Joints j = joints;
  portEXIT_CRITICAL(&mux);
  return j;
}
static void setJoints(const Joints& j) {
  portENTER_CRITICAL(&mux);
  joints = j;
  portEXIT_CRITICAL(&mux);
}
static pb::Settings getSettings() {
  portENTER_CRITICAL(&mux);
  pb::Settings s = settings;
  portEXIT_CRITICAL(&mux);
  return s;
}

static bool linkOk() {
  return net::wifiUp() && !net::lastFailed() && millis() - net::lastOkMs() < HTTP_TIMEOUT_MS + HEARTBEAT_MS;
}

// What may run right now. Homing and parking work without the Pi; patrol moves and sprays do not.
enum class Need { Local, Link, Patrol };
static bool allowed(Need need) {
  if (estop || estopLatched || overcurrent) return false;
  if (need == Need::Local) return true;
  if (!linkOk()) return false;
  if (need == Need::Patrol) return homed && !paused && !batteryLow;
  return true;
}

static const char* faultText() {
  if (estop) return "estop";
  if (estopLatched) return "estop_released_press_home";
  if (overcurrent) return "overcurrent_press_home";
  if (batteryLow) return "battery_low";
  if (!homed) return "not_homed";
  return "";
}

// Waits ms, but gives up early (returns false) when 'need' is no longer allowed.
static bool waitMs(uint32_t ms, Need need) {
  uint32_t start = millis();
  while (millis() - start < ms) {
    if (!allowed(need)) return false;
    delay(ms - (millis() - start) < 10 ? 1 : 10);
  }
  return allowed(need);
}

// ---------------- pump and valve ----------------
static void pumpStart() {
  hw::pump(true);
  pumpOnAt = millis();
}
static void sprayStop() {
  hw::sprayOff();
  pumpOnAt = 0;
}

// ---------------- safety task (every 20 ms, core 0) ----------------
static void safetyTask(void*) {
  uint32_t lowSince = 0, overSince = 0, lastIna = 0;
  for (;;) {
    hw::Inputs in = hw::readInputs();
    bool dead = in.ok && !in.busLive;
    if (dead && !estop) Serial.println("[safety] E-stop pressed: all motion and spray off");
    if (dead) {
      estop = true;
      estopLatched = true;
    } else if (in.ok) {
      estop = false;
    }

    uint32_t now = millis();
    if (now - lastIna >= 100) {
      lastIna = now;
      float v = hw::batteryVolts(), a = hw::batteryAmps();
      if (v > 0) batteryV = v;
      if (a > -1) currentA = a;
      if (v > 0 && v < BATT_PARK_V) {
        if (!lowSince) lowSince = now;
        if (now - lowSince >= BATTERY_LOW_HOLD_MS && !batteryLow) {
          batteryLow = true;
          Serial.printf("[safety] battery %.2f V < %.1f V: parking\n", v, BATT_PARK_V);
        }
      } else {
        lowSince = 0;
        if (v >= BATT_PARK_V + 0.6f) batteryLow = false;  // charged again (assumed 12.4 V)
      }
      if (a > OVERCURRENT_A) {
        if (!overSince) overSince = now;
        if (now - overSince >= OVERCURRENT_HOLD_MS && !overcurrent) {
          overcurrent = true;
          Serial.printf("[safety] %.2f A for 0.5 s: jam, everything stopped\n", a);
        }
      } else {
        overSince = 0;
      }
    }

    // Hard limits that do not trust the main loop: pump cap, E-stop, jam, lost link.
    bool pumpOn = hw::pumpIsOn();
    bool capHit = pumpOn && pumpOnAt && now - pumpOnAt > PUMP_CAP_PEST_MS + 100;
    if (pumpOn && (estop || overcurrent || !linkOk() || capHit)) {
      sprayStop();
      Serial.println(capHit ? "[safety] pump cap reached: pump off" : "[safety] spray cut");
    }
    if (estop || overcurrent) {
      hw::stepperEnable(false);
      hw::actuator(hw::Act::Coast);
    }
    vTaskDelay(pdMS_TO_TICKS(SAFETY_PERIOD_MS));
  }
}

// ---------------- link task (heartbeat, core 0) ----------------
static void reportCommand(int32_t id, bool ok) {
  std::string reply;
  std::string path = "/api/device/commands/" + std::to_string(id);
  net::postJson(path.c_str(), pb::commandDoneBody(ok), reply);
}

static void linkTask(void*) {
  bool wasPaused = false;
  for (;;) {
    net::keepWifiAlive();
    pb::Status st;
    st.batteryV = batteryV;
    st.currentA = currentA;
    st.estop = estop;
    st.state = stateText;
    st.fault = faultText();
    std::string reply;
    bool ok = net::postJson("/api/device/heartbeat", pb::heartbeatBody(getJoints(), reservoirPct, FIRMWARE_VERSION, st),
                            reply);
    pb::HeartbeatReply hb;
    if (ok && pb::parseHeartbeatReply(reply, hb)) {
      portENTER_CRITICAL(&mux);
      settings = hb.settings;
      portEXIT_CRITICAL(&mux);
      if (wasPaused && !hb.paused) resumeRequested = true;
      wasPaused = hb.paused;
      paused = hb.paused;
      for (const pb::Command& c : hb.commands) {
        if (c.type == pb::CmdType::Stop) {
          stopCount++;  // acted on at once, even in the middle of a manual spray
          reportCommand(c.id, true);
          continue;
        }
        pb::Command q = c;
        q.tag = stopCount;  // a "stop" after this point cancels this spray
        if (xQueueSend(commandQueue, &q, 0) != pdTRUE) reportCommand(c.id, false);  // queue full: not done
      }
    }
    uint32_t wait = fastPoll ? HEARTBEAT_FAST_MS : (ok ? HEARTBEAT_MS : LINK_RETRY_MS);
    for (uint32_t t = 0; t < wait && !(fastPoll && wait > HEARTBEAT_FAST_MS); t += 50) vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// ---------------- motion (main loop only) ----------------
static void setT1Steps(int32_t steps) {
  t1Steps = steps;
  Joints j = getJoints();
  j.t1 = pb::norm360(steps * 360.0f / STEPS_PER_TURN);
  setJoints(j);
}

// Turns the disc to deg the short way, with the blueprint's acceleration (sheet 17).
static bool turnTo(float deg, Need need) {
  int32_t d = pb::shortestSteps(t1Steps, deg, STEPS_PER_TURN);
  if (d == 0) return true;
  if (!allowed(need)) return false;
  uint32_t n = (uint32_t)abs(d);
  float accel = TURN_ACCEL_RAD_S2 * STEPS_PER_RAD, vmax = TURN_MAX_RAD_S * STEPS_PER_RAD;
  int32_t dir = d > 0 ? 1 : -1;
  hw::stepperEnable(true);
  hw::stepperDir(dir > 0);
  delayMicroseconds(5);
  uint64_t start = esp_timer_get_time();
  for (uint32_t i = 1; i <= n; i++) {
    uint64_t due = start + pb::stepTimeUs(i, n, accel, vmax);
    for (;;) {
      int64_t left = (int64_t)(due - esp_timer_get_time());
      if (left <= 0) break;
      if (left > 3000) vTaskDelay(1);  // slow steps: let other work run
    }
    if ((i & 15) == 0 && !allowed(need)) {
      setT1Steps(t1Steps + dir * (int32_t)(i - 1));  // steps 1..i-1 were made
      homed = false;  // stopped at speed: the arm may have slipped, find R7 again later
      Serial.println("[move] turn stopped early; will re-home");
      return false;
    }
    hw::stepPulse();
  }
  setT1Steps(t1Steps + d);
  // The driver stays on to hold the disc while the turret works.
  return waitMs(TURN_SETTLE_MS, need);
}

// The lift has no sensor: it is timed from an end stop (schematic O8).
static bool liftTo(float mm, Need need) {
  mm = pb::clampf(mm, 0, LIFT_STROKE_MM);
  Joints j = getJoints();
  bool toEnd = mm <= 0.5f || mm >= LIFT_STROKE_MM - 0.5f;
  if (fabsf(mm - j.liftMm) < 1) return true;  // homeAll() sets 'unknown' as 300 so the full stroke runs
  if (!allowed(need)) return false;
  uint32_t ms = pb::liftTimeMs(j.liftMm, mm, LIFT_MM_PER_S) + (toEnd ? LIFT_END_EXTRA_MS : 0);
  bool up = mm > j.liftMm || (toEnd && mm > 0.5f);
  hw::actuator(up ? hw::Act::Up : hw::Act::Down);
  uint32_t start = millis();
  bool ok = true;
  while (millis() - start < ms) {
    if (!allowed(need)) { ok = false; break; }
    delay(10);
  }
  hw::actuator(hw::Act::Coast);
  float moved = (millis() - start) / 1000.0f * LIFT_MM_PER_S;
  j = getJoints();
  j.liftMm = ok ? mm : pb::clampf(j.liftMm + (up ? moved : -moved), 0, LIFT_STROKE_MM);
  setJoints(j);
  if (!ok) homed = false;  // lift position now only a guess
  return ok;
}

// One servo at a time (blueprint rule), then let the head settle.
static bool headTo(float psi, float phi, Need need) {
  Joints j = getJoints();
  psi = pb::clampf(psi, -SWIVEL_LIMIT_DEG, SWIVEL_LIMIT_DEG);
  phi = pb::clampf(phi, TILT_MIN_DEG, TILT_MAX_DEG);
  bool moved = false;
  if (fabsf(psi - j.psi) > 0.05f) {
    hw::swivelDeg(psi);
    j.psi = psi;
    setJoints(j);
    if (!waitMs(SERVO_MOVE_MS, need)) return false;
    moved = true;
  }
  if (fabsf(phi - j.phi) > 0.05f) {
    hw::tiltDeg(phi);
    j.phi = phi;
    setJoints(j);
    if (!waitMs(SERVO_MOVE_MS, need)) return false;
    moved = true;
  }
  return moved ? waitMs(SERVO_SETTLE_MS, need) : true;
}

// Step interval for homing: starts 4x slower and reaches the homing speed after 200 steps.
static uint32_t homeIntervalUs(int32_t i) {
  float us = 1e6f / (HOME_SPEED_RAD_S * STEPS_PER_RAD);
  return (uint32_t)(i >= 200 ? us : us * (4.0f - 3.0f * i / 200.0f));
}

static void homeWait(int32_t i) {
  uint32_t us = homeIntervalUs(i);
  if (us > 3000) delay(us / 1000);
  else delayMicroseconds(us);
}

// Finds R7 at a slow, steady speed and calls that 0 deg.
static bool homeTurntable() {
  hw::stepperEnable(true);
  // Already on the switch: back off first so the edge is always found from the same side.
  hw::Inputs in = hw::readInputs();
  if (in.homePressed) {
    hw::stepperDir(false);
    for (int i = 0; i < STEPS_PER_TURN / 36; i++) {  // up to 10 deg
      if (!allowed(Need::Local)) return false;
      hw::stepPulse();
      homeWait(i);
      if ((i & 3) == 0 && !hw::readInputs().homePressed && i > STEPS_PER_TURN / 180) break;
    }
  }
  hw::stepperDir(true);
  int32_t maxSteps = (int32_t)(HOME_MAX_TURNS * STEPS_PER_TURN);
  for (int32_t i = 0; i < maxSteps; i++) {
    if ((i & 3) == 0) {
      if (!allowed(Need::Local)) return false;
      if (hw::readInputs().homePressed) {
        setT1Steps(0);
        return true;
      }
    }
    hw::stepPulse();
    homeWait(i);
  }
  Serial.println("[home] switch R7 not found in 1.1 turns: check the switch and its lead");
  return false;
}

// Head level-ish, lift down to its stop, turntable to R7.
static bool homeAll() {
  stateText = "homing";
  Serial.println("[home] homing");
  homed = false;
  Joints j = getJoints();
  j.liftMm = LIFT_STROKE_MM;  // unknown: assume the worst so the full stroke is driven
  setJoints(j);
  hw::swivelDeg(0);
  delay(SERVO_MOVE_MS);
  hw::tiltDeg(PARK_TILT_DEG);
  delay(SERVO_MOVE_MS + SERVO_SETTLE_MS);
  j = getJoints();
  j.psi = 0;
  j.phi = PARK_TILT_DEG;
  setJoints(j);
  if (!liftTo(0, Need::Local)) return false;
  if (!homeTurntable()) return false;
  homed = true;
  Serial.println("[home] done");
  return true;
}

// ---------------- camera and the app ----------------
static bool sendFrame(bool confirm, pb::CaptureReply& out) {
  if (NIGHT_MODE) hw::ir(true);  // IR on for the stale frame and the real one (about 0.15 s)
  hw::release(hw::grab());       // discard 1 stale frame (sheet 20)
  camera_fb_t* fb = hw::grab();
  if (NIGHT_MODE) hw::ir(false);
  if (!fb) {
    Serial.println("[cam] no frame");
    return false;
  }
  Joints j = getJoints();
  std::string reply;
  bool ok = net::postCapture(fb->buf, fb->len, pb::multipartHead(BOUNDARY, j, confirm), pb::multipartTail(BOUNDARY),
                             BOUNDARY, reply);
  hw::release(fb);
  if (!ok || !pb::parseCaptureReply(reply, out)) return false;
  return true;
}

static void reportSpray(bool manual, uint32_t ms, int32_t captureId) {
  float pct = pb::reservoirAfter(reservoirPct, ms, RESERVOIR_PCT_PER_S);
  reservoirPct = pct;
  prefs.putFloat("res", pct);
  std::string reply;
  net::postJson("/api/device/fires", pb::fireBody(manual, ms, getJoints(), captureId), reply);
  Serial.printf("[spray] %s %u ms, reservoir about %.0f %%\n", manual ? "manual" : "auto", (unsigned)ms, pct);
}

// Valve burst with the pump already running. Returns the time the valve was open.
// A manual burst (stopTag >= 0) also ends when the app sends "stop".
static uint32_t burst(uint32_t wantMs, int64_t stopTag) {
  auto stopped = [&] { return stopTag >= 0 && stopCount != (uint32_t)stopTag; };
  while (millis() - pumpOnAt < PUMP_LEAD_MS) {
    if (!allowed(Need::Link) || stopped()) { sprayStop(); return 0; }
    delay(5);
  }
  uint32_t openMs = pb::valveOpenMs(wantMs, millis() - pumpOnAt, PUMP_CAP_PEST_MS);
  if (openMs == 0) { sprayStop(); return 0; }
  hw::valve(true);
  uint32_t start = millis();
  while (millis() - start < openMs) {
    if (!allowed(Need::Link) || stopped()) break;
    delay(5);
  }
  uint32_t sprayed = millis() - start;
  hw::valve(false);
  if (PUMP_TAIL_MS) delay(PUMP_TAIL_MS);
  sprayStop();
  return sprayed > openMs ? openMs : sprayed;
}

// The app said "fire" for this frame: coarse turn if needed, pump on, fine aim,
// confirm with a new frame, then spray (sheet 36). Never sprays without a "fire" reply.
static void attack(const pb::CaptureReply& first) {
  const pb::AimLimits lim{AIM_PSI_MAX_DEG, AIM_PSI_COARSE_DEG, TILT_MIN_DEG, TILT_MAX_DEG};
  if (reservoirPct <= 3) { Serial.println("[aim] reservoir empty"); return; }
  stateText = "aiming";
  bool coarse = false;
  Joints plan = pb::planAim(getJoints(), first.aim, lim, &coarse);
  // The coarse turn comes before the pump so the 3 s pump cap is not spent turning.
  if (coarse && !turnTo(plan.t1, Need::Patrol)) return;
  pumpStart();
  if (!headTo(plan.psi, plan.phi, Need::Patrol)) { sprayStop(); return; }
  for (int tries = 0; tries < AIM_MAX_CONFIRMS; tries++) {
    pb::CaptureReply check;
    if (!sendFrame(true, check)) { sprayStop(); return; }
    if (!check.fire) {
      Serial.printf("[aim] confirm frame says hold (%s)\n", check.holdReason.c_str());
      sprayStop();
      return;
    }
    if (pb::onTarget(pb::toAppPose(getJoints()), check.aim, AIM_TOLERANCE_DEG)) {
      stateText = "spraying";
      uint32_t ms = burst(check.burstMs, -1);
      if (ms > 0) reportSpray(false, ms, check.captureId);
      return;
    }
    Joints fix = pb::planAim(getJoints(), check.aim, lim, &coarse);
    if (coarse || !headTo(fix.psi, fix.phi, Need::Patrol)) break;  // no turning with the pump on
  }
  Serial.println("[aim] not on target after the confirm frames: no spray");
  sprayStop();
}

// ---------------- app commands ----------------
static bool doManualSpray(uint32_t durationMs, uint32_t tag) {
  if (!allowed(Need::Link)) return false;
  if (reservoirPct <= 3) return false;
  if (stopCount != tag) return false;  // released before the turret got to it
  stateText = "manual spray";
  fastPoll = true;
  pumpStart();
  uint32_t ms = burst(durationMs, tag);
  fastPoll = false;
  if (ms > 0) reportSpray(true, ms, -1);
  return true;
}

static bool doMove(const AppPose& p) {
  stateText = "manual move";
  const pb::AimLimits lim{SWIVEL_LIMIT_DEG, 0.0f, TILT_MIN_DEG, TILT_MAX_DEG};
  bool coarse = false;
  Joints plan = pb::planAim(getJoints(), p, lim, &coarse);
  if (!homed) return false;
  return liftTo(p.lift, Need::Link) && turnTo(plan.t1, Need::Link) && headTo(plan.psi, plan.phi, Need::Link);
}

static void clearLatchesForHome() {
  if (!estop) estopLatched = false;
  overcurrent = false;
}

// Runs the commands that came in with the last heartbeats. Called between frames.
static void serviceCommands() {
  pb::Command c;
  while (xQueueReceive(commandQueue, &c, 0) == pdTRUE) {
    bool ok = false;
    switch (c.type) {
      case pb::CmdType::Fire: ok = doManualSpray(c.durationMs, c.tag); break;
      case pb::CmdType::Move: ok = c.hasPose && doMove(c.pose); break;
      case pb::CmdType::Home: clearLatchesForHome(); ok = homeAll(); break;
      default: ok = false; break;  // set_mode arrives as "mode" in the heartbeat instead
    }
    Serial.printf("[cmd] #%d %s\n", (int)c.id, ok ? "done" : "failed");
    reportCommand(c.id, ok);
  }
}

// ---------------- patrol ----------------
static int patrolStop = 0;  // resumes from here after a stop (docs 6.9 step 4)

static bool patrol() {
  stateText = "patrol";
  if (!liftTo(PATROL_LIFT_MM, Need::Patrol)) return false;
  for (; patrolStop < pb::PATROL_STOPS; patrolStop++) {
    float angle = pb::stopAngle(patrolStop);
    for (int f = 0; f < pb::FRAMES_PER_STOP; f++) {
      serviceCommands();
      if (!allowed(Need::Patrol)) return false;
      stateText = "patrol";
      if (!turnTo(angle, Need::Patrol)) return false;  // no-op unless a command or an aim moved it
      const pb::Frame& fr = pb::PATROL_FRAMES[f];
      if (!headTo(fr.psi, fr.phi, Need::Patrol)) return false;
      pb::CaptureReply r;
      if (!sendFrame(false, r)) return false;
      if (r.detections > 0)
        Serial.printf("[patrol] stop %d frame %d: %d found, %s %s\n", patrolStop, f, r.detections,
                      r.fire ? "fire" : "hold", r.fire ? r.pest.c_str() : r.holdReason.c_str());
      if (r.fire) attack(r);
    }
  }
  patrolStop = 0;
  Serial.println("[patrol] done");
  return true;
}

static bool parkedForFault = false;
static void park(const char* why) {
  if (parkedForFault) return;
  Serial.printf("[park] %s: lift down, home\n", why);
  stateText = "parking";
  sprayStop();
  if (liftTo(0, Need::Local) && turnTo(0, Need::Local) && headTo(0, PARK_TILT_DEG, Need::Local))
    parkedForFault = true;
}

// ---------------- setup and loop ----------------
static void checkRefillButton() {
  static uint32_t downSince = 0;
  if (digitalRead(PIN_BOOT_BTN) == LOW) {
    if (!downSince) downSince = millis();
    if (millis() - downSince >= REFILL_HOLD_MS && reservoirPct < 100) {
      reservoirPct = 100;
      prefs.putFloat("res", 100);
      Serial.println("[refill] reservoir set to 100 %");
    }
  } else {
    downSince = 0;
  }
}

void setup() {
  char report[96];
  bool chips = hw::begin(report, sizeof report);  // safe states before anything else
  Serial.begin(115200);
  delay(500);
  Serial.printf("\nPestBlaster %s\n[boot] %s\n", FIRMWARE_VERSION, report);
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  prefs.begin("pb", false);
  reservoirPct = prefs.getFloat("res", 100);
  bool cam = hw::cameraBegin();
  Serial.printf("[boot] camera %s, reservoir about %.0f %%\n", cam ? "ok" : "FAILED", (float)reservoirPct);
  commandQueue = xQueueCreate(8, sizeof(pb::Command));
  net::begin();
  xTaskCreatePinnedToCore(safetyTask, "safety", 4096, nullptr, 5, nullptr, 0);
  xTaskCreatePinnedToCore(linkTask, "link", 8192, nullptr, 3, nullptr, 0);
  if (!chips || !cam) {
    stateText = "self-test failed";
    Serial.println("[boot] self-test failed: fix the part above, then reset. Nothing will move.");
    for (;;) delay(1000);
  }
  delay(200);  // let the safety task read the E-stop once
  homeAll();
}

void loop() {
  static uint32_t nextPatrolAt = 0, linkLostAt = 0;
  checkRefillButton();
  serviceCommands();

  if (resumeRequested) {  // Paused -> Auto in the app also clears a released E-stop
    resumeRequested = false;
    if (!estop && estopLatched) {
      estopLatched = false;
      homeAll();
    }
  }

  if (estop || estopLatched || overcurrent) {
    stateText = estop ? "e-stop" : "stopped";
    sprayStop();
    delay(50);
    return;
  }
  if (!linkOk()) {
    if (!linkLostAt) linkLostAt = millis();
    stateText = "no link";
    if (millis() - linkLostAt > LINK_LOST_HOME_MS) park("no reply from the Pi for 1 min");
    delay(50);
    return;
  }
  linkLostAt = 0;
  if (batteryLow) { park("battery low"); delay(200); return; }
  parkedForFault = false;
  bool waiting = (int32_t)(millis() - nextPatrolAt) < 0;
  if (!paused && !homed) { if (!homeAll()) delay(1000); return; }  // never moves while paused
  if (paused || waiting) {
    // Parked: the stepper lets go to save power (the next patrol finds R7 again).
    stateText = paused ? "paused" : "waiting";
    hw::stepperEnable(false);
    delay(50);
    return;
  }

  // Each patrol starts by finding R7 (sheet 36 step 1); a resumed patrol keeps its place.
  if (patrolStop == 0) {
    stateText = "homing";
    if (!turnTo(0, Need::Patrol) || !homeTurntable()) { homed = false; return; }
  }
  if (patrol()) nextPatrolAt = millis() + PATROL_GAP_S * 1000UL;
}
