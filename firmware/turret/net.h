// PestBlaster turret firmware - Wi-Fi to the Pi 5 hotspot and the app's device API
// (docs/DOCUMENTATION.md section 10.1). Each call is safe to use from its own task.
#pragma once
#include <stdint.h>
#include <string>

namespace net {

void begin();          // join the hotspot (keeps retrying by itself)
bool wifiUp();
void keepWifiAlive();  // call every few seconds; reconnects if the hotspot dropped

// The time of the last good reply from the app, and whether the last call failed.
uint32_t lastOkMs();
bool lastFailed();

bool postJson(const char* path, const std::string& body, std::string& reply);
bool postCapture(const uint8_t* jpeg, size_t len, const std::string& head, const std::string& tail,
                 const char* boundary, std::string& reply);

}  // namespace net
