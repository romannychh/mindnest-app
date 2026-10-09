// Состояние пользователя: localStorage + зеркало в Telegram CloudStorage.
// ВАЖНО: это клиентское хранилище, его можно подделать. Для продакшена баланс
// должен считаться на сервере (см. README, раздел «Что дальше»).
import { CONFIG } from './config.js';
import { LEVELS } from './data.js';

const KEY = 'mindnest_state_v1';
const E = CONFIG.economy;

export const dateStr = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const today = () => dateStr(0);

const defaults = () => ({
  v: 1,
  onboarded: false,
  balance: 0,
  totalEarned: 0,
  taps: 0,
  energy: E.energyBase,
  energyTs: Date.now(),
  boosts: { multitap: 0, capacity: 0 },
  refills: { date: '', used: 0 },
  streak: { last: '', day: 0 },
  mood: { date: '', value: 0, history: [] },
  tasks: {},
  lead: null,
  purchases: [],
  favs: [],
  savedAt: 0,
});

export const S = defaults();

function hydrate(obj = {}) {
  const d = defaults();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d, obj);
  for (const k of Object.keys(d)) {
    if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && obj[k]) S[k] = { ...d[k], ...obj[k] };
  }
}

try {
  const raw = localStorage.getItem(KEY);
  if (raw) hydrate(JSON.parse(raw));
} catch (e) { /* приватный режим */ }

// ---------- сохранение ----------
let timer = null;
let cloudTimer = null;

export function save() {
  S.savedAt = Date.now();
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

export function flush() {
  clearTimeout(timer);
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(cloudPush, 2500);
}

function cloud() {
  const tg = window.Telegram?.WebApp;
  try { return tg?.initData && tg.isVersionAtLeast('6.9') ? tg.CloudStorage : null; } catch (e) { return null; }
}

function cloudPush() {
  const cs = cloud();
  if (!cs) return;
  try { cs.setItem(KEY, JSON.stringify(S), () => {}); } catch (e) {}
}

// Подтягиваем прогресс с другого устройства, если он свежее локального
export function cloudPull(onUpdate) {
  const cs = cloud();
  if (!cs) return;
  try {
    cs.getItem(KEY, (err, val) => {
      if (err || !val) return;
      try {
        const remote = JSON.parse(val);
        if ((remote.savedAt || 0) > (S.savedAt || 0)) {
          hydrate(remote);
          localStorage.setItem(KEY, JSON.stringify(S));
          onUpdate?.();
        }
      } catch (e) {}
    });
  } catch (e) {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { flush(); cloudPush(); }
});

export function resetState() {
  try { localStorage.removeItem(KEY); } catch (e) {}
  hydrate({});
  S.onboarded = true;
  flush();
}

// ---------- экономика ----------
export const maxEnergy = () => E.energyBase + E.energyPerLevel * S.boosts.capacity;
export const tapPower = () => 1 + S.boosts.multitap;

export function syncEnergy() {
  const now = Date.now();
  const dt = Math.max(0, (now - S.energyTs) / 1000);
  S.energy = Math.min(maxEnergy(), S.energy + dt * E.regenPerSec);
  S.energyTs = now;
  return S.energy;
}

export function earn(n) {
  S.balance += n;
  S.totalEarned += n;
  save();
}

export function spend(n) {
  if (S.balance < n) return false;
  S.balance -= n;
  save();
  return true;
}

export const BOOSTS = {
  multitap: { title: 'Мультитап', icon: 'sparkle', base: 500, max: 10, desc: (l) => `+1 искра за тап (сейчас ${1 + l})` },
  capacity: { title: 'Запас энергии', icon: 'bolt', base: 400, max: 10, desc: (l) => `+${E.energyPerLevel} к энергии (сейчас ${E.energyBase + E.energyPerLevel * l})` },
};
export const boostCost = (k) => BOOSTS[k].base * 2 ** S.boosts[k];

export function refillsLeft() {
  if (S.refills.date !== today()) return E.refillsPerDay;
  return Math.max(0, E.refillsPerDay - S.refills.used);
}

export function levelInfo(total = S.totalEarned) {
  let i = 0;
  while (i < LEVELS.length - 1 && total >= LEVELS[i + 1].at) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  const progress = next ? (total - cur.at) / (next.at - cur.at) : 1;
  return { i: i + 1, name: cur.name, next, progress };
}
