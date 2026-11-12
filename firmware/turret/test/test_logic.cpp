// Laptop tests for the firmware logic (no ESP32 needed). Run: bash firmware/turret/test/run.sh
//   test_logic             unit tests
//   test_logic emit DIR    write the request bodies the firmware sends into DIR
//   test_logic parse FILE heartbeat|capture   read a reply from the app the way the firmware does
#include <math.h>
#include <stdio.h>
#include <string.h>

#include <fstream>
#include <sstream>
#include <string>

#include "../logic.h"

using namespace pb;

static int failures = 0, checks = 0;
#define CHECK(cond)                                                    \
  do {                                                                 \
    checks++;                                                          \
    if (!(cond)) {                                                     \
      failures++;                                                      \
      printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);           \
    }                                                                  \
  } while (0)
#define NEAR(a, b, tol) CHECK(fabs((double)(a) - (double)(b)) <= (tol))

static const AimLimits AIM{80, 30, 0, 90};

static void testAngles() {
  NEAR(norm360(-30), 330, 1e-4);
  NEAR(norm360(720), 0, 1e-4);
  NEAR(wrap180(190), -170, 1e-4);
  NEAR(wrap180(-190), 170, 1e-4);
  NEAR(wrap180(180), 180, 1e-4);

  Joints j;
  j.t1 = 350; j.psi = 30; j.phi = 75; j.liftMm = 0;
  AppPose p = toAppPose(j);
  NEAR(p.pan, 20, 1e-4);   // bearing wraps past 360
  NEAR(p.swivel, 75, 1e-4);  // app swivel = angle below level = tilt
}

static void testAim() {
  Joints now;
  now.t1 = 90; now.psi = -30; now.phi = 35;
  bool coarse = true;
  // Small correction: servos only.
  AppPose aim{65, 0, 40};
  Joints j = planAim(now, aim, AIM, &coarse);
  CHECK(!coarse);
  NEAR(j.t1, 90, 1e-4);
  NEAR(j.psi, -25, 1e-4);
  NEAR(j.phi, 40, 1e-4);
  NEAR(toAppPose(j).pan, 65, 1e-4);

  // Target behind the arm: turntable turns so the target sits 30 deg off the arm.
  aim = {250, 0, 60};
  j = planAim(now, aim, AIM, &coarse);
  CHECK(coarse);
  NEAR(toAppPose(j).pan, 250, 1e-3);
  NEAR(fabs(j.psi), 30, 1e-4);

  // Across 0/360.
  now.t1 = 350; now.psi = 0;
  aim = {10, 0, 50};
  j = planAim(now, aim, AIM, &coarse);
  CHECK(!coarse);
  NEAR(j.psi, 20, 1e-3);

  // Tilt clamps to the head's range (the app allows up to 170).
  aim = {350, 0, 130};
  j = planAim(now, aim, AIM, &coarse);
  NEAR(j.phi, 90, 1e-4);
  // ...so a clamped aim is never "on target" and the firmware will not spray at it.
  CHECK(!onTarget(toAppPose(j), aim, 3));

  CHECK(onTarget({359, 0, 40}, {1, 0, 42}, 3));
  CHECK(!onTarget({359, 0, 40}, {3, 0, 40}, 3));
}

static void testPatrol() {
  NEAR(stopAngle(0), 0, 1e-4);
  NEAR(stopAngle(11), 330, 1e-4);
  // Each frame needs one servo move only (sheet 20).
  for (int f = 1; f < FRAMES_PER_STOP; f++) {
    int moved = (PATROL_FRAMES[f].psi != PATROL_FRAMES[f - 1].psi) + (PATROL_FRAMES[f].phi != PATROL_FRAMES[f - 1].phi);
    CHECK(moved == 1);
  }
}

static void testStepper() {
  const int32_t turn = 16000;
  CHECK(shortestSteps(0, 30, turn) == 1333);
  CHECK(shortestSteps(0, 330, turn) == -1333);
  CHECK(shortestSteps(15000, 0, turn) == 1000);
  CHECK(shortestSteps(-1000, 0, turn) == 1000);
  CHECK(shortestSteps(8000, 0, turn) == -8000 || shortestSteps(8000, 0, turn) == 8000);

  // Blueprint sheet 17/20: a 30 deg turn at alpha 0.85 rad/s^2 takes 2 sqrt(0.524 / 0.85) = 1.570 s.
  float stepsPerRad = turn / (2 * M_PI);
  float accel = 0.85f * stepsPerRad, vmax = 1.6f * stepsPerRad;
  uint32_t n = 1333;
  NEAR(moveTimeUs(n, accel, vmax) / 1e6, 1.570, 0.005);
  NEAR(stepTimeUs(n, n, accel, vmax) / 1e6, 1.570, 0.005);
  // Times always increase and the move is symmetric.
  bool rising = true;
  for (uint32_t i = 2; i <= n; i++) rising &= stepTimeUs(i, n, accel, vmax) >= stepTimeUs(i - 1, n, accel, vmax);
  CHECK(rising);
  NEAR(stepTimeUs(n / 2, n, accel, vmax) / 1e6, 1.570 / 2, 0.01);
  // A 180 deg turn hits the 1.6 rad/s limit: trapezoid, still smooth.
  n = 8000;
  rising = true;
  uint32_t minGap = 0xFFFFFFFF, prev = 0;
  for (uint32_t i = 1; i <= n; i++) {
    uint32_t t = stepTimeUs(i, n, accel, vmax);
    rising &= t >= prev;
    if (i > 1 && t - prev < minGap) minGap = t - prev;
    prev = t;
  }
  CHECK(rising);
  NEAR(1e6 / minGap, vmax, vmax * 0.02);  // top speed = vmax, never more
  // 2 x 1.6/0.85 + (pi - 1.6^2/0.85)/1.6 = 3.765 + 0.081 = 3.846 s
  NEAR(moveTimeUs(n, accel, vmax) / 1e6, 3.846, 0.01);
}

static void testLiftAndSpray() {
  NEAR(liftTimeMs(0, 100, 19.6f), 5102, 1);  // about 5.1 s per 100 mm (sheet 17)
  NEAR(liftTimeMs(300, 0, 19.6f), 15306, 1);
  CHECK(valveOpenMs(400, 300, 3000) == 400);
  CHECK(valveOpenMs(3000, 300, 3000) == 2700);  // hold-to-spray: the pump still stops at 3 s
  CHECK(valveOpenMs(400, 2800, 3000) == 200);
  CHECK(valveOpenMs(400, 3000, 3000) == 0);
  NEAR(reservoirAfter(50, 1000, 1.3f), 48.7, 1e-4);
  NEAR(reservoirAfter(1, 5000, 1.3f), 0, 1e-4);
}

static void testJson() {
  Json j;
  CHECK(parseJson("{\"a\":[1,2.5,-3e2],\"b\":{\"c\":\"x\\\"y\\u00e9\"},\"t\":true,\"n\":null}", j));
  CHECK(j.get("a")->items.size() == 3);
  NEAR(j.get("a")->items[2].n, -300, 1e-9);
  CHECK(j.get("b")->str("c", "") == "x\"y\xc3\xa9");
  CHECK(j.boolean("t", false));
  CHECK(j.get("n")->type == Json::Null);
  CHECK(!parseJson("{\"a\":1,}", j));
  CHECK(!parseJson("{\"a\":1} x", j));
  CHECK(!parseJson("", j));
  CHECK(!parseJson("[[[[[[[[[[[[[[[[[[1]]]]]]]]]]]]]]]]]]", j));  // too deep
}

static void testReplies() {
  HeartbeatReply hb;
  CHECK(parseHeartbeatReply(
      "{\"mode\":\"paused\",\"settings\":{\"autoFire\":false,\"confidenceThreshold\":0.7,\"burstMs\":500,"
      "\"cooldownS\":10,\"reservoirLowPct\":20},\"commands\":[{\"id\":4,\"deviceId\":\"turret-1\",\"createdAt\":\"x\","
      "\"type\":\"fire\",\"payload\":{\"durationMs\":3000},\"status\":\"sent\",\"doneAt\":null},{\"id\":5,\"type\":"
      "\"move\",\"payload\":{\"pose\":{\"pan\":90,\"lift\":100,\"swivel\":45}}},{\"id\":6,\"type\":\"stop\","
      "\"payload\":{}}]}",
      hb));
  CHECK(hb.paused);
  CHECK(!hb.settings.autoFire);
  CHECK(hb.settings.burstMs == 500);
  CHECK(hb.commands.size() == 3);
  CHECK(hb.commands[0].type == CmdType::Fire && hb.commands[0].durationMs == 3000);
  CHECK(hb.commands[1].type == CmdType::Move && hb.commands[1].hasPose);
  NEAR(hb.commands[1].pose.lift, 100, 1e-4);
  CHECK(hb.commands[2].type == CmdType::Stop);

  CaptureReply c;
  CHECK(parseCaptureReply(
      "{\"captureId\":12,\"detections\":[{\"pest\":\"looper\",\"confidence\":0.8,\"bbox\":{\"x\":0.4,\"y\":0.4,\"w\":0.1,"
      "\"h\":0.1}}],\"decision\":{\"action\":\"fire\",\"target\":{\"pest\":\"looper\"},\"aim\":{\"pan\":31.5,\"lift\":0,"
      "\"swivel\":36},\"burstMs\":400}}",
      c));
  CHECK(c.fire && c.captureId == 12 && c.detections == 1 && c.burstMs == 400 && c.pest == "looper");
  NEAR(c.aim.pan, 31.5, 1e-4);
  CHECK(parseCaptureReply("{\"captureId\":13,\"detections\":[],\"decision\":{\"action\":\"hold\",\"reason\":\"no_pest\","
                          "\"target\":null}}",
                          c));
  CHECK(!c.fire && c.holdReason == "no_pest");
  CHECK(!parseCaptureReply("{\"error\":\"Missing or wrong x-device-key header.\"}", c));
}

static void testBodies() {
  Joints j;
  j.t1 = 330; j.psi = 30; j.phi = 75; j.liftMm = 0;
  Status st;
  st.batteryV = 12.6f; st.state = "patrol"; st.fault = "";
  Json parsed;
  CHECK(parseJson(heartbeatBody(j, 87.25f, "turret-0.1", st), parsed));
  NEAR(parsed.get("pose")->num("pan", -1), 0, 1e-4);
  NEAR(parsed.num("reservoirPct", -1), 87.25, 0.06);
  CHECK(parsed.str("firmware", "") == "turret-0.1");
  CHECK(parseJson(fireBody(true, 2700, j, -1), parsed));
  CHECK(parsed.str("source", "") == "manual" && parsed.get("captureId")->type == Json::Null);
  CHECK(parseJson(fireBody(false, 400, j, 9), parsed));
  NEAR(parsed.num("captureId", -1), 9, 0);
  std::string head = multipartHead("BND", j, true);
  CHECK(head.find("name=\"pose\"\r\n\r\n{\"pan\":0.0,\"lift\":0.0,\"swivel\":75.0}\r\n") != std::string::npos);
  CHECK(head.substr(head.size() - 4) == "\r\n\r\n");
  CHECK(multipartTail("BND") == "\r\n--BND--\r\n");
}

static std::string readFile(const char* path) {
  std::ifstream f(path, std::ios::binary);
  std::stringstream ss;
  ss << f.rdbuf();
  return ss.str();
}

static void write(const std::string& path, const std::string& data) {
  std::ofstream f(path, std::ios::binary);
  f << data;
}

int main(int argc, char** argv) {
  if (argc >= 3 && !strcmp(argv[1], "emit")) {
    // The same bytes the firmware sends; run.sh posts them to a running app.
    std::string dir = argv[2];
    Joints j;
    j.t1 = 30; j.psi = -30; j.phi = 35; j.liftMm = 0;
    Status st;
    st.batteryV = 12.7f; st.currentA = 0.6f; st.state = "patrol";
    write(dir + "/heartbeat.json", heartbeatBody(j, 92.5f, "turret-0.1", st));
    write(dir + "/fire.json", fireBody(false, 400, j, -1));
    write(dir + "/done.json", commandDoneBody(true));
    std::string jpeg = readFile(argv[3]);
    write(dir + "/capture.body", multipartHead("----pestblaster-frame-7d3f", j, false) + jpeg +
                                     multipartTail("----pestblaster-frame-7d3f"));
    return 0;
  }
  if (argc >= 4 && !strcmp(argv[1], "parse")) {
    std::string text = readFile(argv[2]);
    if (!strcmp(argv[3], "heartbeat")) {
      HeartbeatReply hb;
      if (!parseHeartbeatReply(text, hb)) { printf("could not read heartbeat reply\n"); return 1; }
      printf("mode %s, burst %u ms, %zu commands", hb.paused ? "paused" : "auto", (unsigned)hb.settings.burstMs,
             hb.commands.size());
      for (auto& c : hb.commands) printf(" [#%d type %d %ums]", (int)c.id, (int)c.type, (unsigned)c.durationMs);
      printf("\n");
    } else {
      CaptureReply c;
      if (!parseCaptureReply(text, c)) { printf("could not read capture reply\n"); return 1; }
      printf("capture %d, %d detections, %s", (int)c.captureId, c.detections, c.fire ? "fire" : "hold");
      if (c.fire) printf(" -> aim pan %.1f lift %.1f swivel %.1f, burst %u ms", c.aim.pan, c.aim.lift, c.aim.swivel,
                         (unsigned)c.burstMs);
      else printf(" (%s)", c.holdReason.c_str());
      printf("\n");
    }
    return 0;
  }
  testAngles();
  testAim();
  testPatrol();
  testStepper();
  testLiftAndSpray();
  testJson();
  testReplies();
  testBodies();
  printf("%d checks, %d failed\n", checks, failures);
  return failures ? 1 : 0;
}
