// Porta em JavaScript do firmware do AquaRemind (src/AquaRemindApp.cpp).
// As regras, limiares, tempos e mensagens são os mesmos do ESP32; o hardware
// é injetado, então o mesmo código roda no navegador e nos testes em Node.

export const Config = {
  Bottle: {
    RADIUS_CM: 4.0,
    USEFUL_HEIGHT_CM: 20.0,
    DRINK_THRESHOLD_ML: 30.0,
    REFILL_THRESHOLD_ML: 30.0,
    DAILY_GOAL_ML: 2000.0,
    HOT_WARNING_C: 50.0,
  },
  Timing: {
    SAMPLE_MS: 500,
    DISPLAY_MS: 500,
    SERIAL_MS: 2000,
    LONG_PRESS_MS: 1200,
    DEBOUNCE_MS: 35,
    DRINK_FEEDBACK_MS: 1500,
  },
};

export const AREA_CM2 = Math.PI * Config.Bottle.RADIUS_CM ** 2;
export const CAPACITY_ML = AREA_CM2 * Config.Bottle.USEFUL_HEIGHT_CM;

export const AppMode = { MONITORING: 'MONITORANDO', REMINDER: 'LEMBRETE', DRINK: 'GOLE', SNOOZE: 'SONECA' };

const LOW = false;
const HIGH = true;

export class AquaRemindApp {
  // hw: millis(), readDistanceCm(fallback), readTemperatureC(fallback), buttonLevel(),
  //     analogInterval(), setOutputs(led, motor), render(frame), serial(line)
  constructor(hw, { demo = true } = {}) {
    this.hw = hw;
    this.demo = demo;
    this.measurements = { distanceCm: 0, volumeMl: 0, temperatureC: 24, consumedTodayMl: 0 };
    this.mode = AppMode.MONITORING;
    this.configuredIntervalMinutes = 30;
    this.previousVolumeMl = -1;
    this.lastDrinkMs = 0;
    this.snoozeUntilMs = 0;
    this.lastSampleMs = 0;
    this.lastDisplayMs = 0;
    this.lastSerialMs = 0;
    this.lastIntervalReadMs = 0;
    this.lastButtonChangeMs = 0;
    this.buttonPressedAtMs = 0;
    this.rawButton = HIGH;
    this.stableButton = HIGH;
    this.reminderOutputsEnabled = false;
    this.hotWarningSent = false;
  }

  setup() {
    this.hw.setOutputs(false, false);
    this.lastDrinkMs = this.hw.millis();
    this.notify(this.demo ? 'Sistema iniciado em modo demonstracao.' : 'Sistema iniciado em modo real.');
  }

  loop() {
    const now = this.hw.millis();
    this.handleMainButton(now);
    if (now - this.lastIntervalReadMs >= 250) { this.lastIntervalReadMs = now; this.selectReminderInterval(now); }
    if (now - this.lastSampleMs >= Config.Timing.SAMPLE_MS) { this.lastSampleMs = now; this.processMeasurements(); }
    this.updateStateMachine(now);
    this.updateVibrationAlert(now);
    if (now - this.lastDisplayMs >= Config.Timing.DISPLAY_MS) {
      this.lastDisplayMs = now;
      this.hw.render({ ...this.measurements, mode: this.mode, remainingMs: this.reminderRemainingMs(now), demo: this.demo });
    }
    if (now - this.lastSerialMs >= Config.Timing.SERIAL_MS) { this.lastSerialMs = now; this.printStatus(); }
  }

  notify(message) { this.hw.serial(`[NOTIFICACAO] ${message}`, message); }

  snoozeMs() { return this.demo ? 15 * 1000 : 15 * 60 * 1000; }
  reminderIntervalMs() { return this.configuredIntervalMinutes * (this.demo ? 1000 : 60 * 1000); }
  reminderRemainingMs(now) {
    const elapsed = now - this.lastDrinkMs;
    return elapsed < this.reminderIntervalMs() ? this.reminderIntervalMs() - elapsed : 0;
  }

  distanceToVolumeMl(distance) {
    const height = Math.min(Math.max(Config.Bottle.USEFUL_HEIGHT_CM - distance, 0), Config.Bottle.USEFUL_HEIGHT_CM);
    return AREA_CM2 * height;
  }

  stopReminderOutputs() { this.reminderOutputsEnabled = false; this.hw.setOutputs(false, false); }

  registerDrink(amount, measured) {
    this.lastDrinkMs = this.hw.millis();
    this.mode = AppMode.DRINK;
    this.stopReminderOutputs();
    if (measured) {
      this.measurements.consumedTodayMl = Math.min(Config.Bottle.DAILY_GOAL_ML, this.measurements.consumedTodayMl + amount);
    }
    this.notify(measured ? 'Gole detectado; temporizador reiniciado.' : 'Consumo confirmado pelo botao; temporizador reiniciado.');
  }

  handleMainButton(now) {
    const reading = this.hw.buttonLevel();
    if (reading !== this.rawButton) { this.rawButton = reading; this.lastButtonChangeMs = now; }
    if (now - this.lastButtonChangeMs < Config.Timing.DEBOUNCE_MS || reading === this.stableButton) return;
    this.stableButton = reading;
    if (this.stableButton === LOW) { this.buttonPressedAtMs = now; return; }
    if (now - this.buttonPressedAtMs >= Config.Timing.LONG_PRESS_MS) this.registerDrink(0, false);
    else if (this.mode === AppMode.REMINDER) {
      this.mode = AppMode.SNOOZE;
      this.snoozeUntilMs = now + this.snoozeMs();
      this.stopReminderOutputs();
      this.notify('Soneca ativada.');
    }
  }

  selectReminderInterval(now) {
    const slider = this.hw.analogInterval();
    const selected = slider < 1365 ? 30 : slider < 2730 ? 40 : 60;
    if (selected === this.configuredIntervalMinutes) return;
    this.configuredIntervalMinutes = selected;
    this.lastDrinkMs = now;
    this.mode = AppMode.MONITORING;
    this.stopReminderOutputs();
    this.hw.serial(`[CONFIGURACAO] Novo intervalo: ${selected} minutos.`);
  }

  processMeasurements() {
    const m = this.measurements;
    m.distanceCm = this.hw.readDistanceCm(m.distanceCm);
    m.volumeMl = this.distanceToVolumeMl(m.distanceCm);
    m.temperatureC = this.hw.readTemperatureC(m.temperatureC);
    if (this.previousVolumeMl >= 0) {
      const delta = m.volumeMl - this.previousVolumeMl;
      if (delta <= -Config.Bottle.DRINK_THRESHOLD_ML) this.registerDrink(-delta, true);
      else if (delta >= Config.Bottle.REFILL_THRESHOLD_ML) this.notify('Reabastecimento detectado.');
    }
    this.previousVolumeMl = m.volumeMl;
    if (m.temperatureC > Config.Bottle.HOT_WARNING_C && !this.hotWarningSent) {
      this.notify('Cuidado: liquido acima de 50 C.');
      this.hotWarningSent = true;
    } else if (m.temperatureC < Config.Bottle.HOT_WARNING_C - 2) this.hotWarningSent = false;
  }

  updateStateMachine(now) {
    if (this.mode === AppMode.DRINK && now - this.lastDrinkMs > Config.Timing.DRINK_FEEDBACK_MS) this.mode = AppMode.MONITORING;
    if (this.mode === AppMode.SNOOZE) {
      if (now - this.snoozeUntilMs >= 0) {
        this.mode = AppMode.REMINDER;
        this.reminderOutputsEnabled = true;
        this.notify('Soneca encerrada: hora de beber agua.');
      }
      return;
    }
    if (this.mode !== AppMode.REMINDER && now - this.lastDrinkMs >= this.reminderIntervalMs()) {
      this.mode = AppMode.REMINDER;
      this.reminderOutputsEnabled = true;
      this.notify('Hora de beber agua.');
    }
  }

  // Três pulsos de 220 ms a cada 2 s, no LED e no motor (Hardware::updateVibrationAlert).
  updateVibrationAlert(now) {
    if (!this.reminderOutputsEnabled) return;
    const phase = now % 2000;
    const on = phase < 220 || (phase >= 360 && phase < 580) || (phase >= 720 && phase < 940);
    this.hw.setOutputs(on, on);
  }

  printStatus() {
    const m = this.measurements;
    this.hw.serial(`estado=${this.mode} distancia=${m.distanceCm.toFixed(1)}cm volume=${m.volumeMl.toFixed(0)}ml `
      + `temp=${m.temperatureC.toFixed(1)}C meta=${m.consumedTodayMl.toFixed(0)}ml`);
  }

  // Equivale a regravar o firmware com outro DEMO_MODE, mantendo a meta do dia.
  setDemo(demo) {
    if (demo === this.demo) return;
    this.demo = demo;
    this.mode = AppMode.MONITORING;
    this.stopReminderOutputs();
    this.lastDrinkMs = this.hw.millis();
    this.notify(demo ? 'Sistema iniciado em modo demonstracao.' : 'Sistema iniciado em modo real.');
  }

  resetDay() { this.measurements.consumedTodayMl = 0; }
}

// Linhas do OLED exatamente como Hardware::render as escreve (128x64, fonte 6x8).
export function oledLines(f) {
  const hot = f.temperatureC > Config.Bottle.HOT_WARNING_C;
  const minutes = Math.floor(f.remainingMs / (f.demo ? 1000 : 60000));
  return [
    { y: 0, text: 'AquaRemind' },
    { y: 15, text: `Volume: ${f.volumeMl.toFixed(0)} ml` },
    { y: 23, text: `Temp:   ${f.temperatureC.toFixed(1)} C${hot ? ' !' : ''}` },
    { y: 31, text: `Meta:   ${f.consumedTodayMl.toFixed(0)}/2000` },
    { y: 39, text: f.demo ? `Prox: ${minutes}min (demo)` : `Prox: ${minutes}min` },
    { y: 47, text: f.mode },
  ];
}
