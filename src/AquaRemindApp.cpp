#include "AquaRemindApp.h"
#include "Config.h"

void AquaRemindApp::setup() {
  Serial.begin(115200); hardware_.begin(); lastDrinkMs_=millis();
  notify(DEMO_MODE ? "Sistema iniciado em modo demonstracao." : "Sistema iniciado em modo real.");
}
void AquaRemindApp::loop() {
  const uint32_t now=millis(); handleMainButton(now); handleSimulationControls(now);
  if (now-lastSampleMs_>=Config::Timing::SAMPLE_MS) { lastSampleMs_=now; processMeasurements(); }
  updateStateMachine(now); hardware_.updateVibrationAlert(reminderOutputsEnabled_);
  if (now-lastDisplayMs_>=Config::Timing::DISPLAY_MS) {
    lastDisplayMs_=now; hardware_.render(measurements_,mode_,reminderRemainingMs(now),DEMO_MODE);
  }
  if (now-lastSerialMs_>=Config::Timing::SERIAL_MS) { lastSerialMs_=now; printStatus(); }
}
void AquaRemindApp::notify(const String &message) {
  Serial.print("[NOTIFICACAO] "); Serial.println(message);
}
uint32_t AquaRemindApp::reminderIntervalMs() const {
  return static_cast<uint32_t>(configuredIntervalMinutes_)*(DEMO_MODE ? 1000UL : 60UL*1000UL);
}
uint32_t AquaRemindApp::reminderRemainingMs(uint32_t now) const {
  const uint32_t elapsed=now-lastDrinkMs_; return elapsed<reminderIntervalMs() ? reminderIntervalMs()-elapsed : 0;
}
float AquaRemindApp::distanceToVolumeMl(float distance) const {
  const float height=constrain(Config::Bottle::USEFUL_HEIGHT_CM-distance,0.0f,Config::Bottle::USEFUL_HEIGHT_CM);
  return PI*Config::Bottle::RADIUS_CM*Config::Bottle::RADIUS_CM*height;
}
void AquaRemindApp::registerDrink(float amount,bool measured) {
  lastDrinkMs_=millis(); mode_=AppMode::DRINK; reminderOutputsEnabled_=false; hardware_.stopReminderOutputs();
  if (measured) measurements_.consumedTodayMl=min(Config::Bottle::DAILY_GOAL_ML,measurements_.consumedTodayMl+amount);
  notify(measured ? "Gole detectado; temporizador reiniciado." : "Consumo confirmado pelo botao; temporizador reiniciado.");
}
void AquaRemindApp::handleMainButton(uint32_t now) {
  const bool reading=digitalRead(Config::Pins::BUTTON);
  if (reading!=rawButton_) { rawButton_=reading; lastButtonChangeMs_=now; }
  if (now-lastButtonChangeMs_<Config::Timing::DEBOUNCE_MS || reading==stableButton_) return;
  stableButton_=reading;
  if (stableButton_==LOW) { buttonPressedAtMs_=now; return; }
  if (now-buttonPressedAtMs_>=Config::Timing::LONG_PRESS_MS) registerDrink(0.0f,false);
  else if (mode_==AppMode::REMINDER) {
    mode_=AppMode::SNOOZE; snoozeUntilMs_=now+Config::Timing::SNOOZE_MS;
    reminderOutputsEnabled_=false; hardware_.stopReminderOutputs(); notify("Soneca ativada.");
  }
}
bool AquaRemindApp::pressedNow(uint8_t pin,bool &last) {
  const bool value=digitalRead(pin); const bool pressed=last==HIGH&&value==LOW; last=value; return pressed;
}
void AquaRemindApp::handleSimulationControls(uint32_t now) {
  if (pressedNow(Config::Pins::SIMULATE_DRINK,lastSimDrink_)) {
    if (!simulationVolumeEnabled_) { simulationVolumeEnabled_=true; simulationVolumeMl_=measurements_.volumeMl; }
    const float amount=min(200.0f,simulationVolumeMl_); simulationVolumeMl_-=amount;
    measurements_.volumeMl=simulationVolumeMl_; previousVolumeMl_=measurements_.volumeMl; registerDrink(amount,true);
    Serial.printf("[SIMULACAO] Nivel reduziu 200 ml; restam %.0f ml.\n",measurements_.volumeMl);
  }
  if (pressedNow(Config::Pins::SIMULATE_REFILL,lastSimRefill_)) {
    if (!simulationVolumeEnabled_) { simulationVolumeEnabled_=true; simulationVolumeMl_=measurements_.volumeMl; }
    const float capacity=PI*Config::Bottle::RADIUS_CM*Config::Bottle::RADIUS_CM*Config::Bottle::USEFUL_HEIGHT_CM;
    simulationVolumeMl_=min(capacity,simulationVolumeMl_+200.0f); measurements_.volumeMl=simulationVolumeMl_;
    previousVolumeMl_=measurements_.volumeMl; notify("Reabastecimento de 200 ml simulado.");
  }
  if (now-lastIntervalReadMs_>=250) { lastIntervalReadMs_=now; selectReminderInterval(now); }
}
void AquaRemindApp::selectReminderInterval(uint32_t now) {
  const int slider=analogRead(Config::Pins::SIMULATE_INTERVAL);
  const uint8_t selected=slider<1365 ? 30 : slider<2730 ? 40 : 60;
  if (selected==configuredIntervalMinutes_) return;
  configuredIntervalMinutes_=selected; lastDrinkMs_=now; mode_=AppMode::MONITORING;
  reminderOutputsEnabled_=false; hardware_.stopReminderOutputs();
  Serial.printf("[CONFIGURACAO] Novo intervalo: %u minutos.\n",configuredIntervalMinutes_);
}
void AquaRemindApp::processMeasurements() {
  measurements_.distanceCm=hardware_.readDistanceCm(measurements_.distanceCm);
  const float sensorVolume=distanceToVolumeMl(measurements_.distanceCm);
  measurements_.volumeMl=simulationVolumeEnabled_ ? simulationVolumeMl_ : sensorVolume;
  measurements_.temperatureC=hardware_.readTemperatureC(measurements_.temperatureC);
  if (!simulationVolumeEnabled_&&previousVolumeMl_>=0.0f) {
    const float delta=measurements_.volumeMl-previousVolumeMl_;
    if (delta<=-Config::Bottle::DRINK_THRESHOLD_ML) registerDrink(-delta,true);
    else if (delta>=Config::Bottle::REFILL_THRESHOLD_ML) notify("Reabastecimento detectado.");
  }
  previousVolumeMl_=measurements_.volumeMl;
  if (measurements_.temperatureC>Config::Bottle::HOT_WARNING_C&&!hotWarningSent_) {
    notify("Cuidado: liquido acima de 50 C."); hotWarningSent_=true;
  } else if (measurements_.temperatureC<Config::Bottle::HOT_WARNING_C-2.0f) hotWarningSent_=false;
}
void AquaRemindApp::updateStateMachine(uint32_t now) {
  if (mode_==AppMode::DRINK&&now-lastDrinkMs_>Config::Timing::DRINK_FEEDBACK_MS) mode_=AppMode::MONITORING;
  if (mode_==AppMode::SNOOZE) {
    if (static_cast<int32_t>(now-snoozeUntilMs_)>=0) {
      mode_=AppMode::REMINDER; reminderOutputsEnabled_=true; notify("Soneca encerrada: hora de beber agua.");
    }
    return;
  }
  if (mode_!=AppMode::REMINDER&&now-lastDrinkMs_>=reminderIntervalMs()) {
    mode_=AppMode::REMINDER; reminderOutputsEnabled_=true; notify("Hora de beber agua.");
  }
}
void AquaRemindApp::printStatus() {
  Serial.printf("estado=%s distancia=%.1fcm volume=%.0fml temp=%.1fC meta=%.0fml\n",
    appModeName(mode_),measurements_.distanceCm,measurements_.volumeMl,
    measurements_.temperatureC,measurements_.consumedTodayMl);
}
