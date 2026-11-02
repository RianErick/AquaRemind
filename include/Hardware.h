#pragma once
#include <Adafruit_SSD1306.h>
#include <DallasTemperature.h>
#include <OneWire.h>
#include "AppState.h"
class Hardware {
 public:
  Hardware();
  void begin();
  float readDistanceCm(float fallback);
  float readTemperatureC(float fallback);
  void stopReminderOutputs();
  void updateVibrationAlert(bool enabled);
  void render(const Measurements &data, AppMode mode, uint32_t remainingMs, bool demo);
 private:
  float readDistanceOnceCm();
  Adafruit_SSD1306 display_;
  OneWire oneWire_;
  DallasTemperature temperatureSensor_;
};
