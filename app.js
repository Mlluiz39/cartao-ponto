'use strict';

const STORAGE_KEY = 'cartao-ponto:v1';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const DEFAULT_CONFIG = {
  placeName: 'Local de trabalho',
  lat: null,
  lng: null,
  radius: 150,
  company: 'Panificadora Industrial SaintDeni',
  employee: 'Marcelo Luiz Pereira de Souza',
  matricula: '',
  sector: 'Logística',
  role: 'Motorista',
  expectedStart: '07:00',
  expectedEnd: '15:00',
  breakStart: '12:00',
  breakEnd: '13:00',
  schedule: '6 x 1 - segunda a sábado - feriados folga'
};

let state = loadState();
const boot = new Date();
let viewMonth = { year: boot.getFullYear(), month: boot.getMonth() };
let geo = { phase: 'idle', lat: null, lng: null, accuracy: null, distance: null, inside: false, error: null, at: null };
let watchId = null;
let openDay = null;
let toastTimer = null;

/* ---------- utilidades ---------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const pad = (value) => String(value).padStart(2, '0');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function keyOf(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function parseKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function fmtTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmtHM(minutes) {
  const total = Math.max(0, Math.round(minutes));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function toMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

function distanceMeters(from, to) {
  const R = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- persistência ---------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { config: { ...DEFAULT_CONFIG }, punches: [] };
    const data = JSON.parse(raw);
    return {
      config: { ...DEFAULT_CONFIG, ...(data.config || {}) },
      punches: Array.isArray(data.punches) ? data.punches : []
    };
  } catch (error) {
    console.warn('Não foi possível ler os dados salvos.', error);
    return { config: { ...DEFAULT_CONFIG }, punches: [] };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error(error);
    toast('Não foi possível salvar os dados neste navegador.');
  }
}

/* ---------- consultas ---------- */

function punchesFor(key) {
  return state.punches
    .filter((punch) => punch.dateKey === key)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

function dayMinutes(list) {
  let total = 0;
  for (let index = 0; index + 1 < list.length; index += 2) {
    const diff = minutesOfDay(new Date(list[index + 1].ts)) - minutesOfDay(new Date(list[index].ts));
    if (diff > 0) total += diff;
  }
  return total;
}

function expectedDailyMinutes() {
  const config = state.config;
  const span = toMinutes(config.expectedEnd) - toMinutes(config.expectedStart);
  const pause = toMinutes(config.breakEnd) - toMinutes(config.breakStart);
  return Math.max(0, span - Math.max(0, pause));
}

function monthStats(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const expected = expectedDailyMinutes();
  let total = 0;
  let worked = 0;
  let extra = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const minutes = dayMinutes(punchesFor(keyOf(year, month, day)));
    if (minutes > 0) {
      worked += 1;
      total += minutes;
      extra += Math.max(0, minutes - expected);
    }
  }
  return { total, worked, extra };
}

function configHasPlace() {
  return Number.isFinite(state.config.lat) && Number.isFinite(state.config.lng);
}

function nextPunchType(key) {
  return punchesFor(key).length % 2 === 0 ? 'in' : 'out';
}

function nextLabel(key = dateKey(new Date())) {
  return nextPunchType(key) === 'in' ? 'Entrada' : 'Saída';
}

function pairSummary(list) {
  const parts = [];
  for (let index = 0; index < list.length; index += 2) {
    const start = fmtTime(new Date(list[index].ts));
    const end = list[index + 1] ? fmtTime(new Date(list[index + 1].ts)) : '—';
    parts.push(`${start} → ${end}`);
  }
  return parts.join('   ·   ');
}

/* ---------- localização ---------- */

function startGeo() {
  if (!configHasPlace() || !('geolocation' in navigator)) {
    if (!('geolocation' in navigator)) {
      geo = { ...geo, phase: 'error', error: 'Geolocalização não suportada neste navegador.' };
    }
    renderStatus();
    return;
  }
  if (watchId !== null) return;
  geo = { ...geo, phase: 'locating', error: null };
  renderStatus();
  watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 4000
  });
}

function stopGeo() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function onPosition(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const distance = distanceMeters(
    { lat: latitude, lng: longitude },
    { lat: state.config.lat, lng: state.config.lng }
  );
  geo = {
    phase: 'ready',
    lat: latitude,
    lng: longitude,
    accuracy,
    distance,
    inside: distance <= state.config.radius,
    error: null,
    at: new Date()
  };
  renderStatus();
}

function onPositionError(error) {
  geo = { ...geo, phase: 'error', error: geoErrorMessage(error) };
  renderStatus();
}

function geoErrorMessage(error) {
  if (!error) return 'Não foi possível obter a localização.';
  if (error.code === 1) return 'Permissão de localização negada. Libere o acesso ao site no navegador.';
  if (error.code === 2) return 'Sinal de GPS indisponível no momento.';
  if (error.code === 3) return 'Tempo esgotado ao buscar a localização.';
  return 'Não foi possível obter a localização.';
}

/* ---------- navegação ---------- */

function showView(name) {
  $$('.view').forEach((view) => view.classList.toggle('hidden', view.id !== `view-${name}`));
  $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === name));
  if (name === 'punch') {
    renderStatus();
    startGeo();
  }
  if (name === 'dias') renderDays();
  if (name === 'card') renderCard();
  if (name === 'settings') fillSettings();
}

function shiftMonth(delta) {
  let { year, month } = viewMonth;
  month += delta;
  if (month < 0) { month = 11; year -= 1; }
  if (month > 11) { month = 0; year += 1; }
  viewMonth = { year, month };
  openDay = null;
  renderDays();
  renderCard();
}

/* ---------- tela ponto ---------- */

function renderStatus() {
  const card = $('#statusCard');
  const button = $('#punchBtn');
  const hint = $('#punchHint');
  if (!card || !button) return;

  if (!configHasPlace()) {
    card.className = 'status-card neutral';
    card.innerHTML = `
      <span class="dot"></span>
      <div>
        <p class="status-title">Local não configurado</p>
        <p class="status-sub">Defina o local de trabalho e o raio permitido para liberar o registro.</p>
      </div>`;
    button.disabled = false;
    button.classList.add('secondary');
    button.textContent = 'Definir local';
    hint.textContent = '';
    return;
  }

  button.classList.remove('secondary');
  const config = state.config;

  if (geo.phase === 'error') {
    card.className = 'status-card bad';
    card.innerHTML = `
      <span class="dot"></span>
      <div>
        <p class="status-title">Localização indisponível</p>
        <p class="status-sub">${esc(geo.error)}</p>
      </div>`;
    button.disabled = true;
    button.textContent = 'Aguardando localização';
    hint.textContent = 'Confira a permissão de localização do navegador em Ajustes.';
    return;
  }

  if (geo.phase !== 'ready') {
    card.className = 'status-card neutral';
    card.innerHTML = `
      <span class="dot pulse"></span>
      <div>
        <p class="status-title">Buscando sua localização…</p>
        <p class="status-sub">${esc(config.placeName)}</p>
      </div>`;
    button.disabled = true;
    button.textContent = `Registrar ${nextLabel()}`;
    hint.textContent = 'Aceite o acesso à localização no navegador.';
    return;
  }

  const inside = geo.inside;
  card.className = `status-card ${inside ? 'ok' : 'bad'}`;
  card.innerHTML = `
    <span class="dot"></span>
    <div>
      <p class="status-title">${inside ? 'Você está no local' : 'Você está fora do local'}</p>
      <p class="status-sub">${esc(config.placeName)} · ${formatDistance(geo.distance)} de distância · raio ${config.radius} m</p>
      <p class="status-sub small">Precisão do GPS: ±${Math.round(geo.accuracy || 0)} m</p>
    </div>`;
  button.disabled = !inside;
  button.textContent = inside ? `Registrar ${nextLabel()}` : 'Fora do local';
  hint.textContent = inside
    ? `Será registrada a ${nextLabel().toLowerCase()} com data, hora e localização.`
    : 'Aproxime-se do local para registrar o ponto.';
}

function handlePunch() {
  if (!configHasPlace()) {
    showView('settings');
    return;
  }
  if (geo.phase !== 'ready') {
    toast('Aguardando sua localização…');
    startGeo();
    return;
  }
  if (!geo.inside) {
    toast(`Você está a ${formatDistance(geo.distance)} do local. Aproxime-se para registrar.`);
    return;
  }

  const now = new Date();
  const key = dateKey(now);
  const type = nextPunchType(key);
  const distance = distanceMeters(
    { lat: geo.lat, lng: geo.lng },
    { lat: state.config.lat, lng: state.config.lng }
  );

  state.punches.push({
    id: uid(),
    dateKey: key,
    ts: now.toISOString(),
    type,
    lat: geo.lat,
    lng: geo.lng,
    accuracy: geo.accuracy,
    distance: Math.round(distance),
    place: state.config.placeName,
    source: 'gps'
  });
  saveState();
  refreshAll();
  toast(`${type === 'in' ? 'Entrada' : 'Saída'} registrada às ${fmtTime(now)}`);
  if (navigator.vibrate) navigator.vibrate(60);
}

function renderToday() {
  const label = $('#todayLabel');
  const listEl = $('#todayList');
  if (!label || !listEl) return;

  const now = new Date();
  label.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

  const list = punchesFor(dateKey(now));
  if (!list.length) {
    listEl.innerHTML = '<li class="empty">Nenhum registro hoje. O primeiro registro será a entrada.</li>';
    return;
  }

  listEl.innerHTML = list.map((punch) => {
    const date = new Date(punch.ts);
    const hasGeo = Number.isFinite(punch.lat) && Number.isFinite(punch.lng);
    const meta = hasGeo
      ? `<a href="https://www.google.com/maps?q=${punch.lat},${punch.lng}" target="_blank" rel="noopener">${punch.lat.toFixed(5)}, ${punch.lng.toFixed(5)}</a>
         <span>±${Math.round(punch.accuracy || 0)} m · ${formatDistance(punch.distance)} do local</span>`
      : '<span class="tag">manual</span><span>sem localização</span>';
    return `<li class="punch">
      <span class="badge ${punch.type === 'in' ? 'in' : 'out'}">${punch.type === 'in' ? 'Entrada' : 'Saída'}</span>
      <input type="time" value="${fmtTime(date)}" data-time="${punch.id}" aria-label="Hora do registro" />
      <span class="punch-meta">${meta}</span>
      <button class="icon-btn del" type="button" data-del="${punch.id}" aria-label="Excluir registro">✕</button>
    </li>`;
  }).join('');
}

/* ---------- tela dias ---------- */

function renderDays() {
  const root = $('#daysRoot');
  const monthLabel = $('#daysMonthLabel');
  if (!root) return;

  const { year, month } = viewMonth;
  if (monthLabel) monthLabel.textContent = `${MONTHS[month]} / ${year}`;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = keyOf(year, month, day);
    const list = punchesFor(key);
    const date = new Date(year, month, day);
    const isOpen = openDay === key;
    const total = dayMinutes(list);
    const summary = pairSummary(list);

    rows.push(`
      <div class="day-row ${list.length ? 'has-data' : ''}">
        <div class="day-info">
          <span class="day-num">${pad(day)}</span>
          <span class="day-week">${WEEKDAYS[date.getDay()].slice(0, 3)}</span>
        </div>
        <div class="day-times">${summary || '<span class="day-empty">Sem registros</span>'}</div>
        <div class="day-total">${total ? fmtHM(total) : ''}</div>
        <button class="btn small ghost" type="button" data-edit="${key}">${isOpen ? 'Fechar' : 'Lançar'}</button>
      </div>
      ${isOpen ? editorHTML(key) : ''}
    `);
  }

  root.innerHTML = `<div class="panel days-panel">${rows.join('')}</div>`;
}

function editorHTML(key) {
  const list = punchesFor(key);
  const date = parseKey(key);
  const isToday = key === dateKey(new Date());

  const slots = [0, 1, 2, 3, 4, 5].map((index) => {
    const punch = list[index];
    const value = punch ? fmtTime(new Date(punch.ts)) : '';
    const label = `${index % 2 === 0 ? 'Entrada' : 'Saída'} ${Math.floor(index / 2) + 1}`;
    const manual = punch && !Number.isFinite(punch.lat) ? ' <span class="tag">manual</span>' : '';
    return `<label>${label}${manual}<input type="time" data-slot="${index}" value="${value}" /></label>`;
  });

  return `<div class="day-editor" data-editor="${key}">
    <p class="editor-title">${WEEKDAYS[date.getDay()]}, ${pad(date.getDate())}/${pad(date.getMonth() + 1)}</p>
    <div class="pair-grid">${slots.join('')}</div>
    <div class="editor-actions">
      <button class="btn primary" type="button" data-save="${key}">Salvar dia</button>
      ${isToday ? '<button class="btn ghost" type="button" data-now="in">Entrada agora</button><button class="btn ghost" type="button" data-now="out">Saída agora</button>' : ''}
      <button class="btn danger" type="button" data-clear="${key}">Limpar dia</button>
    </div>
    <p class="hint">Horários digitados ficam marcados como manuais. Registros feitos pelo GPS guardam a localização.</p>
  </div>`;
}

function saveDay(key, values) {
  const existing = punchesFor(key);
  const used = new Set();
  const base = parseKey(key);
  const created = [];

  values.forEach((value) => {
    if (!value) return;
    const [hours, minutes] = value.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const when = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0);

    const index = existing.findIndex((punch, position) => !used.has(position) && fmtTime(new Date(punch.ts)) === value);
    if (index >= 0) {
      used.add(index);
      created.push({ ...existing[index], ts: when.toISOString() });
    } else {
      created.push({
        id: uid(),
        dateKey: key,
        ts: when.toISOString(),
        type: 'in',
        lat: null,
        lng: null,
        accuracy: null,
        distance: null,
        place: '',
        source: 'manual'
      });
    }
  });

  created.sort((a, b) => a.ts.localeCompare(b.ts));
  created.forEach((punch, index) => { punch.type = index % 2 === 0 ? 'in' : 'out'; });

  state.punches = state.punches.filter((punch) => punch.dateKey !== key).concat(created);
  saveState();
}

function saveDayFromEditor(key) {
  const editor = document.querySelector(`[data-editor="${key}"]`);
  if (!editor) return;
  const values = $$('input[data-slot]', editor).map((input) => input.value);
  saveDay(key, values);
  refreshAll();
  toast('Dia salvo no cartão do mês');
}

function fillNowSlot(editor, type) {
  const inputs = $$('input[data-slot]', editor);
  const parity = type === 'in' ? 0 : 1;
  const target = inputs.find((input, index) => index % 2 === parity && !input.value);
  if (!target) {
    toast('Todos os campos desse tipo já estão preenchidos.');
    return;
  }
  const now = new Date();
  target.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  target.focus();
}

/* ---------- cartão ---------- */

function renderCard() {
  const root = $('#cardRoot');
  const label = $('#cardMonthLabel');
  if (!root) return;

  const { year, month } = viewMonth;
  if (label) label.textContent = `${MONTHS[month]} / ${year}`;

  const includeProof = $('#includeProof') ? $('#includeProof').checked : true;
  root.innerHTML = sheetHTML(year, month, 0) + sheetHTML(year, month, 1) + (includeProof ? proofHTML(year, month) : '');
}

function sheetHTML(year, month, half) {
  const config = state.config;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const start = half === 0 ? 1 : 16;
  const end = half === 0 ? 15 : daysInMonth;
  let quinzenaTotal = 0;
  const rows = [];

  for (let day = start; day <= end; day += 1) {
    const key = keyOf(year, month, day);
    const list = punchesFor(key);
    const total = dayMinutes(list);
    const weekday = new Date(year, month, day).getDay();
    quinzenaTotal += total;

    const cells = [];
    for (let index = 0; index < 3; index += 1) {
      const entry = list[index * 2];
      const exit = list[index * 2 + 1];
      cells.push(`<td>${entry ? fmtTime(new Date(entry.ts)) : ''}</td><td>${exit ? fmtTime(new Date(exit.ts)) : ''}</td>`);
    }

    rows.push(`<tr class="${weekday === 0 ? 'off' : ''}">
      <td class="day">${day}</td>
      ${cells.join('')}
      <td class="total">${total ? fmtHM(total) : ''}</td>
    </tr>`);
  }

  const stats = half === 1 ? monthStats(year, month) : null;

  return `<section class="sheet">
    <div class="sheet-head">
      <div class="sheet-title">CARTÃO DE PONTO</div>
      <div class="sheet-month">MÊS/ANO: ${MONTHS[month]} / ${year}</div>
    </div>
    <div class="meta-grid">
      <div><span class="lbl">Empresa:</span> ${esc(config.company)}</div>
      <div><span class="lbl">Matrícula:</span> ${esc(config.matricula) || '____________'}</div>
      <div><span class="lbl">Nome:</span> ${esc(config.employee)}</div>
      <div><span class="lbl">Função:</span> ${esc(config.role)}</div>
      <div><span class="lbl">Setor:</span> ${esc(config.sector)}</div>
      <div><span class="lbl">Intervalo:</span> ${esc(config.breakStart)} às ${esc(config.breakEnd)}</div>
      <div><span class="lbl">Entrada:</span> ${esc(config.expectedStart)}</div>
      <div><span class="lbl">Saída:</span> ${esc(config.expectedEnd)}</div>
      <div class="span2"><span class="lbl">Escala:</span> ${esc(config.schedule)}</div>
      ${configHasPlace() ? `<div class="span2"><span class="lbl">Local:</span> ${esc(config.placeName)} · ${config.lat.toFixed(5)}, ${config.lng.toFixed(5)} · raio ${config.radius} m</div>` : ''}
    </div>
    <h3 class="sheet-sub">${half === 0 ? '1ª' : '2ª'} QUINZENA</h3>
    <div class="table-scroll">
      <table class="card-table">
        <thead>
          <tr>
            <th rowspan="2" class="day-col">DIA</th>
            <th colspan="2">1º período</th>
            <th colspan="2">2º período</th>
            <th colspan="2">3º período</th>
            <th rowspan="2" class="total-col">Total</th>
          </tr>
          <tr><th>Entrada</th><th>Saída</th><th>Entrada</th><th>Saída</th><th>Entrada</th><th>Saída</th></tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
        <tfoot>
          <tr><td colspan="7" class="left">Total da quinzena</td><td class="total">${quinzenaTotal ? fmtHM(quinzenaTotal) : ''}</td></tr>
        </tfoot>
      </table>
    </div>
    ${stats ? `<div class="summary">
      <div><span>Dias trabalhados</span><strong>${stats.worked}</strong></div>
      <div><span>Total de horas no mês</span><strong>${fmtHM(stats.total)}</strong></div>
      <div><span>Horas extras (est.)</span><strong>${fmtHM(stats.extra)}</strong></div>
    </div>` : ''}
    <p class="obs">Observações: <span class="line"></span></p>
    <div class="signatures">
      <div>Assinatura do empregado: <span class="line"></span></div>
      <div>Assinatura do responsável: <span class="line"></span></div>
    </div>
    <p class="sheet-footer">Cartão de ponto — ${MONTHS[month]}/${year} — Página ${half + 1}</p>
  </section>`;
}

function proofHTML(year, month) {
  const config = state.config;
  const list = state.punches
    .filter((punch) => {
      const date = new Date(punch.ts);
      return date.getFullYear() === year && date.getMonth() === month;
    })
    .sort((a, b) => a.ts.localeCompare(b.ts));

  const rows = list.map((punch) => {
    const date = new Date(punch.ts);
    const coords = Number.isFinite(punch.lat) && Number.isFinite(punch.lng)
      ? `${punch.lat.toFixed(5)}, ${punch.lng.toFixed(5)}`
      : '—';
    return `<tr>
      <td>${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}</td>
      <td>${WEEKDAYS[date.getDay()].slice(0, 3)}</td>
      <td>${punch.type === 'in' ? 'Entrada' : 'Saída'}</td>
      <td>${fmtTime(date)}</td>
      <td>${coords}</td>
      <td>${Number.isFinite(punch.accuracy) ? `±${Math.round(punch.accuracy)} m` : '—'}</td>
      <td>${Number.isFinite(punch.distance) ? `${punch.distance} m` : '—'}</td>
    </tr>`;
  }).join('');

  return `<section class="sheet proof">
    <div class="sheet-head">
      <div class="sheet-title">COMPROVANTE DE REGISTROS</div>
      <div class="sheet-month">${MONTHS[month]} / ${year}</div>
    </div>
    <p class="proof-sub">Data, hora e localização capturadas em cada registro${configHasPlace() ? ` — ${esc(config.placeName)} (${config.lat.toFixed(5)}, ${config.lng.toFixed(5)})` : ''}.</p>
    <div class="table-scroll">
      <table class="card-table proof-table">
        <thead><tr><th>Data</th><th>Dia</th><th>Registro</th><th>Hora</th><th>Coordenadas</th><th>Precisão</th><th>Distância</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7">Nenhum registro no mês.</td></tr>'}</tbody>
      </table>
    </div>
    <p class="sheet-footer">Cartão de ponto — ${MONTHS[month]}/${year} — Página 3</p>
  </section>`;
}

function printCard() {
  showView('card');
  renderCard();
  setTimeout(() => window.print(), 120);
}

/* ---------- ajustes ---------- */

function fillSettings() {
  const config = state.config;
  const fields = {
    '#cfg-place': config.placeName,
    '#cfg-lat': Number.isFinite(config.lat) ? config.lat : '',
    '#cfg-lng': Number.isFinite(config.lng) ? config.lng : '',
    '#cfg-radius': config.radius,
    '#cfg-company': config.company,
    '#cfg-employee': config.employee,
    '#cfg-matricula': config.matricula,
    '#cfg-role': config.role,
    '#cfg-sector': config.sector,
    '#cfg-start': config.expectedStart,
    '#cfg-end': config.expectedEnd,
    '#cfg-break-start': config.breakStart,
    '#cfg-break-end': config.breakEnd,
    '#cfg-schedule': config.schedule
  };
  Object.entries(fields).forEach(([selector, value]) => {
    const input = $(selector);
    if (input) input.value = value;
  });
}

function saveSettings(event) {
  event.preventDefault();

  const toNumber = (value) => {
    const parsed = parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const lat = toNumber($('#cfg-lat').value);
  const lng = toNumber($('#cfg-lng').value);

  if ((lat === null) !== (lng === null)) {
    toast('Informe latitude e longitude juntas.');
    return;
  }
  if (lat !== null && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
    toast('Coordenadas inválidas.');
    return;
  }

  const radius = Math.min(10000, Math.max(10, parseInt($('#cfg-radius').value, 10) || 150));

  state.config = {
    ...state.config,
    placeName: $('#cfg-place').value.trim() || 'Local de trabalho',
    lat,
    lng,
    radius,
    company: $('#cfg-company').value.trim(),
    employee: $('#cfg-employee').value.trim(),
    matricula: $('#cfg-matricula').value.trim(),
    role: $('#cfg-role').value.trim(),
    sector: $('#cfg-sector').value.trim(),
    expectedStart: $('#cfg-start').value || '07:00',
    expectedEnd: $('#cfg-end').value || '15:00',
    breakStart: $('#cfg-break-start').value || '12:00',
    breakEnd: $('#cfg-break-end').value || '13:00',
    schedule: $('#cfg-schedule').value.trim()
  };
  saveState();

  stopGeo();
  geo = { phase: 'idle', lat: null, lng: null, accuracy: null, distance: null, inside: false, error: null, at: null };
  startGeo();
  refreshAll();
  toast('Configurações salvas');
}

function capturePlace() {
  const hint = $('#gpsHint');
  if (!('geolocation' in navigator)) {
    hint.textContent = 'Geolocalização não suportada neste navegador.';
    return;
  }
  hint.textContent = 'Obtendo sua localização…';
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude, accuracy } = position.coords;
    $('#cfg-lat').value = latitude.toFixed(6);
    $('#cfg-lng').value = longitude.toFixed(6);
    hint.textContent = `Localização capturada com precisão de ±${Math.round(accuracy)} m. Toque em Salvar para usar este ponto.`;
  }, (error) => {
    hint.textContent = geoErrorMessage(error);
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

/* ---------- eventos ---------- */

function refreshAll() {
  renderStatus();
  renderToday();
  renderDays();
  renderCard();
}

function onTodayChange(event) {
  const input = event.target.closest('input[data-time]');
  if (!input) return;

  const punch = state.punches.find((item) => item.id === input.dataset.time);
  if (!punch) return;

  const [hours, minutes] = input.value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;

  const date = new Date(punch.ts);
  date.setHours(hours, minutes, 0, 0);
  punch.ts = date.toISOString();
  saveState();
  refreshAll();
  toast('Horário atualizado');
}

function onTodayClick(event) {
  const button = event.target.closest('[data-del]');
  if (!button) return;
  const punch = state.punches.find((item) => item.id === button.dataset.del);
  if (!punch) return;
  const when = new Date(punch.ts);
  if (!confirm(`Excluir o registro de ${fmtTime(when)}?`)) return;
  state.punches = state.punches.filter((item) => item.id !== punch.id);
  saveState();
  refreshAll();
  toast('Registro excluído');
}

function onDaysClick(event) {
  const target = event.target;

  const edit = target.closest('[data-edit]');
  if (edit) {
    openDay = openDay === edit.dataset.edit ? null : edit.dataset.edit;
    renderDays();
    return;
  }

  const save = target.closest('[data-save]');
  if (save) {
    saveDayFromEditor(save.dataset.save);
    return;
  }

  const nowButton = target.closest('[data-now]');
  if (nowButton) {
    const editor = nowButton.closest('[data-editor]');
    if (editor) fillNowSlot(editor, nowButton.dataset.now);
    return;
  }

  const clear = target.closest('[data-clear]');
  if (clear) {
    const key = clear.dataset.clear;
    if (!confirm('Limpar todos os registros deste dia?')) return;
    state.punches = state.punches.filter((punch) => punch.dateKey !== key);
    saveState();
    refreshAll();
    toast('Dia limpo');
  }
}

function init() {
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));

  $('#punchBtn').addEventListener('click', handlePunch);
  $('#settingsForm').addEventListener('submit', saveSettings);
  $('#useGps').addEventListener('click', capturePlace);

  $('#prevMonth').addEventListener('click', () => shiftMonth(-1));
  $('#nextMonth').addEventListener('click', () => shiftMonth(1));
  $('#daysPrev').addEventListener('click', () => shiftMonth(-1));
  $('#daysNext').addEventListener('click', () => shiftMonth(1));

  $('#includeProof').addEventListener('change', renderCard);
  $('#printBtn').addEventListener('click', printCard);

  $('#todayList').addEventListener('change', onTodayChange);
  $('#todayList').addEventListener('click', onTodayClick);
  $('#daysRoot').addEventListener('click', onDaysClick);

  const tick = () => {
    const clock = $('#clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString('pt-BR');
  };
  tick();
  setInterval(tick, 1000);

  fillSettings();
  refreshAll();
  startGeo();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopGeo();
    else startGeo();
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker não registrado', error));
  }
}

document.addEventListener('DOMContentLoaded', init);
