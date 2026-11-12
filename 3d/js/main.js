// Liga o firmware portado, o mundo físico simulado (água, tampa, temperatura) e a cena 3D.
import { AquaRemindApp, AppMode, Config, AREA_CM2, CAPACITY_ML } from './firmware.js';
import { Oled } from './oled.js';
import { createScene } from './scene.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// ---------- Mundo físico ----------
const world = {
  volume: 800, liquidTemp: 24, probeTemp: 24, capOpen: 0, tilt: 0,
  buttonDown: false, buttonSince: 0, led: false, motor: false,
  intervalMinutes: 30, clockOffset: 0, explode: 0,
};
// Beber e encher são sequências: abrir a tampa, (inclinar,) escoar, voltar e fechar.
const action = { type: null, phase: 'idle', hold: false, remaining: 0, flowed: 0 };
const SIP_ML = 15, DRINK_RATE = 70, REFILL_RATE = 130;

const sensorOk = () => world.capOpen < 0.02 && Math.abs(world.tilt) < 0.02;
const levelCm = () => world.volume / AREA_CM2;

// ---------- Display e cena ----------
const oled = new Oled();
const sceneOled = document.createElement('canvas');
oled.attach(sceneOled, 4);
oled.attach($('#oled'), 2);
const scene = createScene($('#stage'), $('#labels'), sceneOled);
// Em telas largas a barra de controles flutua sobre a cena; a câmera desconta essa faixa.
const fitStage = () => {
  const dock = $('.dock'), floating = getComputedStyle(dock).position === 'fixed';
  scene.setInsetBottom(floating ? Math.round(window.innerHeight - dock.getBoundingClientRect().top) : 0);
};
new ResizeObserver(fitStage).observe($('.dock'));
window.addEventListener('resize', fitStage);

// ---------- Hardware visto pelo firmware ----------
const t0 = performance.now() - 1000;
const serialLines = [];
let serialDirty = false;
const hw = {
  millis: () => performance.now() - t0 + world.clockOffset,
  // Com a tampa aberta ou a garrafa inclinada o eco não volta: o firmware mantém a última leitura.
  readDistanceCm: (fallback) => {
    if (!sensorOk()) return fallback;
    scene.pulse();
    return Config.Bottle.USEFUL_HEIGHT_CM - levelCm();
  },
  readTemperatureC: () => Math.round(world.probeTemp * 2) / 2, // DS18B20 em 9 bits: passos de 0,5 °C
  buttonLevel: () => !world.buttonDown,
  analogInterval: () => ({ 30: 600, 40: 2048, 60: 3500 })[world.intervalMinutes],
  setOutputs: (led, motor) => { world.led = led; world.motor = motor; },
  render: (frame) => { oled.render(frame); scene.oledChanged(); },
  serial: (line, notification) => {
    serialLines.push(line);
    if (serialLines.length > 250) serialLines.shift();
    serialDirty = true;
    if (notification) pushNotification(notification);
  },
};
const app = new AquaRemindApp(hw, { demo: true });

// ---------- Notificações no celular ----------
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
function describe(message) {
  const m = app.measurements;
  switch (message) {
    case 'Sistema iniciado em modo demonstracao.': return ['AquaRemind conectado', 'Modo demonstração: 1 minuto = 1 segundo.'];
    case 'Sistema iniciado em modo real.': return ['AquaRemind conectado', 'Modo real: lembretes em minutos.'];
    case 'Hora de beber agua.': return ['Hora de beber água', `${app.configuredIntervalMinutes} min sem beber.`, 'warn'];
    case 'Gole detectado; temporizador reiniciado.': return ['Gole registrado', `${fmt(m.consumedTodayMl)} de 2.000 ml hoje.`];
    case 'Consumo confirmado pelo botao; temporizador reiniciado.': return ['Consumo confirmado', 'Temporizador reiniciado pelo botão.'];
    case 'Soneca ativada.': return ['Soneca ativada', 'Novo lembrete em 15 min.'];
    case 'Soneca encerrada: hora de beber agua.': return ['Soneca encerrada', 'Hora de beber água.', 'warn'];
    case 'Reabastecimento detectado.': return ['Garrafa reabastecida', `Volume atual: ${fmt(m.volumeMl)} ml.`];
    case 'Cuidado: liquido acima de 50 C.': return ['Cuidado: líquido quente', 'Temperatura acima de 50 °C.', 'hot'];
    default: return ['AquaRemind', message];
  }
}
function pushNotification(message) {
  const [title, body, kind] = describe(message);
  const li = document.createElement('li');
  if (kind) li.className = kind;
  li.innerHTML = '<header><span>AQUAREMIND</span><time></time></header><b></b><span></span>';
  li.querySelector('time').textContent = new Date().toLocaleTimeString('pt-BR');
  li.querySelector('b').textContent = title;
  li.lastElementChild.textContent = body;
  const list = $('#phone');
  list.prepend(li);
  while (list.children.length > 30) list.lastElementChild.remove();
  sound.ding(kind ? 660 : 880);
}

// ---------- Som (opcional) ----------
const sound = {
  ctx: null, motorGain: null, waterGain: null,
  enable() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new AudioContext();
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = 150;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 420;
    this.motorGain = ctx.createGain(); this.motorGain.gain.value = 0;
    osc.connect(low).connect(this.motorGain).connect(ctx.destination); osc.start();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1100; band.Q.value = 0.8;
    this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
    noise.connect(band).connect(this.waterGain).connect(ctx.destination); noise.start();
  },
  get on() { return this.ctx && $('#sound').checked; },
  update(motor, water) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, on = $('#sound').checked;
    this.motorGain.gain.setTargetAtTime(on && motor ? 0.09 : 0, now, 0.012);
    this.waterGain.gain.setTargetAtTime(on ? water : 0, now, 0.06);
  },
  ding(frequency) {
    if (!this.on) return;
    const ctx = this.ctx, osc = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime;
    osc.frequency.setValueAtTime(frequency, now); osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, now + 0.12);
    gain.gain.setValueAtTime(0.12, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now + 0.4);
  },
};

// ---------- Ações sobre a garrafa ----------
let toastTimer = 0;
function toast(text) {
  const el = $('#toast'); el.textContent = text; el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}
function startAction(type, hold, amount) {
  if (action.type) return;
  if (type === 'drink' && world.volume < 1) { toast('Garrafa vazia: reabasteça antes de beber.'); return; }
  if (type === 'refill' && world.volume > CAPACITY_ML - 1) { toast('A garrafa já está cheia.'); return; }
  Object.assign(action, { type, phase: 'opening', hold, remaining: hold ? Infinity : amount, flowed: 0 });
}
function releaseAction(type) {
  if (action.type !== type || !action.hold) return;
  action.hold = false;
  // Um toque rápido vira um golinho de 15 ml, abaixo do limiar de 30 ml do firmware.
  action.remaining = Math.max(0, SIP_ML - action.flowed);
}
const approach = (value, target, dt, rate) => {
  const next = value + (target - value) * (1 - Math.exp(-dt * rate));
  return Math.abs(next - target) < 0.012 ? target : next;
};
const drinkTilt = () => (40 + 32 * (1 - world.volume / CAPACITY_ML)) * Math.PI / 180;

function stepWorld(dt) {
  world.probeTemp += (world.liquidTemp - world.probeTemp) * (1 - Math.exp(-dt / 1.1));
  if (!action.type) return;
  const drinking = action.type === 'drink';
  if (action.phase === 'opening') {
    world.capOpen = Math.min(1, world.capOpen + dt / 0.4);
    if (world.capOpen >= 1) {
      if (drinking) { world.tilt = approach(world.tilt, drinkTilt(), dt, 5); if (world.tilt >= drinkTilt() - 0.03) action.phase = 'flow'; }
      else action.phase = 'flow';
    }
  } else if (action.phase === 'flow') {
    const room = drinking ? world.volume : CAPACITY_ML - world.volume;
    const dv = Math.min((drinking ? DRINK_RATE : REFILL_RATE) * dt, action.remaining, room);
    world.volume += drinking ? -dv : dv; action.remaining -= dv; action.flowed += dv;
    if (drinking) world.tilt = approach(world.tilt, drinkTilt(), dt, 5);
    if (room - dv <= 1e-6 && (action.hold || action.remaining > 1e-6)) toast(drinking ? 'A garrafa esvaziou.' : 'Garrafa cheia.');
    if (action.remaining <= 1e-6 || room - dv <= 1e-6) action.phase = 'closing';
  } else {
    world.tilt = approach(world.tilt, 0, dt, 6);
    if (world.tilt === 0) world.capOpen = Math.max(0, world.capOpen - dt / 0.4);
    if (world.capOpen === 0) { action.type = null; action.phase = 'idle'; }
  }
}

// ---------- Interface ----------
function holdButton(el, down, up) {
  let held = false;
  const start = (event) => { if (held) return; held = true; el.classList.add('held'); event.preventDefault?.(); down(); };
  const end = () => { if (!held) return; held = false; el.classList.remove('held'); up(); };
  el.addEventListener('pointerdown', (event) => { el.setPointerCapture(event.pointerId); start(event); });
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) start(event); });
  el.addEventListener('keyup', (event) => { if (event.key === ' ' || event.key === 'Enter') end(); });
  el.addEventListener('blur', end);
}
holdButton($('#drink-hold'), () => startAction('drink', true), () => releaseAction('drink'));
holdButton($('#refill-hold'), () => startAction('refill', true), () => releaseAction('refill'));
$('#drink-200').addEventListener('click', () => startAction('drink', false, 200));
$('#refill-200').addEventListener('click', () => startAction('refill', false, 200));

const pressDevice = (down) => { world.buttonDown = down; world.buttonSince = performance.now(); };
holdButton($('#device-button'), () => pressDevice(true), () => pressDevice(false));
scene.onButton(pressDevice);

function segmented(container, onPick) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('button'); if (!button) return;
    for (const b of container.children) b.classList.toggle('active', b === button);
    onPick(button.dataset);
  });
}
segmented($('#interval'), (data) => { world.intervalMinutes = Number(data.minutes); });
segmented($('#views'), (data) => { world.explode = data.view === 'explodida' ? 1 : 0; scene.setView(data.view); });

$('#skip').addEventListener('click', () => { world.clockOffset += app.demo ? 5000 : 5 * 60 * 1000; });
$('#demo').addEventListener('change', (event) => app.setDemo(event.target.checked));
$('#temp').addEventListener('input', (event) => {
  world.liquidTemp = Number(event.target.value); $('#temp-out').textContent = `${world.liquidTemp} °C`;
});
$('#pulses').addEventListener('change', (event) => scene.setPulses(event.target.checked));
$('#rotate').addEventListener('change', (event) => scene.setAutoRotate(event.target.checked));
$('#sound').addEventListener('change', (event) => { if (event.target.checked) sound.enable(); });
$('#reset-day').addEventListener('click', () => { app.resetDay(); toast('Meta diária zerada.'); });
for (const tab of $$('.tab')) {
  tab.addEventListener('click', () => {
    for (const other of $$('.tab')) other.classList.toggle('active', other === tab);
    $('#tab-phone').hidden = tab.dataset.tab !== 'phone'; $('#tab-serial').hidden = tab.dataset.tab !== 'serial';
    serialDirty = true;
  });
}

const cache = new Map();
function set(id, value, prop = 'textContent') {
  if (cache.get(id + prop) === value) return;
  cache.set(id + prop, value); $(id)[prop] = value;
}
const decimal = (n, digits) => n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function timer(now) {
  const unit = app.demo ? 1000 : 60000;
  if (app.mode === AppMode.REMINDER) return { label: 'Lembrete ativo', value: 'agora', unit: '', fraction: 1 };
  if (app.mode === AppMode.SNOOZE) {
    const left = Math.max(0, app.snoozeUntilMs - now);
    return { label: 'Soneca termina em', value: String(Math.ceil(left / unit)), unit: 'min', fraction: left / app.snoozeMs() };
  }
  const left = app.reminderRemainingMs(now);
  return { label: 'Próximo lembrete', value: String(Math.ceil(left / unit)), unit: 'min', fraction: left / app.reminderIntervalMs() };
}

function updateUi(now) {
  const m = app.measurements, tm = timer(now);
  set('#state', app.mode); $('#state').dataset.mode = app.mode;
  $('#io-led').classList.toggle('on', world.led); $('#io-motor').classList.toggle('on', world.motor);
  set('#m-volume', fmt(m.volumeMl)); set('#m-temp', decimal(m.temperatureC, 1));
  set('#m-next-label', tm.label); set('#m-next', tm.value); set('#m-next-unit', tm.unit);
  set('#m-sensor', sensorOk() ? `lendo · ${decimal(m.distanceCm, 1)} cm` : 'sem eco (tampa aberta)');
  $('#m-sensor').classList.toggle('off', !sensorOk());
  set('#m-consumed', fmt(m.consumedTodayMl));
  set('#goal-bar', `${Math.min(100, m.consumedTodayMl / Config.Bottle.DAILY_GOAL_ML * 100).toFixed(1)}%`, 'title');
  $('#goal-bar').style.width = cache.get('#goal-bartitle');
  const held = world.buttonDown ? Math.min(1, (performance.now() - world.buttonSince) / Config.Timing.LONG_PRESS_MS) : 0;
  $('#hold-progress').style.width = `${held * 100}%`;
  if (serialDirty && !$('#tab-serial').hidden) {
    serialDirty = false;
    const pre = $('#serial'); pre.textContent = serialLines.join('\n'); pre.scrollTop = pre.scrollHeight;
  }
  return tm;
}

// ---------- Laço principal ----------
app.setup();
let last = performance.now();
function frame(nowMs) {
  const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs;
  stepWorld(dt);
  app.loop();
  const tm = updateUi(hw.millis());
  const flowing = action.phase === 'flow';
  sound.update(world.motor, flowing ? (action.type === 'refill' ? 0.14 : 0.05) : 0);
  scene.update(dt, {
    level: levelCm(), tilt: world.tilt, capOpen: world.capOpen, explode: world.explode,
    pouring: flowing && action.type === 'refill', drinking: flowing && action.type === 'drink',
    led: world.led, motor: world.motor, buttonDown: world.buttonDown, tempC: world.probeTemp,
    sensorOk: sensorOk(), distanceCm: app.measurements.distanceCm,
    goalFraction: app.measurements.consumedTodayMl / Config.Bottle.DAILY_GOAL_ML,
    timerFraction: tm.fraction, reminder: app.mode === AppMode.REMINDER, snooze: app.mode === AppMode.SNOOZE,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.aquaremind = { world, action, app, scene };
