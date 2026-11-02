#include "AppState.h"
const char *appModeName(AppMode mode) {
  switch (mode) {
    case AppMode::MONITORING: return "MONITORANDO";
    case AppMode::REMINDER: return "LEMBRETE";
    case AppMode::DRINK: return "GOLE";
    case AppMode::SNOOZE: return "SONECA";
  }
  return "?";
}
