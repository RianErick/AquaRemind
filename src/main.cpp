#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <algorithm>

#ifndef DEMO_MODE
#define DEMO_MODE 1
#endif

// Pinagem definida nos documentos do AquaRemind.
constexpr uint8_t PIN_TRIG = 5;
constexpr uint8_t PIN_ECHO = 18;
constexpr uint8_t PIN_TEMP = 4;
constexpr uint8_t PIN_LED = 26;
constexpr uint8_t PIN_BUZZER = 27;
constexpr uint8_t PIN_BUTTON = 14;
constexpr uint8_t PIN_SIM_DRINK = 32;
constexpr uint8_t PIN_SIM_REFILL = 33;
constexpr uint8_t PIN_SIM_INTERVAL = 34;

constexpr float BOTTLE_RADIUS_CM = 4.0f;
constexpr float BOTTLE_USEFUL_HEIGHT_CM = 20.0f;
constexpr float DRINK_THRESHOLD_ML = 30.0f;
constexpr float REFILL_THRESHOLD_ML = 30.0f;
constexpr float DAILY_GOAL_ML = 2000.0f;
constexpr float HOT_WARNING_C = 50.0f;

constexpr uint32_t SAMPLE_INTERVAL_MS = 500;
constexpr uint32_t DISPLAY_INTERVAL_MS = 500;
constexpr uint32_t SERIAL_INTERVAL_MS = 2000;
constexpr uint32_t LONG_PRESS_MS = 1200;
constexpr uint32_t DEBOUNCE_MS = 35;

#if DEMO_MODE
constexpr uint32_t SNOOZE_INTERVAL_MS = 15UL * 1000UL;
#else
constexpr uint32_t SNOOZE_INTERVAL_MS = 15UL * 60UL * 1000UL;
#endif

enum class State { MONITORING, REMINDER, DRINK, SNOOZE };

Adafruit_SSD1306 display(128, 64, &Wire, -1);
OneWire oneWire(PIN_TEMP);
DallasTemperature temperatureSensor(&oneWire);

State state = State::MONITORING;
float distanceCm = 0.0f;
float volumeMl = 0.0f;
float previousVolumeMl = -1.0f;
float consumedTodayMl = 0.0f;
float temperatureC = 24.0f;
uint32_t lastDrinkMs = 0;
uint32_t snoozeUntilMs = 0;
uint32_t lastSampleMs = 0;
uint32_t lastDisplayMs = 0;
uint32_t lastSerialMs = 0;
bool hotWarningSent = false;
bool reminderOutputsEnabled = false;
uint16_t currentBuzzerFrequency = 0;
uint8_t configuredIntervalMinutes = 30;
bool simulationVolumeEnabled = false;
float simulationVolumeMl = 0.0f;
bool lastSimDrink = HIGH;
bool lastSimRefill = HIGH;
uint32_t lastIntervalReadMs = 0;

bool rawButton = HIGH;
bool stableButton = HIGH;
uint32_t lastButtonChangeMs = 0;
uint32_t buttonPressedAtMs = 0;

const char *stateName(State value) {
  switch (value) {
    case State::MONITORING: return "MONITORANDO";
    case State::REMINDER: return "LEMBRETE";
    case State::DRINK: return "GOLE";
    case State::SNOOZE: return "SONECA";
  }
  return "?";
}

uint32_t reminderIntervalMs() {
#if DEMO_MODE
  return static_cast<uint32_t>(configuredIntervalMinutes) * 1000UL;
#else
  return static_cast<uint32_t>(configuredIntervalMinutes) * 60UL * 1000UL;
#endif
}

void notify(const String &message) {
  // Ponto único de integração IoT. Na entrega Wokwi, a Serial representa o Telegram.
  Serial.print("[NOTIFICACAO] ");
  Serial.println(message);
}

float readDistanceOnceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  const uint32_t duration = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duration == 0) return NAN;
  return duration / 58.0f;
}

float readMedianDistanceCm() {
  float samples[5];
  uint8_t valid = 0;
  for (uint8_t i = 0; i < 5; ++i) {
    const float reading = readDistanceOnceCm();
    if (!isnan(reading)) samples[valid++] = reading;
    delay(3);
  }
  if (valid == 0) return distanceCm;
  std::sort(samples, samples + valid);
  return samples[valid / 2];
}

float distanceToVolumeMl(float distance) {
  const float waterHeight = constrain(BOTTLE_USEFUL_HEIGHT_CM - distance, 0.0f,
                                      BOTTLE_USEFUL_HEIGHT_CM);
  return PI * BOTTLE_RADIUS_CM * BOTTLE_RADIUS_CM * waterHeight;
}

void setBuzzerFrequency(uint16_t frequency) {
  if (frequency == currentBuzzerFrequency) return;
  currentBuzzerFrequency = frequency;
  if (frequency == 0) noTone(PIN_BUZZER);
  else tone(PIN_BUZZER, frequency);
}

void setReminderOutputs(bool enabled) {
  reminderOutputsEnabled = enabled;
  if (!enabled) {
    digitalWrite(PIN_LED, LOW);
    setBuzzerFrequency(0);
  }
}

void updateReminderSound() {
  if (!reminderOutputsEnabled) return;

  // Três notas crescentes e uma pausa: perceptível sem produzir som contínuo.
  const uint32_t phase = millis() % 2000;
  uint16_t frequency = 0;
  if (phase < 180) frequency = 1760;
  else if (phase >= 300 && phase < 500) frequency = 2217;
  else if (phase >= 620 && phase < 880) frequency = 2637;

  setBuzzerFrequency(frequency);
  digitalWrite(PIN_LED, frequency > 0 ? HIGH : LOW);
}

void registerDrink(float amountMl, bool measured) {
  lastDrinkMs = millis();
  state = State::DRINK;
  setReminderOutputs(false);
  if (measured) consumedTodayMl = min(DAILY_GOAL_ML, consumedTodayMl + amountMl);
  notify(measured ? "Gole detectado; temporizador reiniciado."
                  : "Consumo confirmado pelo botao; temporizador reiniciado.");
}

void handleButton() {
  const bool reading = digitalRead(PIN_BUTTON);
  const uint32_t now = millis();
  if (reading != rawButton) {
    rawButton = reading;
    lastButtonChangeMs = now;
  }
  if (now - lastButtonChangeMs < DEBOUNCE_MS || reading == stableButton) return;

  stableButton = reading;
  if (stableButton == LOW) {
    buttonPressedAtMs = now;
    return;
  }

  const uint32_t pressDuration = now - buttonPressedAtMs;
  if (pressDuration >= LONG_PRESS_MS) {
    registerDrink(0.0f, false);
  } else if (state == State::REMINDER) {
    state = State::SNOOZE;
    snoozeUntilMs = now + SNOOZE_INTERVAL_MS;
    setReminderOutputs(false);
    notify("Soneca ativada.");
  }
}

bool pressedNow(uint8_t pin, bool &lastValue) {
  const bool value = digitalRead(pin);
  const bool pressed = lastValue == HIGH && value == LOW;
  lastValue = value;
  return pressed;
}

void handleSimulationControls() {
  if (pressedNow(PIN_SIM_DRINK, lastSimDrink)) {
    if (!simulationVolumeEnabled) {
      simulationVolumeEnabled = true;
      simulationVolumeMl = volumeMl;
    }
    const float amount = min(200.0f, simulationVolumeMl);
    simulationVolumeMl -= amount;
    volumeMl = simulationVolumeMl;
    previousVolumeMl = volumeMl;
    registerDrink(amount, true);
    Serial.printf("[SIMULACAO] Nivel reduziu 200 ml; restam %.0f ml.\n", volumeMl);
  }

  if (pressedNow(PIN_SIM_REFILL, lastSimRefill)) {
    if (!simulationVolumeEnabled) {
      simulationVolumeEnabled = true;
      simulationVolumeMl = volumeMl;
    }
    const float capacity = PI * BOTTLE_RADIUS_CM * BOTTLE_RADIUS_CM * BOTTLE_USEFUL_HEIGHT_CM;
    simulationVolumeMl = min(capacity, simulationVolumeMl + 200.0f);
    volumeMl = simulationVolumeMl;
    previousVolumeMl = volumeMl;
    notify("Reabastecimento de 200 ml simulado.");
  }

  if (millis() - lastIntervalReadMs >= 250) {
    lastIntervalReadMs = millis();
    const int slider = analogRead(PIN_SIM_INTERVAL);
    const uint8_t selectedMinutes = slider < 1365 ? 30 : slider < 2730 ? 40 : 60;
    if (selectedMinutes == configuredIntervalMinutes) return;
    configuredIntervalMinutes = selectedMinutes;
    lastDrinkMs = millis();
    state = State::MONITORING;
    setReminderOutputs(false);
    Serial.printf("[CONFIGURACAO] Novo intervalo: %u minutos.\n", configuredIntervalMinutes);
  }
}

void processMeasurements() {
  distanceCm = readMedianDistanceCm();
  const float sensorVolumeMl = distanceToVolumeMl(distanceCm);
  volumeMl = simulationVolumeEnabled ? simulationVolumeMl : sensorVolumeMl;

  temperatureSensor.requestTemperatures();
  const float measuredTemp = temperatureSensor.getTempCByIndex(0);
  if (measuredTemp > -55.0f && measuredTemp < 125.0f) temperatureC = measuredTemp;

  if (!simulationVolumeEnabled && previousVolumeMl >= 0.0f) {
    const float delta = volumeMl - previousVolumeMl;
    if (delta <= -DRINK_THRESHOLD_ML) {
      registerDrink(-delta, true);
    } else if (delta >= REFILL_THRESHOLD_ML) {
      notify("Reabastecimento detectado.");
    }
  }
  previousVolumeMl = volumeMl;

  if (temperatureC > HOT_WARNING_C && !hotWarningSent) {
    notify("Cuidado: liquido acima de 50 C.");
    hotWarningSent = true;
  } else if (temperatureC < HOT_WARNING_C - 2.0f) {
    hotWarningSent = false;
  }
}

void updateStateMachine() {
  const uint32_t now = millis();
  if (state == State::DRINK && now - lastDrinkMs > 1500) state = State::MONITORING;

  if (state == State::SNOOZE) {
    if (static_cast<int32_t>(now - snoozeUntilMs) >= 0) {
      state = State::REMINDER;
      setReminderOutputs(true);
      notify("Soneca encerrada: hora de beber agua.");
    }
    return;
  }

  if (state != State::REMINDER && now - lastDrinkMs >= reminderIntervalMs()) {
    state = State::REMINDER;
    setReminderOutputs(true);
    notify("Hora de beber agua.");
  }
}

void drawDisplay() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("AquaRemind");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  display.setCursor(0, 15);
  display.printf("Volume: %.0f ml\n", volumeMl);
  display.printf("Temp:   %.1f C", temperatureC);
  if (temperatureC > HOT_WARNING_C) display.print(" !");
  display.println();
  display.printf("Meta:   %.0f/2000\n", consumedTodayMl);

  const uint32_t elapsedMs = millis() - lastDrinkMs;
  const uint32_t remainingMs = elapsedMs < reminderIntervalMs() ? reminderIntervalMs() - elapsedMs : 0;
#if DEMO_MODE
  display.printf("Prox: %lumin (demo)\n", remainingMs / 1000);
#else
  display.printf("Prox: %lumin\n", remainingMs / 60000);
#endif
  display.print(stateName(state));
  display.display();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_SIM_DRINK, INPUT_PULLUP);
  pinMode(PIN_SIM_REFILL, INPUT_PULLUP);
  pinMode(PIN_SIM_INTERVAL, INPUT);
  setReminderOutputs(false);

  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("ERRO: OLED SSD1306 nao encontrado.");
  }

  temperatureSensor.begin();
  temperatureSensor.setResolution(9);
  lastDrinkMs = millis();
  notify(DEMO_MODE ? "Sistema iniciado em modo demonstracao."
                   : "Sistema iniciado em modo real.");
}

void loop() {
  const uint32_t now = millis();
  handleButton();
  handleSimulationControls();

  if (now - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;
    processMeasurements();
  }

  updateStateMachine();
  updateReminderSound();

  if (now - lastDisplayMs >= DISPLAY_INTERVAL_MS) {
    lastDisplayMs = now;
    drawDisplay();
  }

  if (now - lastSerialMs >= SERIAL_INTERVAL_MS) {
    lastSerialMs = now;
    Serial.printf("estado=%s distancia=%.1fcm volume=%.0fml temp=%.1fC meta=%.0fml\n",
                  stateName(state), distanceCm, volumeMl, temperatureC, consumedTodayMl);
  }
}
