const state = {
  capacity: 1000,
  volume: 800,
  consumed: 0,
  goal: 2000,
  interval: 30,
  remaining: 30,
  temperature: 24,
  accelerated: true,
  alerting: false,
  simulatedMinutes: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const el = {
  water: $('#water'), currentVolume: $('#current-volume'), consumed: $('#consumed'),
  progress: $('#goal-progress'), goalLabel: $('#goal-label'), temperature: $('#temperature'),
  temperatureLabel: $('#temperature-label'), countdown: $('#countdown'), timerState: $('#timer-state'),
  alert: $('#alert'), timeline: $('#timeline'), tempRange: $('#temp-range'), tempValue: $('#temp-value'),
};

function simulatedTime() {
  const hours = Math.floor(state.simulatedMinutes / 60) % 24;
  const minutes = Math.floor(state.simulatedMinutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addEvent(text, type = 'normal') {
  const li = document.createElement('li');
  li.innerHTML = `<time>${simulatedTime()}</time><i style="background:${type === 'warning' ? '#e99529' : type === 'drink' ? '#11a9b5' : '#8da1a4'}"></i><span>${text}</span>`;
  el.timeline.prepend(li);
}

function temperatureDescription() {
  if (state.temperature < 12) return 'Água gelada';
  if (state.temperature > 50) return 'Cuidado: líquido muito quente';
  if (state.temperature > 40) return 'Água quente';
  return 'Água em temperatura ambiente';
}

function updateAlert() {
  const icon = el.alert.querySelector('.alert-icon');
  const title = el.alert.querySelector('strong');
  const text = el.alert.querySelector('span');
  el.alert.classList.remove('warning', 'danger');

  if (state.temperature > 50) {
    el.alert.classList.add('danger'); icon.textContent = '!'; title.textContent = 'Líquido muito quente';
    text.textContent = 'O sensor detectou temperatura acima de 50 °C.'; return;
  }
  if (state.alerting) {
    el.alert.classList.add('warning'); icon.textContent = '♪'; title.textContent = 'Hora de beber água';
    text.textContent = 'LED e buzzer estão emitindo três tons. Simule um gole de 200 ml.'; return;
  }
  icon.textContent = '✓'; title.textContent = 'Tudo certo';
  text.textContent = 'Beba 200 ml quando o contador chegar a zero.';
}

function render() {
  el.water.style.height = `${Math.max(0, state.volume / state.capacity * 100)}%`;
  el.currentVolume.textContent = state.volume;
  el.consumed.textContent = state.consumed;
  const percentage = Math.min(100, Math.round(state.consumed / state.goal * 100));
  el.progress.style.width = `${percentage}%`;
  el.goalLabel.textContent = `${percentage}% da meta de 2.000 ml`;
  el.temperature.textContent = state.temperature;
  el.tempValue.textContent = `${state.temperature} °C`;
  el.temperatureLabel.textContent = temperatureDescription();
  $('#hw-volume').textContent = `${state.volume} ml`;
  $('#hw-temp').textContent = `${state.temperature} °C`;
  $('#hw-oled-volume').textContent = `${state.volume}ml`;
  $('#hw-oled-timer').textContent = state.alerting ? 'BEBER AGORA' : `${Math.max(0, Math.floor(state.remaining))}min`;
  $('#hw-alert').textContent = state.alerting ? 'Alerta ativo' : 'Em espera';
  $('#hw-led').classList.toggle('on', state.alerting);
  el.countdown.textContent = `${String(Math.max(0, Math.floor(state.remaining))).padStart(2, '0')}:00`;
  el.timerState.textContent = state.alerting ? 'Tempo esgotado — aguardando um gole' : 'Contando desde o último gole';
  updateAlert();
}

function drink() {
  if (state.volume < 200) { addEvent('Garrafa sem água suficiente. Reabasteça.', 'warning'); return; }
  state.volume -= 200;
  state.consumed = Math.min(state.goal, state.consumed + 200);
  state.remaining = state.interval;
  state.alerting = false;
  addEvent('Gole de 200 ml detectado pelo sensor.', 'drink');
  if (state.consumed === state.goal) addEvent('Meta diária de 2 litros alcançada!', 'drink');
  render();
}

function refill() {
  const before = state.volume;
  state.volume = Math.min(state.capacity, state.volume + 200);
  addEvent(state.volume === before ? 'A garrafa já está cheia.' : 'Reabastecimento de 200 ml detectado.');
  render();
}

function advance(minutes) {
  state.simulatedMinutes += minutes;
  state.remaining -= minutes;
  if (state.remaining <= 0 && !state.alerting) {
    state.remaining = 0; state.alerting = true;
    addEvent('Intervalo encerrado: LED e buzzer acionados.', 'warning');
  }
  render();
}

$('#drink').addEventListener('click', drink);
$('#refill').addEventListener('click', refill);
$('#advance').addEventListener('click', () => advance(5));
$('#snooze').addEventListener('click', () => { state.remaining = 10; state.alerting = false; addEvent('Lembrete adiado por 10 minutos.'); render(); });
$('#reset').addEventListener('click', () => { Object.assign(state, { volume: 800, consumed: 0, remaining: state.interval, alerting: false, simulatedMinutes: 0 }); el.timeline.innerHTML = ''; addEvent('Novo dia iniciado.'); render(); });
el.tempRange.addEventListener('input', (event) => { state.temperature = Number(event.target.value); render(); });
$$('[data-interval]').forEach(button => button.addEventListener('click', () => {
  $$('[data-interval]').forEach(item => item.classList.remove('active'));
  button.classList.add('active'); state.interval = Number(button.dataset.interval); state.remaining = state.interval;
  state.alerting = false; addEvent(`Intervalo alterado para ${state.interval} minutos.`); render();
}));
$('#speed-toggle').addEventListener('click', (event) => {
  state.accelerated = !state.accelerated; event.currentTarget.classList.toggle('active', state.accelerated);
  event.currentTarget.setAttribute('aria-pressed', state.accelerated); addEvent(`Modo apresentação ${state.accelerated ? 'ativado' : 'desativado'}.`);
});
$$('.component').forEach(component => {
  component.addEventListener('mouseenter', () => { $('#component-detail').textContent = component.dataset.detail; });
  component.addEventListener('focus', () => { $('#component-detail').textContent = component.dataset.detail; });
});

setInterval(() => { if (state.accelerated && !state.alerting) advance(1); }, 1000);
addEvent('Sistema iniciado com 800 ml na garrafa.');
render();
