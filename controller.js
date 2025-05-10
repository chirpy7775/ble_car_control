/*
Основной файл логики веб-приложения
Реализует управление BLE подключением, обработку взаимодействий с джойстиками, отправку команд на устройство, PWA установку.
*/

import {
  defaultSteering,
  defaultReverse,
  bluetoothConfig,
  timingConfig,
  batteryConfig,
  defaultEchoThreshold,
  defaultDisconnectTimeout,
  defaultCenterSteering,
  defaultSwapControls,
  defaultTheme,
} from './config.js';

import {
  themes,
  paramConfigs,
  languages,
  availableLanguages,
  t,
} from './foundation.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('ServiceWorker registered');
      })
      .catch(err => {
        console.error('ServiceWorker registration failed:', err);
      });
  });
}

let deferredPrompt;


window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installSection = document.getElementById('install-section');
  if (installSection) installSection.style.display = 'block';
});

document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  
  try {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      const installSection = document.getElementById('install-section');
      if (installSection) installSection.style.display = 'none';
    }
  } catch (err) {
    console.error('Install failed:', err);
  } finally {
    deferredPrompt = null;
  }
});

const storedLang  = localStorage.getItem('selectedLang');
let currentLang   =
  storedLang && availableLanguages.includes(storedLang)
    ? storedLang
    : (navigator.language.split('-')[0] in languages
        ? navigator.language.split('-')[0]
        : 'en');


function populateLanguageOptions() {
  const sel = $('lang-select');
  sel.innerHTML = '';
  for (const code of availableLanguages) {
    const opt = document.createElement('option');
    opt.value       = code;
    opt.textContent = languages[code].nativeName;
    if (code === currentLang) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', e => {
    currentLang = e.target.value;
    localStorage.setItem('selectedLang', currentLang);
    applyTranslations();
  });
}

function applyTranslations() {
  document.title = t(currentLang, 'appTitle');

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key  = el.dataset.i18n;
    const text = t(currentLang, key);
    if (!text) return;

    if (el.tagName === 'INPUT' &&
        ['button', 'submit'].includes(el.type)) {
      el.value = text;
    } else {
      el.textContent = text;
    }
  });

  btBtn.textContent = isConnected
    ? t(currentLang, 'connected')
    : t(currentLang, 'connect');

  generateParamFields(); 
  initParamInputs();    
}


function generateParamFields() {
  const container = document.getElementById('params-container');
  container.innerHTML = '';

  Object.entries(paramConfigs).forEach(([id, cfg]) => {
    const field = document.createElement('div');
    field.className = 'field';

    const label = document.createElement('label');
    label.textContent = t(currentLang, cfg.labelKey);

    const input = document.createElement('input');
    input.type  = 'number';
    input.id    = id;
    input.min   = cfg.min;
    input.max   = cfg.max;
    input.step  = cfg.step || 1;
    input.value = paramValues[id] ?? cfg.default;

    field.appendChild(label);
    field.appendChild(input);
    container.appendChild(field);
  });
}

const $ = id => document.getElementById(id);

let notificationBuffer = '';


// UI elements
const btBtn       = $('bt-btn');
const settingsBtn = $('settings-btn');
const modal       = $('settings-modal');
const closeBtn    = modal.querySelector('.close');
const minInput    = $('min-angle');
const maxInput    = $('max-angle');
const invertChk   = $('invert-steering-checkbox');
const saveBtn     = $('save-settings');
const resetBtn    = $('reset-settings');

const steerPad    = $('steering');
const throttlePad = $('throttle');
const steerVal    = $('steering-value');
const thrVal      = $('throttle-value');
const revBox      = $('reverse-checkbox');
const batteryContainer = $('battery-container');
const batteryPercent   = $('battery-percent');
const batteryVoltage   = $('battery-voltage');

const steerInd    = steerPad.querySelector('.indicator');
const thrInd      = throttlePad.querySelector('.indicator');
const swapChkBox = $('swap-controls-checkbox');
const themeContainer = document.getElementById('theme-selector');


const centerSteeringChk = $('center-steering-checkbox');
const controlsDiv = $('controls');

let paramInputs = {};
Object.keys(paramConfigs).forEach(id => { paramInputs[id] = $(id); });

// State
let steeringConfig    = { ...defaultSteering };
let reverseMode       = defaultReverse;
let centerSteering = defaultCenterSteering;
let swapControls = defaultSwapControls;
let currentTheme = defaultTheme;
let paramValues = {};
for (const [id, cfg] of Object.entries(paramConfigs)) {
  paramValues[id] = cfg.default;
}

let controlsEnabled = true;

// BLE state
let btChar       = null;
let sendInterval = null;
let lastSteer    = Math.round((steeringConfig.min + steeringConfig.max) / 2);
let lastThr      = 0;
let isConnected  = false;
let queue        = [];
let sending      = false;
let lastSent     = 0;

const pendingAcks = [];

function applyTheme(themeName) {
  const theme = themes[themeName];
  if (!theme) return;
  
  currentTheme = themeName;
  localStorage.setItem('selectedTheme', themeName);
  
  const root = document.documentElement;
  Object.entries(theme).forEach(([varName, value]) => {
    root.style.setProperty(varName, value);
  });
  
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.theme === themeName);
  });
}

function createThemeOptions() {
  themeContainer.innerHTML = '';
  Object.entries(themes).forEach(([themeName, theme]) => {
    const div = document.createElement('div');
    div.className = 'theme-option';
    div.dataset.theme = themeName;
    div.style.backgroundColor = theme['--bg-color'];
    div.style.borderColor = theme['--text-color'];
    div.addEventListener('click', () => applyTheme(themeName));
    themeContainer.appendChild(div);
  });
}


function initParamInputs() {
  Object.keys(paramConfigs).forEach(id => {
    paramInputs[id] = document.getElementById(id);
  });
}

(function loadConfigs() {
  try {
    const s = JSON.parse(localStorage.getItem('steeringConfig'));
    if (s.min < s.max && typeof s.invert === 'boolean') steeringConfig = s;
  } catch {}
  lastSteer = Math.round((steeringConfig.min + steeringConfig.max) / 2);
  steerVal.textContent = `${lastSteer}°`;
  try {
    const r = JSON.parse(localStorage.getItem('reverseMode'));
    if (typeof r === 'boolean') reverseMode = r;
  } catch {}

  revBox.checked = reverseMode;
  try {
    const c = JSON.parse(localStorage.getItem('centerSteering'));
    if (typeof c === 'boolean') centerSteering = c;
  } catch {}
  centerSteeringChk.checked = centerSteering;
  try {
    const s = JSON.parse(localStorage.getItem('swapControls'));
    if (typeof s === 'boolean') swapControls = s;
  } catch {}
  swapChkBox.checked = swapControls;
  controlsDiv.classList.toggle('swapped', swapControls);
  const savedTheme = localStorage.getItem('selectedTheme');
  if (savedTheme && themes[savedTheme]) {
    currentTheme = savedTheme;
  }
  applyTheme(currentTheme);
  try {
    for (const id of Object.keys(paramConfigs)) {
      const raw = parseInt(localStorage.getItem(id), 10);
      if (!Number.isNaN(raw)) {
        paramValues[id] = raw;
        if (paramInputs[id]) paramInputs[id].value = raw;
      }
    }
    generateParamFields();
    Object.keys(paramConfigs).forEach(id => {
      paramInputs[id] = $(id);
      if (paramInputs[id]) paramInputs[id].value = paramValues[id];
    });
  } catch(e) { console.error(e); }
})();

async function sendAllParams() {
  for (const [id, cfg] of Object.entries(paramConfigs)) {
    const v = paramValues[id];
    try {
      await sendConfigCommand(
        `${cfg.cmd}${v * cfg.multiplier}`,
        `${cfg.cmd} set`
      );
    } catch (e) {
      console.warn(`Не удалось отправить ${id}:`, e.message);
    }
  }
}

function saveSteeringConfig() {
  localStorage.setItem('steeringConfig', JSON.stringify(steeringConfig));
}
function saveReverseConfig() {
  localStorage.setItem('reverseMode', JSON.stringify(reverseMode));
}

function posSteer() {
  const { width, height } = steerPad.getBoundingClientRect();
  let rel = (lastSteer - steeringConfig.min) / (steeringConfig.max - steeringConfig.min);
  if (steeringConfig.invert) rel = 1 - rel;
  steerInd.style.left = `${rel * width}px`;
  steerInd.style.top  = `${height / 2}px`;
}
function posThr() {
  const { width, height } = throttlePad.getBoundingClientRect();
  let y = reverseMode
    ? height / 2 - (lastThr / 100) * (height / 2)
    : height - (lastThr / 100) * height;
  thrInd.style.left = `${width / 2}px`;
  thrInd.style.top  = `${y}px`;
}

function resetSteer() {
  lastSteer = Math.round((steeringConfig.min + steeringConfig.max) / 2);
  steerVal.textContent = `${lastSteer}°`;
  posSteer();
}


function handleNotification(event) {
  const raw = new TextDecoder().decode(event.target.value);
  console.log('BLE notif (raw):', raw);

  notificationBuffer += raw.replace(/\r/g, '\n');

  const parts = notificationBuffer.split('\n');
  notificationBuffer = parts.pop();

  for (const line of parts) {
    const l = line.trim();
    if (!l) continue;

    if (l.startsWith('ADC:')) {
      const rawVal = parseInt(l.slice(4), 10);
      if (!isNaN(rawVal)) {
        const { adcMultiplier, batteryMultiplier, minVoltage, maxVoltage } = batteryConfig;
        const battV = rawVal * adcMultiplier * batteryMultiplier;
        const pct   = Math.round(
          Math.max(0, Math.min(100,
            (battV - minVoltage) / (maxVoltage - minVoltage) * 100
          ))
        );
        batteryVoltage.textContent = battV.toFixed(2) + 'V';
        batteryPercent.textContent = pct + '%';
        batteryContainer.style.display = 'inline-flex';
      }
      continue;
    }

    for (let i = 0; i < pendingAcks.length; i++) {
      const { ackPrefix, resolve, timer } = pendingAcks[i];
      if (l === ackPrefix || l.startsWith(ackPrefix) || l.includes(ackPrefix)) {
        clearTimeout(timer);
        resolve(l);
        pendingAcks.splice(i, 1);
        break;
      }
    }
  }
}

function updateSteer(x) {
  if (!controlsEnabled) return;
  const { left, width } = steerPad.getBoundingClientRect();
  let rel = Math.min(1, Math.max(0, (x - left) / width));
  if (steeringConfig.invert) rel = 1 - rel;
  lastSteer = Math.round(steeringConfig.min + rel * (steeringConfig.max - steeringConfig.min));
  steerVal.textContent = `${lastSteer}°`;
  posSteer();
}
function updateThr(y) {
  if (!controlsEnabled) return;
  const { top, height } = throttlePad.getBoundingClientRect();
  let posY = Math.min(height, Math.max(0, y - top));
  if (reverseMode) {
    lastThr = Math.round(-100 * ((posY - height/2) / (height/2)));
  } else {
    lastThr = Math.round(100 * ((height - posY) / height));
  }
  thrVal.textContent = `${lastThr}%`;
  posThr();
}
function resetThr() {
  lastThr = 0;
  thrVal.textContent = '0%';
  posThr();
}

['resize','orientationchange'].forEach(evt=>
  window.addEventListener(evt, ()=>{ posSteer(); posThr(); })
);


throttlePad.addEventListener('mousedown', e => {
  e.preventDefault();
  updateThr(e.clientY);
  const mv = ev => updateThr(ev.clientY);
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', () => {
    resetThr();
    document.removeEventListener('mousemove', mv);
  }, { once: true });
});
steerPad.addEventListener('mousedown', e => {
  e.preventDefault();
  updateSteer(e.clientX);
  const mv = ev => updateSteer(ev.clientX);
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', () => {
    if (centerSteering) resetSteer();
    document.removeEventListener('mousemove', mv);
  }, { once: true });
});
steerPad.addEventListener('touchend', e => {
  e.preventDefault();
  if (centerSteering) resetSteer();
});
steerPad.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = Array.from(e.targetTouches).find(t => t.target === steerPad);
  if (touch) updateSteer(touch.clientX);
});
steerPad.addEventListener('touchmove', e => {
  e.preventDefault();
  const touch = Array.from(e.targetTouches).find(t => t.target === steerPad);
  if (touch) updateSteer(touch.clientX);
});

function handleTouchStart(e) {
  e.preventDefault();
  Array.from(e.touches).forEach(touch => {
    const target = touch.target.closest('#steering, #throttle');
    if (!target) return;
    
    if (target.id === 'steering') {
      updateSteer(touch.clientX);
    } else if (target.id === 'throttle') {
      updateThr(touch.clientY);
    }
  });
}

function handleTouchMove(e) {
  e.preventDefault();
  Array.from(e.touches).forEach(touch => {
    const target = touch.target.closest('#steering, #throttle');
    if (!target) return;

    if (target.id === 'steering') {
      updateSteer(touch.clientX);
    } else if (target.id === 'throttle') {
      updateThr(touch.clientY);
    }
  });
}

function handleTouchEnd(e) {
  Array.from(e.changedTouches).forEach(touch => {
    const target = touch.target.closest('#steering, #throttle');
    if (!target) return;

    if (target.id === 'steering' && centerSteering) {
      resetSteer();
    } else if (target.id === 'throttle') {
      resetThr();
    }
  });
}

steerPad.addEventListener('touchstart', handleTouchStart);
steerPad.addEventListener('touchmove', handleTouchMove);
steerPad.addEventListener('touchend', handleTouchEnd);
steerPad.addEventListener('touchcancel', handleTouchEnd);

throttlePad.addEventListener('touchstart', handleTouchStart);
throttlePad.addEventListener('touchmove', handleTouchMove);
throttlePad.addEventListener('touchend', handleTouchEnd);
throttlePad.addEventListener('touchcancel', handleTouchEnd);


function processQueue() {
  if (!btChar || sending || !queue.length) return;
  sending = true;
  const delay = Math.max(0, 1 - (Date.now() - lastSent));
  setTimeout(()=>{
    const cmd = queue.shift();
    if (typeof cmd !== 'string') {
      sending = false;
      return;
    }
    btChar.writeValueWithoutResponse(new TextEncoder().encode(cmd + '\r'))
      .then(()=>{
        lastSent = Date.now(); sending = false;
        if (queue.length) processQueue();
      })
      .catch(()=> sending = false);
  }, delay);
}

function sendCmds() {
  if (!controlsEnabled) return;
  const steerValue = Math.max(steeringConfig.min, 
    Math.min(steeringConfig.max, lastSteer));
  const thrValue = Math.max(-100, Math.min(100, lastThr));

  if (queue.length > timingConfig.maxQueueLength) {
    console.warn('Queue overflow, resetting');
    queue = [];
  }
  queue.push(`s${lastSteer}`);
  queue.push(reverseMode
    ? (lastThr>0 ? `t${lastThr}` : lastThr<0 ? `b${-lastThr}` : 't0')
    : `t${lastThr}`);
  processQueue();
}

function sendConfigCommand(cmd, ackPrefix) {
  if (!btChar) return Promise.reject(new Error('Не подключено'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = pendingAcks.findIndex(p => p.ackPrefix === ackPrefix);
      if (idx >= 0) pendingAcks.splice(idx, 1);
      reject(new Error(`Нет ответа "${ackPrefix}"`));
    }, 3000);

    pendingAcks.push({ ackPrefix, resolve, timer });
    btChar.writeValueWithoutResponse(new TextEncoder().encode(cmd + '\r'));
  });
}


async function onConnect() {
  isConnected = true;
  btBtn.textContent = t(currentLang, 'connected');
  btBtn.disabled = false;
  btChar.addEventListener('characteristicvaluechanged', handleNotification);
  try { await sendAllParams(); } catch (_) {}
  sendInterval = setInterval(sendCmds, timingConfig.sendIntervalMs);
}

function onDisconnect() {
  isConnected = false;
  btBtn.textContent = t(currentLang, 'connect');
  clearInterval(sendInterval);
  resetThr();
  lastSteer = Math.round((steeringConfig.min + steeringConfig.max) / 2);
  steerVal.textContent = `${lastSteer}°`;
  posSteer();
  batteryContainer.style.display = 'none';
}
btBtn.addEventListener('click', async ()=>{
  if (isConnected) return;
  btBtn.disabled = true;
  try {
    const dev = await navigator.bluetooth.requestDevice({ filters:[{services:[bluetoothConfig.serviceId]}] });
    const srv = await dev.gatt.connect();
    const svc = await srv.getPrimaryService(bluetoothConfig.serviceId);
    btChar = await svc.getCharacteristic(bluetoothConfig.charTxId);
    await btChar.startNotifications();
    dev.addEventListener('gattserverdisconnected', onDisconnect);
    onConnect();
  } catch {
    btBtn.disabled = false;
  }
});

settingsBtn.addEventListener('click', ()=>{
  controlsEnabled = false;
  resetThr();
  queue.length = 0;

  minInput.value         = steeringConfig.min;
  maxInput.value         = steeringConfig.max;
  invertChk.checked      = steeringConfig.invert;
  revBox.checked = reverseMode;

  modal.style.display    = 'flex';
  const installSection = document.getElementById('install-section');
  if (installSection) {
    installSection.style.display = deferredPrompt ? 'block' : 'none';
  }
});
closeBtn.addEventListener('click', ()=>{ modal.style.display = 'none'; controlsEnabled = true; });
modal.addEventListener('click', e=>{
  if (e.target === modal) { modal.style.display = 'none'; controlsEnabled = true; }
});

saveBtn.addEventListener('click', async () => {
  const min = parseInt(minInput.value, 10);
  const max = parseInt(maxInput.value, 10);
  const inv = invertChk.checked;

  if (Number.isNaN(min) || Number.isNaN(max) || min >= max) {
    alert( t(currentLang, 'errorMinMax') );
    return;
  }

  for (const [id, cfg] of Object.entries(paramConfigs)) {
    const val = parseInt(paramInputs[id].value, 10);
    if (Number.isNaN(val) || !Number.isInteger(val) ||
        val < cfg.min || val > cfg.max) {
      alert( t(currentLang, 'errorParamRange',
               t(currentLang, cfg.labelKey),
               cfg.min, cfg.max) );
      return;
    }
    paramValues[id] = val;
  }

  for (const id of Object.keys(paramConfigs)) {
    localStorage.setItem(id, paramValues[id]);
  }
  reverseMode = revBox.checked;
  saveReverseConfig();
  steeringConfig = { min, max, invert: inv };
  saveSteeringConfig();
  lastSteer = Math.round((min + max)/2);
  steerVal.textContent = `${lastSteer}°`;
  posSteer();

  swapControls = swapChkBox.checked;
  localStorage.setItem('swapControls', JSON.stringify(swapControls));
  controlsDiv.classList.toggle('swapped', swapControls);

  centerSteering = centerSteeringChk.checked;
  localStorage.setItem('centerSteering', JSON.stringify(centerSteering));
  localStorage.setItem('selectedTheme', currentTheme);


  if (isConnected && btChar) {
    saveBtn.disabled = true;
    try {
      await sendAllParams();
      modal.style.display = 'none';
      resetThr();
    } catch (err) {
      alert('Ошибка при отправке настроек:\n' + err.message);
    } finally {
      saveBtn.disabled = false;
      controlsEnabled = true;
    }
  } else {
    modal.style.display = 'none';
    controlsEnabled = true;
    resetThr();
  }
});

resetBtn.addEventListener('click', ()=>{
  minInput.value = defaultSteering.min;
  maxInput.value = defaultSteering.max;
  invertChk.checked = defaultSteering.invert;
  centerSteeringChk.checked = defaultCenterSteering;
  swapChkBox.checked = defaultSwapControls;
  revBox.checked = defaultReverse;

  localStorage.removeItem('steeringConfig');
  localStorage.removeItem('reverseMode');
  localStorage.removeItem('centerSteering');
  localStorage.removeItem('swapControls');
  localStorage.removeItem('reverseMode');

  for (const [id, cfg] of Object.entries(paramConfigs)) {
    paramInputs[id].value = cfg.default;
    localStorage.removeItem(id);
    paramValues[id] = cfg.default;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  createThemeOptions();
  populateLanguageOptions();  
  applyTheme(currentTheme);
  applyTranslations();  
  resetThr();
  posSteer();
});

resetThr();
posSteer();
