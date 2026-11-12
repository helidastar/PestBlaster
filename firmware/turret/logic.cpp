// PestBlaster turret firmware - plain C++ logic (see logic.h).
#include "logic.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace pb {

// ---------- angles ----------
float norm360(float deg) {
  float d = fmodf(deg, 360.0f);
  if (d < 0) d += 360.0f;
  if (d >= 360.0f) d -= 360.0f;
  return d;
}

float wrap180(float deg) {
  float d = norm360(deg);
  return d > 180.0f ? d - 360.0f : d;
}

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

AppPose toAppPose(const Joints& j) {
  AppPose p;
  p.pan = norm360(j.t1 + j.psi);
  p.lift = j.liftMm;
  p.swivel = j.phi;
  return p;
}

Joints planAim(const Joints& now, const AppPose& aim, const AimLimits& lim, bool* coarseTurn) {
  Joints out = now;
  float psi = wrap180(aim.pan - now.t1);  // bearing of the target measured from the arm
  bool turn = fabsf(psi) > lim.psiMax;
  if (turn) {
    float side = psi > 0 ? 1.0f : -1.0f;
    out.t1 = norm360(aim.pan - side * lim.psiCoarse);
    psi = side * lim.psiCoarse;
  }
  out.psi = psi;
  out.phi = clampf(aim.swivel, lim.phiMin, lim.phiMax);
  if (coarseTurn) *coarseTurn = turn;
  return out;
}

bool onTarget(const AppPose& now, const AppPose& aim, float tolDeg) {
  return fabsf(wrap180(aim.pan - now.pan)) <= tolDeg && fabsf(aim.swivel - now.swivel) <= tolDeg;
}

// ---------- patrol ----------
const Frame PATROL_FRAMES[FRAMES_PER_STOP] = {{-30, 35}, {-30, 75}, {30, 75}, {30, 35}};

float stopAngle(int k) { return norm360(k * PATROL_STEP_DEG); }

// ---------- stepper ----------
int32_t shortestSteps(int32_t fromSteps, float toDeg, int32_t stepsPerTurn) {
  int32_t target = (int32_t)lroundf(norm360(toDeg) / 360.0f * stepsPerTurn) % stepsPerTurn;
  int32_t from = fromSteps % stepsPerTurn;
  if (from < 0) from += stepsPerTurn;
  int32_t d = target - from;
  if (d > stepsPerTurn / 2) d -= stepsPerTurn;
  if (d < -stepsPerTurn / 2) d += stepsPerTurn;
  return d;
}

static double accelSteps(float accel, float vmax) {  // steps used to reach vmax
  if (vmax <= 0) return 1e18;
  return (double)vmax * vmax / (2.0 * accel);
}

uint32_t moveTimeUs(uint32_t n, float accel, float vmax) {
  if (n == 0) return 0;
  double na = accelSteps(accel, vmax);
  double t;
  if (2 * na >= n) t = 2.0 * sqrt(n / (double)accel);
  else t = 2.0 * vmax / accel + (n - 2 * na) / vmax;
  return (uint32_t)llround(t * 1e6);
}

uint32_t stepTimeUs(uint32_t i, uint32_t n, float accel, float vmax) {
  if (n == 0 || i == 0) return 0;
  if (i > n) i = n;
  double na = accelSteps(accel, vmax);
  bool triangle = 2 * na >= n;
  double half = triangle ? n / 2.0 : na;
  double T = moveTimeUs(n, accel, vmax) / 1e6;
  double t;
  if (i <= half) {
    t = sqrt(2.0 * i / accel);
  } else if (i >= n - half) {
    t = T - sqrt(2.0 * (n - i) / accel);
  } else {
    t = vmax / accel + (i - na) / vmax;
  }
  return (uint32_t)llround(t * 1e6);
}

// ---------- lift ----------
uint32_t liftTimeMs(float fromMm, float toMm, float mmPerS) {
  return (uint32_t)lroundf(fabsf(toMm - fromMm) / mmPerS * 1000.0f);
}

// ---------- spray ----------
uint32_t valveOpenMs(uint32_t requestedMs, uint32_t pumpOnMs, uint32_t pumpCapMs) {
  if (pumpOnMs >= pumpCapMs) return 0;
  uint32_t left = pumpCapMs - pumpOnMs;
  return requestedMs < left ? requestedMs : left;
}

float reservoirAfter(float pct, uint32_t valveMs, float pctPerSecond) {
  return clampf(pct - valveMs / 1000.0f * pctPerSecond, 0.0f, 100.0f);
}

// ---------- JSON reader ----------
const Json* Json::get(const char* key) const {
  if (type != Object) return nullptr;
  for (size_t i = 0; i < keys.size(); i++)
    if (keys[i] == key) return &items[i];
  return nullptr;
}
double Json::num(const char* key, double fallback) const {
  const Json* v = get(key);
  return v && v->type == Number ? v->n : fallback;
}
std::string Json::str(const char* key, const char* fallback) const {
  const Json* v = get(key);
  return v && v->type == String ? v->s : std::string(fallback);
}
bool Json::boolean(const char* key, bool fallback) const {
  const Json* v = get(key);
  return v && v->type == Bool ? v->b : fallback;
}

namespace {
struct Reader {
  const char* p;
  const char* end;
  int depth = 0;
  void ws() { while (p < end && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t')) p++; }
  bool lit(const char* word) {
    size_t n = strlen(word);
    if ((size_t)(end - p) < n || strncmp(p, word, n) != 0) return false;
    p += n;
    return true;
  }
  static void putUtf8(std::string& s, unsigned cp) {
    if (cp < 0x80) s += (char)cp;
    else if (cp < 0x800) { s += (char)(0xC0 | (cp >> 6)); s += (char)(0x80 | (cp & 0x3F)); }
    else { s += (char)(0xE0 | (cp >> 12)); s += (char)(0x80 | ((cp >> 6) & 0x3F)); s += (char)(0x80 | (cp & 0x3F)); }
  }
  bool string(std::string& out) {
    if (p >= end || *p != '"') return false;
    p++;
    while (p < end && *p != '"') {
      char c = *p++;
      if (c != '\\') { out += c; continue; }
      if (p >= end) return false;
      char e = *p++;
      switch (e) {
        case '"': out += '"'; break;
        case '\\': out += '\\'; break;
        case '/': out += '/'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'n': out += '\n'; break;
        case 'r': out += '\r'; break;
        case 't': out += '\t'; break;
        case 'u': {
          if (end - p < 4) return false;
          char hex[5] = {p[0], p[1], p[2], p[3], 0};
          p += 4;
          putUtf8(out, (unsigned)strtoul(hex, nullptr, 16));  // surrogate pairs come out as two marks; fine for logs
          break;
        }
        default: return false;
      }
    }
    if (p >= end) return false;
    p++;
    return true;
  }
  bool value(Json& v) {
    if (++depth > 16) return false;
    ws();
    if (p >= end) return false;
    bool ok = true;
    if (*p == '{') {
      v.type = Json::Object;
      p++;
      ws();
      if (p < end && *p == '}') { p++; }
      else {
        for (;;) {
          ws();
          std::string key;
          if (!string(key)) { ok = false; break; }
          ws();
          if (p >= end || *p != ':') { ok = false; break; }
          p++;
          Json item;
          if (!value(item)) { ok = false; break; }
          v.keys.push_back(key);
          v.items.push_back(item);
          ws();
          if (p < end && *p == ',') { p++; continue; }
          if (p < end && *p == '}') { p++; break; }
          ok = false;
          break;
        }
      }
    } else if (*p == '[') {
      v.type = Json::Array;
      p++;
      ws();
      if (p < end && *p == ']') { p++; }
      else {
        for (;;) {
          Json item;
          if (!value(item)) { ok = false; break; }
          v.items.push_back(item);
          ws();
          if (p < end && *p == ',') { p++; continue; }
          if (p < end && *p == ']') { p++; break; }
          ok = false;
          break;
        }
      }
    } else if (*p == '"') {
      v.type = Json::String;
      ok = string(v.s);
    } else if (lit("true")) { v.type = Json::Bool; v.b = true; }
    else if (lit("false")) { v.type = Json::Bool; v.b = false; }
    else if (lit("null")) { v.type = Json::Null; }
    else {
      char* stop = nullptr;
      std::string num(p, (size_t)(end - p) < 32 ? (size_t)(end - p) : 32);
      double d = strtod(num.c_str(), &stop);
      if (stop == num.c_str()) ok = false;
      else { v.type = Json::Number; v.n = d; p += stop - num.c_str(); }
    }
    depth--;
    return ok;
  }
};
}  // namespace

bool parseJson(const std::string& text, Json& out) {
  out = Json();
  Reader r{text.data(), text.data() + text.size()};
  if (!r.value(out)) return false;
  r.ws();
  return r.p == r.end;
}

// ---------- device API bodies ----------
static std::string fmt(const char* f, double a) {
  char buf[32];
  snprintf(buf, sizeof buf, f, a);
  return buf;
}

static std::string poseJson(const Joints& j) {
  AppPose p = toAppPose(j);
  return "{\"pan\":" + fmt("%.1f", p.pan) + ",\"lift\":" + fmt("%.1f", p.lift) + ",\"swivel\":" + fmt("%.1f", p.swivel) +
         "}";
}

static std::string jointsJson(const Joints& j) {
  return "{\"t1\":" + fmt("%.1f", norm360(j.t1)) + ",\"psi\":" + fmt("%.1f", j.psi) + ",\"phi\":" + fmt("%.1f", j.phi) +
         ",\"lift\":" + fmt("%.1f", j.liftMm) + "}";
}

static std::string quoted(const char* s) {
  std::string out = "\"";
  for (const char* c = s; *c; c++) {
    if (*c == '"' || *c == '\\') out += '\\';
    if ((unsigned char)*c >= 0x20) out += *c;
  }
  return out + "\"";
}

std::string heartbeatBody(const Joints& j, float reservoirPct, const char* firmware, const Status& st) {
  return "{\"pose\":" + poseJson(j) + ",\"reservoirPct\":" + fmt("%.1f", clampf(reservoirPct, 0, 100)) +
         ",\"firmware\":" + quoted(firmware) + ",\"joints\":" + jointsJson(j) + ",\"status\":{\"batteryV\":" +
         fmt("%.2f", st.batteryV) + ",\"currentA\":" + fmt("%.2f", st.currentA) +
         ",\"estop\":" + (st.estop ? "true" : "false") + ",\"state\":" + quoted(st.state) +
         ",\"fault\":" + quoted(st.fault) + "}}";
}

std::string fireBody(bool manual, uint32_t durationMs, const Joints& j, int32_t captureId) {
  return std::string("{\"source\":") + (manual ? "\"manual\"" : "\"auto\"") + ",\"durationMs\":" +
         std::to_string(durationMs) + ",\"pose\":" + poseJson(j) +
         ",\"captureId\":" + (captureId < 0 ? std::string("null") : std::to_string(captureId)) + "}";
}

std::string commandDoneBody(bool ok) { return ok ? "{\"ok\":true}" : "{\"ok\":false}"; }

std::string multipartHead(const char* boundary, const Joints& j, bool confirm) {
  std::string b = std::string("--") + boundary + "\r\n";
  std::string out;
  out += b + "Content-Disposition: form-data; name=\"pose\"\r\n\r\n" + poseJson(j) + "\r\n";
  out += b + "Content-Disposition: form-data; name=\"joints\"\r\n\r\n" + jointsJson(j) + "\r\n";
  if (confirm) out += b + "Content-Disposition: form-data; name=\"confirm\"\r\n\r\n1\r\n";
  out += b + "Content-Disposition: form-data; name=\"image\"; filename=\"frame.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
  return out;
}

std::string multipartTail(const char* boundary) { return std::string("\r\n--") + boundary + "--\r\n"; }

// ---------- device API replies ----------
static bool readPose(const Json* v, AppPose& p) {
  if (!v || v->type != Json::Object) return false;
  const Json* pan = v->get("pan");
  const Json* lift = v->get("lift");
  const Json* sw = v->get("swivel");
  if (!pan || !lift || !sw || pan->type != Json::Number || lift->type != Json::Number || sw->type != Json::Number)
    return false;
  p.pan = (float)pan->n;
  p.lift = (float)lift->n;
  p.swivel = (float)sw->n;
  return true;
}

static CmdType cmdType(const std::string& t) {
  if (t == "fire") return CmdType::Fire;
  if (t == "stop") return CmdType::Stop;
  if (t == "move") return CmdType::Move;
  if (t == "home") return CmdType::Home;
  if (t == "set_mode") return CmdType::SetMode;
  return CmdType::Unknown;
}

bool parseHeartbeatReply(const std::string& text, HeartbeatReply& out) {
  out = HeartbeatReply();
  Json root;
  if (!parseJson(text, root) || root.type != Json::Object) return false;
  out.paused = root.str("mode", "auto") == "paused";
  if (const Json* s = root.get("settings")) {
    out.settings.autoFire = s->boolean("autoFire", true);
    out.settings.confidenceThreshold = (float)s->num("confidenceThreshold", 0.6);
    out.settings.burstMs = (uint32_t)s->num("burstMs", 400);
    out.settings.cooldownS = (uint32_t)s->num("cooldownS", 10);
    out.settings.reservoirLowPct = (uint32_t)s->num("reservoirLowPct", 20);
  }
  const Json* cmds = root.get("commands");
  if (cmds && cmds->type == Json::Array) {
    for (const Json& c : cmds->items) {
      Command cmd;
      cmd.id = (int32_t)c.num("id", 0);
      cmd.type = cmdType(c.str("type", ""));
      if (const Json* pl = c.get("payload")) {
        cmd.durationMs = (uint32_t)pl->num("durationMs", 400);
        cmd.hasPose = readPose(pl->get("pose"), cmd.pose);
      }
      if (cmd.id > 0) out.commands.push_back(cmd);
    }
  }
  return true;
}

bool parseCaptureReply(const std::string& text, CaptureReply& out) {
  out = CaptureReply();
  Json root;
  if (!parseJson(text, root) || root.type != Json::Object) return false;
  out.captureId = (int32_t)root.num("captureId", -1);
  if (const Json* d = root.get("detections")) out.detections = d->type == Json::Array ? (int)d->items.size() : 0;
  const Json* dec = root.get("decision");
  if (!dec || dec->type != Json::Object) return false;
  if (const Json* t = dec->get("target")) out.pest = t->str("pest", "");
  std::string action = dec->str("action", "");
  if (action == "fire") {
    if (!readPose(dec->get("aim"), out.aim)) return false;
    out.fire = true;
    out.burstMs = (uint32_t)dec->num("burstMs", 400);
  } else if (action == "hold") {
    out.holdReason = dec->str("reason", "");
  } else {
    return false;
  }
  return true;
}

}  // namespace pb
