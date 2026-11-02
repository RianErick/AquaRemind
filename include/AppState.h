#pragma once
#include <Arduino.h>
enum class AppMode { MONITORING, REMINDER, DRINK, SNOOZE };
struct Measurements {
  float distanceCm=0.0f, volumeMl=0.0f, temperatureC=24.0f, consumedTodayMl=0.0f;
};
const char *appModeName(AppMode mode);
