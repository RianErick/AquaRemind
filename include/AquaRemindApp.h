#pragma once
#include "AppState.h"
#include "Hardware.h"
class AquaRemindApp {
 public:
  void setup();
  void loop();
 private:
  void notify(const String &message);
  void handleMainButton(uint32_t now);
  void handleSimulationControls(uint32_t now);
  void processMeasurements();
  void updateStateMachine(uint32_t now);
  void registerDrink(float amountMl, bool measured);
  void selectReminderInterval(uint32_t now);
  void printStatus();
  bool pressedNow(uint8_t pin, bool &lastValue);
  float distanceToVolumeMl(float distanceCm) const;
  uint32_t reminderIntervalMs() const;
  uint32_t reminderRemainingMs(uint32_t now) const;

  Hardware hardware_;
  Measurements measurements_;
  AppMode mode_=AppMode::MONITORING;
  float previousVolumeMl_=-1.0f, simulationVolumeMl_=0.0f;
  bool simulationVolumeEnabled_=false, hotWarningSent_=false, reminderOutputsEnabled_=false;
  uint8_t configuredIntervalMinutes_=30;
  bool lastSimDrink_=HIGH, lastSimRefill_=HIGH, rawButton_=HIGH, stableButton_=HIGH;
  uint32_t lastDrinkMs_=0, snoozeUntilMs_=0, lastSampleMs_=0, lastDisplayMs_=0;
  uint32_t lastSerialMs_=0, lastIntervalReadMs_=0, lastButtonChangeMs_=0, buttonPressedAtMs_=0;
};
