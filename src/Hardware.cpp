#include "Hardware.h"
#include <Adafruit_GFX.h>
#include <Wire.h>
#include <algorithm>
#include "Config.h"

Hardware::Hardware(): display_(128,64,&Wire,-1), oneWire_(Config::Pins::TEMPERATURE),
  temperatureSensor_(&oneWire_) {}

void Hardware::begin() {
  pinMode(Config::Pins::TRIGGER,OUTPUT); pinMode(Config::Pins::ECHO,INPUT);
  pinMode(Config::Pins::LED,OUTPUT); pinMode(Config::Pins::VIBRATION_MOTOR,OUTPUT);
  pinMode(Config::Pins::BUTTON,INPUT_PULLUP);
  pinMode(Config::Pins::SIMULATE_DRINK,INPUT_PULLUP);
  pinMode(Config::Pins::SIMULATE_REFILL,INPUT_PULLUP);
  pinMode(Config::Pins::SIMULATE_INTERVAL,INPUT);
  stopReminderOutputs();
  Wire.begin(Config::Pins::OLED_SDA,Config::Pins::OLED_SCL);
  if (!display_.begin(SSD1306_SWITCHCAPVCC,0x3C)) Serial.println("ERRO: OLED SSD1306 nao encontrado.");
  temperatureSensor_.begin(); temperatureSensor_.setResolution(9);
}
float Hardware::readDistanceOnceCm() {
  digitalWrite(Config::Pins::TRIGGER,LOW); delayMicroseconds(2);
  digitalWrite(Config::Pins::TRIGGER,HIGH); delayMicroseconds(10);
  digitalWrite(Config::Pins::TRIGGER,LOW);
  const uint32_t duration=pulseIn(Config::Pins::ECHO,HIGH,30000);
  return duration==0 ? NAN : duration/58.0f;
}
float Hardware::readDistanceCm(float fallback) {
  float samples[5]; uint8_t valid=0;
  for (uint8_t i=0;i<5;++i) { const float value=readDistanceOnceCm(); if (!isnan(value)) samples[valid++]=value; delay(3); }
  if (!valid) return fallback;
  std::sort(samples,samples+valid); return samples[valid/2];
}
float Hardware::readTemperatureC(float fallback) {
  temperatureSensor_.requestTemperatures(); const float value=temperatureSensor_.getTempCByIndex(0);
  return value>-55.0f && value<125.0f ? value : fallback;
}
void Hardware::stopReminderOutputs() {
  digitalWrite(Config::Pins::LED,LOW);
  digitalWrite(Config::Pins::VIBRATION_MOTOR,LOW);
}
void Hardware::updateVibrationAlert(bool enabled) {
  if (!enabled) return;
  const uint32_t phase=millis()%2000;
  const bool vibrating=phase<220 || (phase>=360&&phase<580) || (phase>=720&&phase<940);
  digitalWrite(Config::Pins::VIBRATION_MOTOR,vibrating ? HIGH : LOW);
  digitalWrite(Config::Pins::LED,vibrating ? HIGH : LOW);
}
void Hardware::render(const Measurements &d,AppMode mode,uint32_t remainingMs,bool demo) {
  display_.clearDisplay(); display_.setTextColor(SSD1306_WHITE); display_.setTextSize(1);
  display_.setCursor(0,0); display_.println("AquaRemind"); display_.drawLine(0,10,127,10,SSD1306_WHITE);
  display_.setCursor(0,15); display_.printf("Volume: %.0f ml\n",d.volumeMl);
  display_.printf("Temp:   %.1f C",d.temperatureC); if (d.temperatureC>Config::Bottle::HOT_WARNING_C) display_.print(" !");
  display_.println(); display_.printf("Meta:   %.0f/2000\n",d.consumedTodayMl);
  display_.printf(demo ? "Prox: %lumin (demo)\n" : "Prox: %lumin\n",demo ? remainingMs/1000 : remainingMs/60000);
  display_.print(appModeName(mode)); display_.display();
}
