#pragma once
#include <stdint.h>
typedef int BaseType_t;
typedef uint32_t TickType_t;
#define pdTRUE 1
#define portMAX_DELAY 0xFFFFFFFF
#define pdMS_TO_TICKS(ms) ((TickType_t)(ms))
typedef struct { int x; } portMUX_TYPE;
#define portMUX_INITIALIZER_UNLOCKED {0}
inline void portENTER_CRITICAL(portMUX_TYPE*) {}
inline void portEXIT_CRITICAL(portMUX_TYPE*) {}
inline void vTaskDelay(TickType_t) {}
typedef void (*TaskFunction_t)(void*);
inline BaseType_t xTaskCreatePinnedToCore(TaskFunction_t, const char*, uint32_t, void*, int, void*, int) { return pdTRUE; }
