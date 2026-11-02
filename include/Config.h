#pragma once
#include <Arduino.h>
#ifndef DEMO_MODE
#define DEMO_MODE 1
#endif
namespace Config {
namespace Pins {
constexpr uint8_t TRIGGER=5, ECHO=18, TEMPERATURE=4, LED=26, VIBRATION_MOTOR=27, BUTTON=14;
constexpr uint8_t SIMULATE_DRINK=32, SIMULATE_REFILL=33, SIMULATE_INTERVAL=34;
constexpr uint8_t OLED_SDA=21, OLED_SCL=22;
}
namespace Bottle {
constexpr float RADIUS_CM=4.0f, USEFUL_HEIGHT_CM=20.0f;
constexpr float DRINK_THRESHOLD_ML=30.0f, REFILL_THRESHOLD_ML=30.0f;
constexpr float DAILY_GOAL_ML=2000.0f, HOT_WARNING_C=50.0f;
}
namespace Timing {
constexpr uint32_t SAMPLE_MS=500, DISPLAY_MS=500, SERIAL_MS=2000;
constexpr uint32_t LONG_PRESS_MS=1200, DEBOUNCE_MS=35, DRINK_FEEDBACK_MS=1500;
constexpr uint32_t SNOOZE_MS=DEMO_MODE ? 15UL*1000UL : 15UL*60UL*1000UL;
}
}
