// PestBlaster turret firmware - plain C++ logic with no Arduino calls.
// Everything here is also compiled and tested on a laptop (firmware/turret/test/).
#pragma once
#include <stdint.h>
#include <string>
#include <vector>

namespace pb {

// ---------- angles ----------
float norm360(float deg);  // 0 <= result < 360
float wrap180(float deg);  // -180 < result <= 180
float clampf(float v, float lo, float hi);

// The real joints of the turret (blueprint v15/v3): turntable t1 (0-360),
// head swivel psi (-90..+90, 0 = along the arm), head tilt phi (0 = level, 90 = straight down),
// lift in mm (0 = down, 300 = fully raised).
struct Joints {
  float t1 = 0, psi = 0, phi = 35, liftMm = 0;
};

// The pose the app understands (src/lib/types.ts): pan = compass bearing of the camera,
// lift = mm, swivel = camera angle below level. The app's aim maths only needs these three.
struct AppPose {
  float pan = 0, lift = 0, swivel = 0;
};

AppPose toAppPose(const Joints& j);

struct AimLimits {
  float psiMax;     // largest head swivel used for fine aim (deg)
  float psiCoarse;  // after a coarse turn, the target sits this far off the arm (deg)
  float phiMin, phiMax;
};

// Turn an app aim (bearing + angle below level) into joint targets. The lift is never
// changed while aiming (it is too slow, 5 s per 100 mm). If the bearing is more than
// psiMax off the arm, the turntable turns first so the target is psiCoarse off the arm
// (blueprint sheet 36: "coarse turn if needed, fine aim").
Joints planAim(const Joints& now, const AppPose& aim, const AimLimits& lim, bool* coarseTurn);

// True when the app's aim is within tol degrees of where the camera points now.
bool onTarget(const AppPose& now, const AppPose& aim, float tolDeg);

// ---------- patrol (blueprint sheet 20) ----------
constexpr int PATROL_STOPS = 12;
constexpr int FRAMES_PER_STOP = 4;
constexpr float PATROL_STEP_DEG = 30.0f;
struct Frame { float psi, phi; };
// Order (-30,35) -> (-30,75) -> (+30,75) -> (+30,35): one servo moves per frame.
extern const Frame PATROL_FRAMES[FRAMES_PER_STOP];
float stopAngle(int k);

// ---------- turntable stepper ----------
// Steps to go from 'from' to 'to' the short way round (sign = direction).
int32_t shortestSteps(int32_t fromSteps, float toDeg, int32_t stepsPerTurn);
// Time (us from the start of the move) at which step i (1..n) is pulsed, for a move that
// accelerates and brakes at accel steps/s^2 with top speed vmax steps/s (trapezoid profile).
// With no speed limit this is the blueprint's t = 2 sqrt(theta / alpha) (sheet 17).
uint32_t stepTimeUs(uint32_t i, uint32_t n, float accel, float vmax);
uint32_t moveTimeUs(uint32_t n, float accel, float vmax);

// ---------- lift (no position sensor: timed from an end stop, schematic O8) ----------
uint32_t liftTimeMs(float fromMm, float toMm, float mmPerS);

// ---------- spray timing (blueprint sheets 34, 36) ----------
// How long the valve may stay open: the pump (already running for pumpOnMs) must be off
// by pumpCapMs. Returns 0 when there is no time left.
uint32_t valveOpenMs(uint32_t requestedMs, uint32_t pumpOnMs, uint32_t pumpCapMs);

// ---------- reservoir (no level sensor: estimated from valve-open time) ----------
float reservoirAfter(float pct, uint32_t valveMs, float pctPerSecond);

// ---------- tiny JSON reader (enough for the app's replies) ----------
struct Json {
  enum Type { Null, Bool, Number, String, Array, Object } type = Null;
  bool b = false;
  double n = 0;
  std::string s;
  std::vector<Json> items;                  // Array
  std::vector<std::string> keys;            // Object keys, same order as items
  const Json* get(const char* key) const;   // Object member or nullptr
  double num(const char* key, double fallback) const;
  std::string str(const char* key, const char* fallback) const;
  bool boolean(const char* key, bool fallback) const;
};
bool parseJson(const std::string& text, Json& out);

// ---------- the app's device API (docs/DOCUMENTATION.md section 10.1) ----------
struct Settings {
  bool autoFire = true;
  float confidenceThreshold = 0.6f;
  uint32_t burstMs = 400;
  uint32_t cooldownS = 10;
  uint32_t reservoirLowPct = 20;
};

enum class CmdType { Fire, Stop, Move, Home, SetMode, Unknown };
struct Command {
  int32_t id = 0;
  CmdType type = CmdType::Unknown;
  uint32_t durationMs = 400;  // fire
  bool hasPose = false;       // move
  AppPose pose;
  uint32_t tag = 0;           // firmware use: the stop count when this command arrived
};

struct HeartbeatReply {
  bool paused = false;
  Settings settings;
  std::vector<Command> commands;
};

struct CaptureReply {
  int32_t captureId = -1;
  int detections = 0;
  bool fire = false;
  std::string holdReason;  // when !fire
  std::string pest;        // target class, if any
  AppPose aim;             // when fire
  uint32_t burstMs = 0;    // when fire
};

struct Status {  // extra fields for the app; it ignores them today
  float batteryV = 0, currentA = 0;
  bool estop = false;
  const char* state = "";
  const char* fault = "";
};

std::string heartbeatBody(const Joints& j, float reservoirPct, const char* firmware, const Status& st);
std::string fireBody(bool manual, uint32_t durationMs, const Joints& j, int32_t captureId);
std::string commandDoneBody(bool ok);
// The photo goes between multipartHead() and multipartTail().
std::string multipartHead(const char* boundary, const Joints& j, bool confirm);
std::string multipartTail(const char* boundary);

bool parseHeartbeatReply(const std::string& text, HeartbeatReply& out);
bool parseCaptureReply(const std::string& text, CaptureReply& out);

}  // namespace pb
