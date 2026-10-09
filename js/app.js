import { CONFIG } from './config.js';
import {
  CATEGORIES, COURSES, AUTHORS, REVIEWS, SHOP_CATS, SHOP, QUIZ, QUIZ_OPTIONS, QUIZ_RESULTS,
  GUIDE, INSIGHTS, MOODS, ONBOARDING,
} from './data.js';
import { icon } from './icons.js';
import { scene } from './art.js';
import {
  S, save, flush, earn, spend, syncEnergy, maxEnergy, tapPower, levelInfo, today, dateStr,
  BOOSTS, boostCost, refillsLeft, resetState, cloudPull,
} from './store.js';
import {
  inTelegram, initTelegram, haptic, notify, tgUser, openLink, setBackButton, shareLink,
  startParam, tryBrowserFullscreen,
} from './telegram.js';

// ============================================================ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');
const nav = $('#nav');
const C = CONFIG.currency.sign;
const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');
const rub = (n) => n.toLocaleString('ru-RU') + ' ₽';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, f) => { n = Math.abs(n) % 100; const d = n % 10; if (n > 10 && n < 20) return f[2]; if (d > 1 && d < 5) return f[1]; if (d === 1) return f[0]; return f[2]; };
const sparks = (n) => `${fmt(n)} ${plural(Math.floor(n), CONFIG.currency.forms)}`;
const managerUrl = (text) => `https://t.me/${CONFIG.links.manager}?text=${encodeURIComponent(text)}`;
const genCode = (prefix) => prefix + '-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

function toast(html, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = html;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2400);
  setTimeout(() => el.remove(), 2800);
}

let sheetTimer = null;
function openSheet(html) {
  const root = $('#sheet-root');
  clearTimeout(sheetTimer);
  root.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
  void root.offsetWidth; // фиксируем стартовое положение, чтобы сработала анимация
  root.classList.add('open');
}
function closeSheet() {
  const root = $('#sheet-root');
  if (!root.innerHTML) return;
  root.classList.remove('open');
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => (root.innerHTML = ''), 260);
}

function copy(text) {
  const done = () => { toast(`${icon('check')} Скопировано`); haptic('light'); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) {}
  ta.remove();
}

function refreshBalance() {
  $$('[data-bal]').forEach((el) => (el.textContent = fmt(S.balance)));
}

function reward(n, why) {
  earn(n);
  refreshBalance();
  notify('success');
  toast(`<span class="spark">${C}</span> +${fmt(n)} · ${why}`, 'gold');
}

// ============================================================ user
function user() {
  const t = tgUser();
  const name = S.lead?.name || t?.first_name || 'Гость';
  return { name, username: t?.username || '', photo: t?.photo_url || '', id: t?.id || null };
}
function avatar(cls = '') {
  const u = user();
  return u.photo
    ? `<img class="ava ${cls}" src="${esc(u.photo)}" alt="">`
    : `<div class="ava ${cls}">${esc((u.name[0] || '?').toUpperCase())}</div>`;
}
const faces = () => ['#c9a37a', '#8f7a63', '#b88c6a'].map((c, i) => `<i style="background:${c}">${'МОК'[i]}</i>`).join('');

// ============================================================ gift promo (дожим после лид-магнита)
const giftLeftMs = () => (S.lead ? S.lead.at + CONFIG.giftPromo.hours * 3600e3 - Date.now() : 0);
const giftActive = () => giftLeftMs() > 0;
function fmtLeft(ms) {
  if (ms <= 0) return 'истёк';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
setInterval(() => { const t = fmtLeft(giftLeftMs()); $$('[data-gift-timer]').forEach((el) => (el.textContent = t)); }, 1000);

// ============================================================ router
const ROOT = ['home', 'courses', 'tap', 'shop', 'profile'];
let route = { name: 'home', params: {} };
let stack = [];
let cleanup = null;

function go(name, params = {}, { replace = false } = {}) {
  if (ROOT.includes(name)) stack = [];
  else if (!replace && route.name !== 'onboarding') stack.push(route);
  route = { name, params };
  render();
  view.scrollTop = 0;
}
function back() {
  if (stack.length) { route = stack.pop(); render(); view.scrollTop = 0; }
  else go('home');
}

function render() {
  cleanup?.();
  cleanup = null;
  closeSheet();
  const scr = SCREENS[route.name] || SCREENS.home;
  view.dataset.screen = route.name;
  view.innerHTML = scr.html(route.params || {});
  const isRoot = ROOT.includes(route.name);
  document.body.classList.toggle('no-nav', !isRoot);
  $$('[data-tab]', nav).forEach((b) => b.classList.toggle('active', b.dataset.tab === route.name));
  setBackButton(!isRoot && route.name !== 'onboarding', () => ACTIONS.back());
  cleanup = scr.mount?.(route.params || {}) || null;
}

// ============================================================ shared UI
const balanceChip = () => `<button class="chip-bal" data-action="go" data-to="tap" aria-label="Баланс"><span class="spark">${C}</span><b data-bal>${fmt(S.balance)}</b></button>`;
const topbar = (title, sub = '') => `<header class="top"><div><h1 class="h1">${title}</h1>${sub ? `<p class="muted sm">${sub}</p>` : ''}</div>${balanceChip()}</header>`;
const subTop = (title) => `<header class="top sub"><button class="icon-btn page-back" data-action="back" aria-label="Назад">${icon('arrow-left')}</button><h2 class="h2">${title}</h2><span class="icon-btn ghost"></span></header>`;
const secHead = (title, link = '') => `<div class="sec-head"><h3>${title}</h3>${link}</div>`;
const logo = () => `<div class="logo"><span class="logo-mark">Ψ</span><div><b>${CONFIG.school.name}</b><small>${CONFIG.school.tagline}</small></div></div>`;

function courseMini(c) {
  return `<button class="course-mini" data-action="go" data-to="course" data-id="${c.id}">
    <div class="cm-art">${scene(c.art)}</div>
    <div class="cm-title">${c.title}</div>
    <div class="cm-meta">${rub(c.price)}</div>
  </button>`;
}

function courseCard(c) {
  const a = AUTHORS[c.author];
  return `<button class="course-card" data-action="go" data-to="course" data-id="${c.id}">
    <div class="cc-art">${scene(c.art)}${c.tag ? `<span class="tag">${c.tag}</span>` : ''}</div>
    <div class="cc-body">
      <div class="cc-title">${c.title}</div>
      <div class="muted sm">${c.subtitle}</div>
      <div class="cc-foot">
        <span class="cc-author"><i class="mini-ava">${a.initials}</i>${a.name}</span>
        <span class="cc-price">${rub(c.price)}</span>
      </div>
    </div>
  </button>`;
}

// ============================================================ tasks / daily
function streakNextDay() {
  if (S.streak.last === today()) return S.streak.day;
  return S.streak.last === dateStr(-1) ? Math.min(S.streak.day + 1, 7) : 1;
}
const streakReward = () => CONFIG.rewards.streakBase * streakNextDay();

function tasks() {
  const R = CONFIG.rewards;
  const t = today();
  return [
    { id: 'daily', icon: 'flame', title: `Ежедневный бонус · день ${streakNextDay()}`, reward: streakReward(), done: S.streak.last === t, action: 'claim-daily' },
    { id: 'quiz', icon: 'gift', title: 'Пройди тест на тревожность', reward: R.quiz, done: !!S.lead, action: 'go', to: 'quiz' },
    { id: 'mood', icon: 'sun', title: 'Отметь настроение сегодня', reward: R.mood, done: S.mood.date === t, action: 'scroll-mood' },
    { id: 'breath', icon: 'wind', title: 'Сделай дыхание 4-7-8', reward: R.breath, done: S.tasks.breath === t, action: 'go', to: 'breathing' },
    { id: 'channel', icon: 'send', title: 'Подпишись на канал школы', reward: R.channel, done: !!S.tasks.channel, action: 'task-channel' },
    { id: 'invite', icon: 'users', title: 'Пригласи друга', reward: R.invite, done: !!S.tasks.invite, action: 'invite' },
  ];
}

function tasksList() {
  return `<div class="list">${tasks().map((t) => `
    <button class="row ${t.done ? 'done' : ''}" ${t.done ? 'disabled' : `data-action="${t.action}" ${t.to ? `data-to="${t.to}"` : ''}`}>
      <span class="row-ico">${icon(t.icon)}</span>
      <span class="row-main"><span class="row-title">${t.title}</span><span class="row-sub"><span class="spark">${C}</span> +${fmt(t.reward)}</span></span>
      <span class="row-end">${t.done ? icon('check') : icon('chevron-right')}</span>
    </button>`).join('')}</div>`;
}

function moodWidget() {
  const t = today();
  if (S.mood.date === t) {
    const m = MOODS.find((x) => x.v === S.mood.value);
    return `<div class="card mood done" id="mood"><span class="mood-big">${m.e}</span><div><div class="muted xs">Твоё настроение сегодня</div><b>${m.label}</b><div class="muted xs">Завтра спрошу снова. Так копится картина недели.</div></div></div>`;
  }
  return `<div class="card mood" id="mood">
    <div class="mood-head"><b>Как ты сейчас?</b><span class="muted xs"><span class="spark">${C}</span> +${CONFIG.rewards.mood}</span></div>
    <div class="mood-row">${MOODS.map((m) => `<button class="mood-btn" data-action="mood" data-v="${m.v}"><span>${m.e}</span><small>${m.label}</small></button>`).join('')}</div>
  </div>`;
}

// ============================================================ quiz state (лид-магнит)
const quiz = { step: 'intro', i: 0, answers: [] };
const quizScore = () => quiz.answers.reduce((a, b) => a + b, 0);
const resultFor = (score) => QUIZ_RESULTS.find((r) => score <= r.max) || QUIZ_RESULTS[QUIZ_RESULTS.length - 1];

async function sendLead(lead) {
  if (!CONFIG.leadsWebhook) return false;
  try {
    // text/plain = «простой» CORS-запрос без preflight, подходит для Google Apps Script / n8n / Make
    await fetch(CONFIG.leadsWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        ...lead,
        source: 'anxiety_test',
        tg_user: tgUser(),
        init_data: window.Telegram?.WebApp?.initData || '', // для проверки подписи на сервере
        ref: startParam(),
        ua: navigator.userAgent,
      }),
    });
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================ screens
let obStep = 0;
let insightAt = 0;

const SCREENS = {
  // ---------------------------------------------------------- онбординг
  onboarding: {
    html() {
      const s = ONBOARDING[obStep];
      const last = obStep === ONBOARDING.length - 1;
      return `<div class="ob">
        <div class="ob-art">${s.orb ? `<div class="ob-orb"><div class="orb-wrap demo"><div class="ring r1"></div><div class="ring r2"></div><div class="orb"><span class="psi">Ψ</span></div></div></div>` : scene(s.art)}<div class="ob-fade"></div></div>
        <div class="ob-brand">${logo()}</div>
        <div class="ob-body">
          <h1>${s.title}</h1>
          <p>${s.text}</p>
          <div class="dots">${ONBOARDING.map((_, j) => `<i class="${j === obStep ? 'on' : ''}"></i>`).join('')}</div>
          <button class="btn-pill" data-action="ob-next"><span>${last ? 'Начать' : 'Далее'}</span><span class="btn-pill-ico">${icon('arrow-right')}</span></button>
          <button class="link-muted ${last ? 'hidden' : ''}" data-action="ob-skip">Пропустить</button>
        </div>
      </div>`;
    },
  },

  // ---------------------------------------------------------- главная
  home: {
    html() {
      const u = user();
      const lv = levelInfo();
      const lead = !S.lead
        ? `<button class="card-lead" data-action="go" data-to="quiz">
            <div class="cl-top"><span class="pill-soft">${icon('gift')} Подарок</span><span class="cl-more">•••</span></div>
            <h2>Тест: насколько тревога управляет тобой</h2>
            <p>+ гид «5 техник против тревоги» и ${fmt(CONFIG.rewards.quiz)} ${C}</p>
            <div class="cl-bottom"><div class="faces">${faces()}</div><span class="xs">2 413 прошли</span><span class="round-arrow">${icon('arrow-right')}</span></div>
          </button>`
        : `<button class="card-lead" data-action="go" data-to="guide">
            <div class="cl-top"><span class="pill-soft">${icon('check')} Подарок получен</span></div>
            <h2>Гид: 5 техник против тревоги</h2>
            <p>${giftActive() ? `Код −${CONFIG.giftPromo.percent}% на курс сгорит через <b data-gift-timer>${fmtLeft(giftLeftMs())}</b>` : 'Открой и выбери технику на сегодня'}</p>
            <div class="cl-bottom"><span class="xs">Результат теста: ${resultFor(S.lead.score).title}</span><span class="round-arrow">${icon('arrow-right')}</span></div>
          </button>`;
      return `
        <header class="top">
          <div class="hello">${avatar()}<div><div class="muted xs">${S.onboarded && S.taps ? 'С возвращением,' : 'Добро пожаловать,'}</div><div class="name">${esc(u.name)}</div></div></div>
          ${balanceChip()}
        </header>
        <section class="hero-row">
          ${lead}
          <button class="card-side" data-action="go" data-to="tap">
            <div class="side-orb"><span class="psi">Ψ</span></div>
            <div class="xs muted">Ядро</div>
            <b class="sm">${lv.name}</b>
            <div class="bar thin"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
            <span class="round-arrow sm">${icon('arrow-right')}</span>
          </button>
        </section>
        ${moodWidget()}
        ${secHead('Направления', `<button class="link" data-action="go" data-to="courses">Все</button>`)}
        <div class="tiles">
          ${CATEGORIES.map((c) => `<button class="tile" data-action="go" data-to="courses" data-cat="${c.id}"><span class="tile-ico">${icon(c.icon)}</span><span>${c.title}</span></button>`).join('')}
        </div>
        ${secHead('Быстрые практики')}
        <div class="tools">
          <button class="tool" data-action="go" data-to="breathing">
            <div><b>Дыхание 4-7-8</b><p>Успокоиться за 2 минуты</p></div>
            <span class="round-arrow sm">${icon('arrow-right')}</span>
            <div class="tool-art breath-mini"><i></i><i></i><i></i></div>
          </button>
          <button class="tool" data-action="go" data-to="${S.lead ? 'guide' : 'quiz'}">
            <div><b>Гид: 5 техник</b><p>${S.lead ? 'Аптечка для нервов' : 'Откроется после теста'}</p></div>
            <span class="round-arrow sm">${icon(S.lead ? 'arrow-right' : 'lock')}</span>
            <div class="tool-art">${icon('layers', 'big')}</div>
          </button>
        </div>
        ${secHead('Заработать искры')}
        ${tasksList()}
        ${secHead('Популярные курсы', `<button class="link" data-action="go" data-to="courses">Все</button>`)}
        <div class="hscroll">${COURSES.map(courseMini).join('')}</div>`;
    },
  },

  // ---------------------------------------------------------- курсы
  courses: {
    html(p) {
      const cat = p.cat || 'all';
      const list = COURSES.filter((c) => cat === 'all' || c.cat === cat);
      return `${topbar('Курсы', 'Методы с доказанной эффективностью')}
        <div class="chips">${[{ id: 'all', title: 'Все' }, ...CATEGORIES].map((c) => `<button class="chip ${cat === c.id ? 'on' : ''}" data-action="go" data-to="courses" data-cat="${c.id}">${c.title}</button>`).join('')}</div>
        <div class="course-list">${list.length ? list.map(courseCard).join('') : '<p class="muted center">Скоро здесь появятся курсы</p>'}</div>`;
    },
  },

  course: {
    html(p) {
      const c = COURSES.find((x) => x.id === p.id) || COURSES[0];
      const a = AUTHORS[c.author];
      const tab = p.tab || 'program';
      const fav = S.favs.includes(c.id);
      const tabs = [['program', 'Программа'], ['format', 'Формат'], ['author', 'Автор'], ['reviews', 'Отзывы']];
      let body = '';
      if (tab === 'program') body = `<div class="modules">${c.modules.map((m, i) => `<div class="module"><span class="mod-n">${String(i + 1).padStart(2, '0')}</span><span>${m}</span></div>`).join('')}</div>`;
      if (tab === 'format') body = `<div class="list">${c.format.map((f) => `<div class="row static"><span class="row-ico">${icon('check')}</span><span class="row-main"><span class="row-title">${f}</span></span></div>`).join('')}</div>`;
      if (tab === 'author') body = `<div class="card author"><i class="mini-ava lg">${a.initials}</i><div><b>${a.name}</b><div class="muted sm">${a.role}</div><div class="muted xs">${a.exp}</div><p class="sm">${a.bio}</p></div></div>`;
      if (tab === 'reviews') body = REVIEWS.map((r) => `<div class="card review"><div class="stars">${'★★★★★'}</div><p class="sm">${r.text}</p><div class="muted xs">${r.name}</div></div>`).join('');
      return `
        <div class="detail-hero">
          ${scene(c.art)}
          <div class="hero-fade"></div>
          <div class="hero-actions"><button class="icon-btn page-back" data-action="back" aria-label="Назад">${icon('arrow-left')}</button><span></span><button class="icon-btn ${fav ? 'on' : ''}" data-action="fav" data-id="${c.id}" aria-label="В избранное">${icon('heart')}</button></div>
          <div class="hero-text">${c.tag ? `<span class="tag static">${c.tag}</span>` : ''}<h1>${c.title}</h1><p>${c.subtitle}</p></div>
        </div>
        <div class="pad">
          <div class="stats-row">
            <div><b>★ ${c.rating}</b><span>рейтинг</span></div>
            <div><b>${fmt(c.students)}</b><span>учеников</span></div>
            <div><b>${c.weeks} нед.</b><span>длительность</span></div>
          </div>
          <p class="lead-text">${c.desc}</p>
          <div class="chips">${tabs.map(([id, t]) => `<button class="chip ${tab === id ? 'on' : ''}" data-action="course-tab" data-tab="${id}">${t}</button>`).join('')}</div>
          <div class="tab-body">${body}</div>
          ${giftActive() ? `<div class="gift-note">${icon('gift')}<div>Твой код <b>${S.lead.promo}</b> даёт −${CONFIG.giftPromo.percent}% на этот курс. Сгорит через <b data-gift-timer>${fmtLeft(giftLeftMs())}</b></div></div>` : ''}
        </div>
        <div class="cta-bar">
          <div><div class="xs muted">Стоимость</div><b class="price">${rub(c.price)}</b> <s class="muted xs">${rub(c.oldPrice)}</s></div>
          <button class="btn primary" data-action="enroll" data-id="${c.id}">Записаться</button>
        </div>`;
    },
  },

  // ---------------------------------------------------------- тапалка
  tap: {
    html() {
      const lv = levelInfo();
      syncEnergy();
      return `
        <header class="top">
          <div class="hello">${avatar('sm')}<div><div class="muted xs">Уровень ${lv.i}</div><div class="name sm" id="lvName">${lv.name}</div></div></div>
          <button class="chip-soft" data-action="boosts">${icon('bolt')} Бусты</button>
        </header>
        <div class="tap-balance"><span class="spark big">${C}</span><b data-bal>${fmt(S.balance)}</b></div>
        <div class="lvl">
          <div class="lvl-row"><span class="muted xs" id="lvNext">${lv.next ? `до «${lv.next.name}»` : 'Максимальный уровень'}</span><span class="muted xs" id="lvNums">${lv.next ? `${fmt(S.totalEarned)} / ${fmt(lv.next.at)}` : fmt(S.totalEarned)}</span></div>
          <div class="bar"><i id="lvBar" style="width:${Math.round(lv.progress * 100)}%"></i></div>
        </div>
        <div class="insight" id="insight"></div>
        <div class="orb-stage">
          <div class="orb-wrap" id="orbWrap">
            <div class="ring r1"></div><div class="ring r2"></div>
            <div class="orb" id="orb" role="button" aria-label="Тапнуть ядро"><span class="psi">Ψ</span></div>
          </div>
        </div>
        <div class="tap-hint muted xs" id="tapHint">+${tapPower()} за касание · иногда случаются инсайты ×${CONFIG.economy.critMult}</div>
        <div class="energy">
          <span class="en-ico">${icon('bolt')}</span>
          <b id="en">${Math.floor(S.energy)}</b><span class="muted">/ <span id="enMax">${maxEnergy()}</span></span>
          <div class="bar"><i id="enBar" style="width:${(S.energy / maxEnergy()) * 100}%"></i></div>
        </div>
        <div class="tap-actions">
          <button class="tap-act" data-action="boosts"><span>${icon('refresh')}</span>Восстановить</button>
          <button class="tap-act" data-action="go" data-to="shop"><span>${icon('bag')}</span>Магазин</button>
          <button class="tap-act" data-action="invite"><span>${icon('users')}</span>Друзья</button>
        </div>`;
    },
    mount() {
      const orb = $('#orb');
      const wrap = $('#orbWrap');
      const enEl = $('#en'), enBar = $('#enBar'), enMax = $('#enMax');
      let lastLevel = levelInfo().i;
      let pressTimer = null;

      const updateEnergy = () => {
        syncEnergy();
        enEl.textContent = Math.floor(S.energy);
        enMax.textContent = maxEnergy();
        enBar.style.width = (S.energy / maxEnergy()) * 100 + '%';
        wrap.classList.toggle('tired', S.energy < tapPower());
      };
      const updateLevel = () => {
        const lv = levelInfo();
        $('#lvBar').style.width = Math.round(lv.progress * 100) + '%';
        $('#lvNums').textContent = lv.next ? `${fmt(S.totalEarned)} / ${fmt(lv.next.at)}` : fmt(S.totalEarned);
        if (lv.i !== lastLevel) {
          lastLevel = lv.i;
          $('#lvName').textContent = lv.name;
          $('#lvNext').textContent = lv.next ? `до «${lv.next.name}»` : 'Максимальный уровень';
          notify('success');
          toast(`${icon('trophy')} Новый уровень: <b>${lv.name}</b>`, 'gold');
        }
      };

      const floatAt = (x, y, text, crit) => {
        const f = document.createElement('span');
        f.className = 'float' + (crit ? ' crit' : '');
        f.textContent = text;
        f.style.left = x + 'px';
        f.style.top = y + 'px';
        wrap.appendChild(f);
        f.addEventListener('animationend', () => f.remove());
      };

      const showInsight = () => {
        const el = $('#insight');
        el.innerHTML = `<span class="ins-label">Инсайт</span>${INSIGHTS[insightAt++ % INSIGHTS.length]}`;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 4500);
      };

      const onTap = (e) => {
        e.preventDefault();
        syncEnergy();
        const power = tapPower();
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        if (S.energy < power) {
          wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake');
          haptic('heavy');
          const secs = Math.ceil((power - S.energy) / CONFIG.economy.regenPerSec);
          $('#tapHint').textContent = `Энергия на исходе. Подыши ${secs} сек или используй восстановление`;
          return;
        }
        S.energy -= power;
        const crit = Math.random() < CONFIG.economy.critChance;
        const gain = crit ? power * CONFIG.economy.critMult : power;
        S.taps += 1;
        S.balance += gain;
        S.totalEarned += gain;
        save();

        // наклон шара в сторону касания, как в Hamster
        const dx = (x / rect.width - 0.5) * 2, dy = (y / rect.height - 0.5) * 2;
        orb.style.transform = `perspective(600px) rotateX(${-dy * 14}deg) rotateY(${dx * 14}deg) scale(.95)`;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => (orb.style.transform = ''), 110);

        floatAt(x, y, crit ? `Инсайт! +${gain}` : `+${gain}`, crit);
        haptic(crit ? 'medium' : 'light');
        refreshBalance();
        updateEnergy();
        updateLevel();
        if (crit || S.taps % 100 === 0) showInsight();
      };

      orb.addEventListener('pointerdown', onTap);
      orb.addEventListener('contextmenu', (e) => e.preventDefault());
      const iv = setInterval(updateEnergy, 500);
      updateEnergy();
      return () => { clearInterval(iv); clearTimeout(pressTimer); flush(); };
    },
  },

  // ---------------------------------------------------------- магазин
  shop: {
    html(p) {
      const cat = p.cat || 'all';
      const items = SHOP.filter((i) => cat === 'all' || i.cat === cat);
      return `${topbar('Магазин', 'Обменивай искры на пользу')}
        <div class="shop-banner">
          <div><b>Не хватает искр?</b><p>Тапай ядро и выполняй задания на главной</p></div>
          <button class="btn primary sm" data-action="go" data-to="tap">Тапать</button>
        </div>
        <div class="chips">${SHOP_CATS.map((c) => `<button class="chip ${cat === c.id ? 'on' : ''}" data-action="go" data-to="shop" data-cat="${c.id}">${c.title}</button>`).join('')}</div>
        <div class="grid">${items.map((it) => {
          const owned = S.purchases.some((p) => p.itemId === it.id);
          const pct = Math.min(100, (S.balance / it.price) * 100);
          return `<button class="shop-card ${owned ? 'owned' : ''}" data-action="item" data-id="${it.id}">
            <div class="sc-ico">${icon(it.icon)}</div>
            <div class="sc-title">${it.title}</div>
            <div class="sc-desc">${it.short}</div>
            ${owned ? `<div class="sc-price ok">${icon('check')} Твоё</div>` : `<div class="sc-price"><span class="spark">${C}</span> ${fmt(it.price)}</div><div class="bar thin"><i style="width:${pct}%"></i></div>`}
          </button>`;
        }).join('')}</div>`;
    },
  },

  // ---------------------------------------------------------- профиль
  profile: {
    html() {
      const u = user();
      const lv = levelInfo();
      const hist = S.mood.history.slice(-7);
      const result = S.lead ? resultFor(S.lead.score) : null;
      return `
        <div class="profile-head">
          ${avatar('xl')}
          <h1 class="h1">${esc(u.name)}</h1>
          ${u.username ? `<div class="muted sm">@${esc(u.username)}</div>` : ''}
          <span class="pill-soft">${icon('trophy')} ${lv.name} · уровень ${lv.i}</span>
        </div>
        <div class="stats-row">
          <div><b data-bal>${fmt(S.balance)}</b><span>${C} на счету</span></div>
          <div><b>${fmt(S.taps)}</b><span>касаний</span></div>
          <div><b>${S.streak.day || 0}</b><span>дней подряд</span></div>
        </div>
        ${secHead('Настроение за неделю')}
        <div class="card mood-chart">${hist.length ? hist.map((h) => `<div class="mc-col"><div class="mc-bar" style="height:${h.v * 18}%"></div><span>${MOODS.find((m) => m.v === h.v).e}</span><small>${h.d.slice(8)}.${h.d.slice(5, 7)}</small></div>`).join('') : '<p class="muted sm">Отмечай настроение на главной, и здесь появится график.</p>'}</div>
        ${secHead('Мои материалы')}
        <div class="list">
          <button class="row" data-action="go" data-to="purchases"><span class="row-ico">${icon('bag')}</span><span class="row-main"><span class="row-title">Мои покупки</span><span class="row-sub">${S.purchases.length} ${plural(S.purchases.length, ['покупка', 'покупки', 'покупок'])}</span></span><span class="row-end">${icon('chevron-right')}</span></button>
          <button class="row" data-action="go" data-to="${S.lead ? 'result' : 'quiz'}"><span class="row-ico">${icon('gift')}</span><span class="row-main"><span class="row-title">${S.lead ? 'Результат теста' : 'Пройти тест на тревожность'}</span><span class="row-sub">${result ? result.title : 'Подарок: гид + ' + fmt(CONFIG.rewards.quiz) + ' ' + C}</span></span><span class="row-end">${icon('chevron-right')}</span></button>
          ${S.lead ? `<button class="row" data-action="go" data-to="guide"><span class="row-ico">${icon('layers')}</span><span class="row-main"><span class="row-title">Гид «5 техник»</span><span class="row-sub">Аптечка для нервной системы</span></span><span class="row-end">${icon('chevron-right')}</span></button>` : ''}
          <button class="row" data-action="go" data-to="courses"><span class="row-ico">${icon('heart')}</span><span class="row-main"><span class="row-title">Избранные курсы</span><span class="row-sub">${S.favs.length ? S.favs.map((id) => COURSES.find((c) => c.id === id)?.title).filter(Boolean).join(', ') : 'Пока пусто'}</span></span><span class="row-end">${icon('chevron-right')}</span></button>
        </div>
        ${secHead('Школа')}
        <div class="list">
          <button class="row" data-action="invite"><span class="row-ico">${icon('share')}</span><span class="row-main"><span class="row-title">Пригласить друга</span><span class="row-sub">+${fmt(CONFIG.rewards.invite)} ${C} за приглашение</span></span><span class="row-end">${icon('chevron-right')}</span></button>
          <button class="row" data-action="support"><span class="row-ico">${icon('chat')}</span><span class="row-main"><span class="row-title">Написать менеджеру</span><span class="row-sub">Ответим в течение часа</span></span><span class="row-end">${icon('chevron-right')}</span></button>
          <button class="row" data-action="go" data-to="about"><span class="row-ico">${icon('info')}</span><span class="row-main"><span class="row-title">О школе ${CONFIG.school.name}</span><span class="row-sub">${CONFIG.school.students} учеников · ${CONFIG.school.years} лет</span></span><span class="row-end">${icon('chevron-right')}</span></button>
        </div>
        <button class="link-muted center-block" data-action="reset">Сбросить прогресс</button>`;
    },
  },

  purchases: {
    html() {
      const list = [...S.purchases].reverse();
      return `${subTop('Мои покупки')}
        ${list.length ? `<div class="stack">${list.map((p) => {
          const it = SHOP.find((x) => x.id === p.itemId);
          if (!it) return '';
          return `<div class="card purchase">
            <div class="pu-head"><span class="sc-ico">${icon(it.icon)}</span><div><b>${it.title}</b><div class="muted xs">${new Date(p.at).toLocaleDateString('ru-RU')}</div></div></div>
            ${it.type === 'content'
              ? `<button class="btn ghost wide" data-action="go" data-to="content" data-id="${it.id}">Открыть материал</button>`
              : `<div class="code-box"><span>${p.code}</span><button class="icon-btn" data-action="copy" data-text="${p.code}" aria-label="Скопировать">${icon('copy')}</button></div>
                 <button class="btn ghost wide" data-action="activate" data-code="${p.code}" data-id="${it.id}">Активировать у менеджера</button>`}
          </div>`;
        }).join('')}</div>`
        : `<div class="empty">${icon('bag', 'big')}<p>Здесь появятся практики, промокоды и сессии, купленные за искры.</p><button class="btn primary" data-action="go" data-to="shop">В магазин</button></div>`}`;
    },
  },

  content: {
    html(p) {
      const it = SHOP.find((x) => x.id === p.id);
      if (!it || !S.purchases.some((x) => x.itemId === it.id)) return `${subTop('Материал')}<p class="muted">Материал не найден.</p>`;
      const c = it.content;
      return `${subTop(it.title)}
        <p class="lead-text">${c.intro}</p>
        <ol class="steps">${c.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
        <div class="card note">${icon('sparkle')}<p class="sm">${c.outro}</p></div>`;
    },
  },

  about: {
    html() {
      const s = CONFIG.school;
      return `${subTop('О школе')}
        <div class="about-hero">${scene({ tone: '#3d2e22', lampX: 200, chair: true, plant: true, shelf: true })}<div class="hero-fade"></div><div class="about-logo">${logo()}</div></div>
        <div class="stats-row">
          <div><b>${s.students}</b><span>учеников</span></div>
          <div><b>${s.years} лет</b><span>работаем</span></div>
          <div><b>4.9</b><span>средняя оценка</span></div>
        </div>
        <p class="lead-text">Мы учим психологии, которая работает в обычной жизни: без эзотерики и обещаний «изменить всё за неделю». Только методы с доказанной эффективностью, живые кураторы и бережная атмосфера.</p>
        ${secHead('Основатель')}
        <div class="card author"><i class="mini-ava lg">${AUTHORS.anna.initials}</i><div><b>${s.founder}</b><div class="muted sm">${s.founderRole}</div><p class="sm">${AUTHORS.anna.bio}</p></div></div>
        ${secHead('Команда')}
        <div class="list">${Object.values(AUTHORS).map((a) => `<div class="row static"><i class="mini-ava">${a.initials}</i><span class="row-main"><span class="row-title">${a.name}</span><span class="row-sub">${a.role}</span></span></div>`).join('')}</div>
        <p class="muted xs center legal">${s.licence}<br>Материалы школы не являются медицинской помощью и не заменяют консультацию врача.</p>`;
    },
  },

  // ---------------------------------------------------------- лид-магнит: тест
  quiz: {
    html() {
      if (quiz.step === 'intro') {
        return `${subTop('Подарок')}
          <div class="quiz-hero">${scene({ tone: '#3a3024', lampX: 200, window: true, table: true, plant: true })}<div class="hero-fade"></div><span class="pill-soft over">${icon('gift')} Бесплатно</span></div>
          <h1 class="h1">Насколько тревога управляет твоей жизнью?</h1>
          <p class="lead-text">7 вопросов, 2 минуты. Тест основан на скрининговых шкалах, которые психологи используют на первой встрече.</p>
          <div class="list">
            <div class="row static"><span class="row-ico">${icon('check')}</span><span class="row-main"><span class="row-title">Персональный результат</span><span class="row-sub">Уровень тревоги и что с ним делать</span></span></div>
            <div class="row static"><span class="row-ico">${icon('layers')}</span><span class="row-main"><span class="row-title">Гид «5 техник за 5 минут»</span><span class="row-sub">Дыхание, заземление, КПТ-вопросы</span></span></div>
            <div class="row static"><span class="row-ico">${icon('percent')}</span><span class="row-main"><span class="row-title">Код −${CONFIG.giftPromo.percent}% на любой курс</span><span class="row-sub">Действует ${CONFIG.giftPromo.hours} часа</span></span></div>
            <div class="row static"><span class="row-ico"><span class="spark">${C}</span></span><span class="row-main"><span class="row-title">+${fmt(CONFIG.rewards.quiz)} искр</span><span class="row-sub">Сразу на баланс</span></span></div>
          </div>
          <div class="sticky-cta"><button class="btn primary wide" data-action="quiz-start">Начать тест</button></div>`;
      }
      if (quiz.step === 'q') {
        const i = quiz.i;
        return `<header class="top sub"><button class="icon-btn page-back" data-action="quiz-prev" aria-label="Назад">${icon('arrow-left')}</button><span class="muted sm">Вопрос ${i + 1} из ${QUIZ.length}</span><span class="icon-btn ghost"></span></header>
          <div class="bar"><i style="width:${(i / QUIZ.length) * 100}%"></i></div>
          <h2 class="quiz-q">${QUIZ[i]}</h2>
          <p class="muted sm">Вспомни последние две недели</p>
          <div class="options">${QUIZ_OPTIONS.map((o, v) => `<button class="option ${quiz.answers[i] === v ? 'on' : ''}" data-action="quiz-answer" data-v="${v}"><span class="opt-dot"></span>${o}</button>`).join('')}</div>`;
      }
      // форма захвата контакта
      const u = user();
      const t = tgUser();
      return `${subTop('Почти готово')}
        <div class="form-hero"><span class="big-ico">${icon('gift', 'big')}</span></div>
        <h1 class="h1 center">Куда прислать результат?</h1>
        <p class="muted center sm">Результат откроется сразу, а гид и промокод сохранятся в приложении. Менеджер может написать, чтобы помочь с выбором курса.</p>
        <form class="form" id="leadForm" novalidate>
          <label class="field"><span>Имя</span><input name="name" autocomplete="given-name" value="${esc(S.lead?.name || (u.name !== 'Гость' ? u.name : ''))}" placeholder="Как к тебе обращаться"></label>
          <label class="field"><span>Телефон или ник в Telegram</span><input name="contact" autocomplete="tel" value="${esc(t?.username ? '@' + t.username : '')}" placeholder="+7 900 000-00-00 или @nick"></label>
          <label class="check"><input type="checkbox" name="consent"><span>Согласен(на) на обработку персональных данных и <a href="${CONFIG.links.privacy}" target="_blank" rel="noopener">политику конфиденциальности</a></span></label>
          <div class="form-err" id="formErr"></div>
          <button class="btn primary wide" type="submit">Получить результат и гид</button>
        </form>`;
    },
    mount() {
      const form = $('#leadForm');
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.name.value.trim();
        const contact = form.contact.value.trim();
        const err = $('#formErr');
        const okContact = /^\+?[\d\s()-]{10,}$/.test(contact) || /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact);
        if (name.length < 2) return (err.textContent = 'Напиши, как к тебе обращаться');
        if (!okContact) return (err.textContent = 'Нужен телефон или ник в Telegram');
        if (!form.consent.checked) return (err.textContent = 'Нужно согласие на обработку данных');
        err.textContent = '';
        const score = quizScore();
        const firstTime = !S.lead;
        S.lead = {
          name, contact, score, answers: [...quiz.answers],
          result: resultFor(score).title,
          promo: S.lead?.promo || genCode(CONFIG.giftPromo.prefix),
          at: S.lead?.at || Date.now(),
          sent: false,
        };
        save();
        if (firstTime) reward(CONFIG.rewards.quiz, 'подарок за тест');
        quiz.step = 'intro'; quiz.i = 0; quiz.answers = [];
        go('result', {}, { replace: true });
        S.lead.sent = await sendLead(S.lead);
        save();
      });
    },
  },

  result: {
    html() {
      if (!S.lead) return `${subTop('Результат')}<p class="muted">Сначала пройди тест.</p>`;
      const r = resultFor(S.lead.score);
      const pct = S.lead.score / (QUIZ.length * 3);
      const c = COURSES.find((x) => x.id === r.course);
      const R = 52, L = 2 * Math.PI * R;
      return `${subTop('Твой результат')}
        <div class="result-ring">
          <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" class="rr-bg"/><circle cx="60" cy="60" r="${R}" class="rr-fg" style="stroke:${r.color};stroke-dasharray:${L};stroke-dashoffset:${L * (1 - pct)}"/></svg>
          <div class="rr-text"><b>${S.lead.score}</b><span>из ${QUIZ.length * 3}</span></div>
        </div>
        <div class="center"><span class="pill-soft" style="color:${r.color}">${r.short}</span></div>
        <h1 class="h1 center serif">${r.title}</h1>
        <p class="lead-text">${r.text}</p>
        ${secHead('Что сделать сейчас')}
        <div class="list">${r.tips.map((t) => `<div class="row static"><span class="row-ico">${icon('check')}</span><span class="row-main"><span class="row-title">${t}</span></span></div>`).join('')}</div>
        <div class="card promo">
          <div class="xs muted">Твой подарочный код −${CONFIG.giftPromo.percent}% на любой курс</div>
          <div class="code-box"><span>${S.lead.promo}</span><button class="icon-btn" data-action="copy" data-text="${S.lead.promo}" aria-label="Скопировать">${icon('copy')}</button></div>
          <div class="xs muted">${giftActive() ? `Сгорит через <b data-gift-timer>${fmtLeft(giftLeftMs())}</b>` : 'Срок действия кода истёк'}</div>
        </div>
        ${c ? `${secHead('Подходит под твой результат')}${courseCard(c)}` : ''}
        <p class="muted xs center legal">Тест не является диагнозом. Если состояние мешает жить больше двух недель, обратись к специалисту.</p>
        <div class="sticky-cta"><button class="btn primary wide" data-action="go" data-to="guide">Открыть гид «5 техник»</button></div>`;
    },
  },

  guide: {
    html() {
      if (!S.lead) {
        return `${subTop('Гид')}<div class="empty">${icon('lock', 'big')}<p>Гид откроется после короткого теста. Это 2 минуты.</p><button class="btn primary" data-action="go" data-to="quiz">Пройти тест</button></div>`;
      }
      const calm = COURSES.find((c) => c.id === 'calm');
      return `${subTop('Гид')}
        <span class="pill-soft">${icon('gift')} Твой подарок</span>
        <h1 class="h1 serif">${GUIDE.title}</h1>
        <p class="lead-text">${GUIDE.intro}</p>
        <div class="stack">${GUIDE.items.map((t, i) => `
          <details class="tech" ${i === 0 ? 'open' : ''}>
            <summary><span class="mod-n">${String(i + 1).padStart(2, '0')}</span><span class="tech-t"><b>${t.title}</b><small>${t.when}</small></span><span class="tech-time">${t.time}</span></summary>
            <ol class="steps">${t.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
            <div class="why">${icon('info')}<span>${t.why}</span></div>
            ${t.breathing ? `<button class="btn ghost wide" data-action="go" data-to="breathing">${icon('play')} Подышать вместе с приложением</button>` : ''}
          </details>`).join('')}</div>
        <div class="card upsell">
          <div class="xs muted">Хочешь закрепить результат?</div>
          <b>${calm.title}</b>
          <p class="sm">4 недели с куратором, чтобы техники стали привычкой. ${giftActive() ? `С твоим кодом <b>${rub(Math.round(calm.price * (1 - CONFIG.giftPromo.percent / 100)))}</b> вместо ${rub(calm.price)}.` : ''}</p>
          ${giftActive() ? `<div class="xs muted">Код сгорит через <b data-gift-timer>${fmtLeft(giftLeftMs())}</b></div>` : ''}
          <button class="btn primary wide" data-action="go" data-to="course" data-id="calm">Смотреть курс</button>
        </div>`;
    },
  },

  // ---------------------------------------------------------- дыхание 4-7-8
  breathing: {
    html() {
      return `${subTop('Дыхание 4-7-8')}
        <p class="muted center sm">Длинный выдох включает парасимпатическую нервную систему, и тело получает сигнал «опасности нет».</p>
        <div class="breath-stage">
          <div class="breath-halo"></div>
          <div class="breath-circle" id="bc"></div>
          <div class="breath-core"><div id="bphase" class="bphase">Готов(а)?</div><div id="bcount" class="bcount"></div></div>
        </div>
        <div class="breath-cycles" id="bcycles">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
        <button class="btn primary wide" id="bstart">Начать · 4 цикла</button>
        ${S.tasks.breath !== today() ? `<p class="muted xs center">+${CONFIG.rewards.breath} ${C} за первую практику сегодня</p>` : ''}`;
    },
    mount() {
      const circle = $('#bc'), phaseEl = $('#bphase'), countEl = $('#bcount'), btn = $('#bstart');
      const cycles = $$('#bcycles i');
      const phases = [['Вдох', 4, 1], ['Задержка', 7, 1], ['Выдох', 8, 0.5]];
      let timers = [];
      let cancelled = false;
      const sleep = (ms) => new Promise((r) => timers.push(setTimeout(r, ms)));
      circle.style.transform = 'scale(.5)';

      async function run() {
        btn.disabled = true;
        btn.textContent = 'Дыши вместе с кругом';
        cycles.forEach((c) => c.classList.remove('on'));
        for (let c = 0; c < 4; c++) {
          cycles[c].classList.add('on');
          for (const [name, sec, scale] of phases) {
            if (cancelled) return;
            phaseEl.textContent = name;
            circle.style.transition = `transform ${sec}s ease-in-out`;
            circle.style.transform = `scale(${scale})`;
            haptic('soft');
            for (let s = sec; s > 0; s--) {
              if (cancelled) return;
              countEl.textContent = s;
              await sleep(1000);
            }
          }
        }
        phaseEl.textContent = 'Готово';
        countEl.textContent = '';
        btn.disabled = false;
        btn.textContent = 'Ещё раз';
        if (S.tasks.breath !== today()) {
          S.tasks.breath = today();
          reward(CONFIG.rewards.breath, 'практика дыхания');
        } else {
          notify('success');
        }
      }
      btn.addEventListener('click', run);
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    },
  },
};

// ============================================================ sheets
function itemSheet(id) {
  const it = SHOP.find((x) => x.id === id);
  if (!it) return;
  const owned = S.purchases.some((p) => p.itemId === it.id);
  const lack = it.price - S.balance;
  let cta;
  if (owned) {
    cta = it.type === 'content'
      ? `<button class="btn primary wide" data-action="go" data-to="content" data-id="${it.id}">Открыть</button>`
      : `<button class="btn primary wide" data-action="go" data-to="purchases">Мои покупки</button>`;
  } else if (lack > 0) {
    cta = `<button class="btn ghost wide" data-action="go" data-to="tap">Не хватает ${sparks(lack)}. Тапать</button>`;
  } else {
    cta = `<button class="btn primary wide" data-action="buy" data-id="${it.id}">Обменять ${fmt(it.price)} ${C}</button>`;
  }
  openSheet(`
    <div class="sheet-body">
      <div class="sheet-ico">${icon(it.icon)}</div>
      <h2 class="h2">${it.title}</h2>
      <p class="muted">${it.desc}</p>
      <div class="sheet-price"><span class="spark">${C}</span> ${fmt(it.price)} <span class="muted xs">· у тебя ${fmt(S.balance)}</span></div>
      ${cta}
    </div>`);
}

function buy(id) {
  const it = SHOP.find((x) => x.id === id);
  if (!it || S.purchases.some((p) => p.itemId === it.id)) return;
  if (!spend(it.price)) { haptic('heavy'); return itemSheet(id); }
  const p = { id: Date.now().toString(36), itemId: it.id, at: Date.now(), code: it.type === 'content' ? null : genCode('MN') };
  S.purchases.push(p);
  save();
  refreshBalance();
  notify('success');
  if (route.name === 'shop') render();
  openSheet(`
    <div class="sheet-body center">
      <div class="sheet-ico ok">${icon('check')}</div>
      <h2 class="h2">Готово!</h2>
      <p class="muted">${it.title} теперь твоё.</p>
      ${it.type === 'content'
        ? `<button class="btn primary wide" data-action="go" data-to="content" data-id="${it.id}">Открыть сейчас</button>`
        : `<div class="code-box"><span>${p.code}</span><button class="icon-btn" data-action="copy" data-text="${p.code}" aria-label="Скопировать">${icon('copy')}</button></div>
           <p class="muted xs">Код сохранён в «Мои покупки». Отправь его менеджеру, чтобы активировать.</p>
           <button class="btn primary wide" data-action="activate" data-code="${p.code}" data-id="${it.id}">Активировать у менеджера</button>`}
    </div>`);
}

function boostsSheet() {
  syncEnergy();
  const left = refillsLeft();
  openSheet(`
    <div class="sheet-body">
      <h2 class="h2">Бусты</h2>
      <p class="muted sm">Прокачивай ядро, чтобы копить искры быстрее.</p>
      <div class="list">
        <button class="row" ${left && S.energy < maxEnergy() ? 'data-action="refill"' : 'disabled'}>
          <span class="row-ico">${icon('refresh')}</span>
          <span class="row-main"><span class="row-title">Полное восстановление</span><span class="row-sub">Бесплатно · осталось ${left} из ${CONFIG.economy.refillsPerDay} сегодня</span></span>
          <span class="row-end">${icon('chevron-right')}</span>
        </button>
        ${Object.entries(BOOSTS).map(([k, b]) => {
          const lvl = S.boosts[k];
          const max = lvl >= b.max;
          const cost = boostCost(k);
          const can = !max && S.balance >= cost;
          return `<button class="row" ${can ? `data-action="buy-boost" data-k="${k}"` : 'disabled'}>
            <span class="row-ico">${icon(b.icon)}</span>
            <span class="row-main"><span class="row-title">${b.title} · ур. ${lvl}</span><span class="row-sub">${b.desc(lvl)}</span></span>
            <span class="row-end price-tag ${can ? '' : 'lack'}">${max ? 'MAX' : `${C} ${fmt(cost)}`}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`);
}

// ============================================================ actions
const ACTIONS = {
  go: (d) => { const { action, to, ...params } = d; go(to, params); },
  back: () => back(),
  'close-sheet': () => closeSheet(),

  'ob-next': () => {
    tryBrowserFullscreen();
    if (obStep < ONBOARDING.length - 1) { obStep++; render(); return; }
    S.onboarded = true; save(); go('home');
  },
  'ob-skip': () => { tryBrowserFullscreen(); S.onboarded = true; save(); go('home'); },

  'claim-daily': () => {
    if (S.streak.last === today()) return;
    const day = streakNextDay();
    const amount = streakReward();
    S.streak = { last: today(), day };
    reward(amount, `день ${day} подряд`);
    render();
  },
  mood: (d) => {
    const v = +d.v;
    const first = S.mood.date !== today();
    S.mood.date = today();
    S.mood.value = v;
    S.mood.history = [...S.mood.history.filter((h) => h.d !== today()), { d: today(), v }].slice(-14);
    save();
    if (first) reward(CONFIG.rewards.mood, 'спасибо, что отметил(а)');
    render();
  },
  'scroll-mood': () => $('#mood')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
  'task-channel': () => {
    openLink(CONFIG.links.channel);
    // Без бота проверить подписку нельзя, поэтому засчитываем по клику (см. README)
    setTimeout(() => {
      if (S.tasks.channel) return;
      S.tasks.channel = true;
      reward(CONFIG.rewards.channel, 'подписка на канал');
      if (route.name === 'home') render();
    }, 1500);
  },
  invite: () => {
    const ref = user().id ? `ref_${user().id}` : 'ref_web';
    const url = `${CONFIG.links.miniApp}?startapp=${ref}`;
    shareLink(url, `Нашёл(ла) классное приложение школы психологии ${CONFIG.school.name}: бесплатный тест на тревожность, практики и подарки.`);
    if (!S.tasks.invite) {
      setTimeout(() => {
        S.tasks.invite = true;
        reward(CONFIG.rewards.invite, 'приглашение друга');
        if (route.name === 'home') render();
      }, 1500);
    }
  },
  support: () => openLink(managerUrl(`Здравствуйте! Пишу из приложения ${CONFIG.school.name}.`)),

  fav: (d) => {
    S.favs = S.favs.includes(d.id) ? S.favs.filter((x) => x !== d.id) : [...S.favs, d.id];
    save(); haptic('light'); render();
  },
  'course-tab': (d) => {
    const y = view.scrollTop;
    route.params = { ...route.params, tab: d.tab };
    render();
    view.scrollTop = y;
  },
  enroll: (d) => {
    const c = COURSES.find((x) => x.id === d.id);
    const codes = [giftActive() ? S.lead.promo : null, ...S.purchases.filter((p) => ['d10', 'd25'].includes(p.itemId)).map((p) => p.code)].filter(Boolean);
    openLink(managerUrl(`Здравствуйте! Хочу на курс «${c.title}».${codes.length ? ` Мои промокоды: ${codes.join(', ')}` : ''}`));
  },

  item: (d) => itemSheet(d.id),
  buy: (d) => buy(d.id),
  activate: (d) => {
    const it = SHOP.find((x) => x.id === d.id);
    openLink(managerUrl(`Здравствуйте! Хочу активировать «${it?.title}» из магазина приложения. Код: ${d.code}`));
  },
  copy: (d) => copy(d.text),

  boosts: () => boostsSheet(),
  refill: () => {
    if (!refillsLeft()) return;
    if (S.refills.date !== today()) S.refills = { date: today(), used: 0 };
    S.refills.used++;
    S.energy = maxEnergy(); S.energyTs = Date.now();
    save(); notify('success'); closeSheet();
    toast(`${icon('bolt')} Энергия восстановлена`);
  },
  'buy-boost': (d) => {
    const cost = boostCost(d.k);
    if (S.boosts[d.k] >= BOOSTS[d.k].max || !spend(cost)) return;
    S.boosts[d.k]++;
    save(); notify('success'); refreshBalance();
    toast(`${icon('sparkle')} ${BOOSTS[d.k].title}: уровень ${S.boosts[d.k]}`, 'gold');
    if (route.name === 'tap') { const h = $('#tapHint'); if (h) h.textContent = `+${tapPower()} за касание · иногда случаются инсайты ×${CONFIG.economy.critMult}`; }
    boostsSheet();
  },

  'quiz-start': () => { quiz.step = 'q'; quiz.i = 0; quiz.answers = []; render(); },
  'quiz-answer': (d) => {
    quiz.answers[quiz.i] = +d.v;
    haptic('light');
    if (quiz.i < QUIZ.length - 1) quiz.i++;
    else quiz.step = 'form';
    setTimeout(render, 140);
  },
  'quiz-prev': () => {
    if (quiz.i > 0) { quiz.i--; render(); }
    else { quiz.step = 'intro'; render(); }
  },

  reset: () => openSheet(`<div class="sheet-body center"><h2 class="h2">Сбросить прогресс?</h2><p class="muted">Баланс, покупки и результат теста удалятся с этого устройства.</p><button class="btn danger wide" data-action="reset-confirm">Сбросить</button><button class="btn ghost wide" data-action="close-sheet">Отмена</button></div>`),
  'reset-confirm': () => { resetState(); go('home'); toast('Прогресс сброшен'); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn({ ...el.dataset }, el, e);
});

// Квиз: «назад» системной кнопкой на шаге вопросов листает вопросы, а не уходит со страницы
const baseBack = back;
function smartBack() {
  if (route.name === 'quiz' && quiz.step === 'q') return ACTIONS['quiz-prev']();
  if (route.name === 'quiz' && quiz.step === 'form') { quiz.step = 'q'; return render(); }
  baseBack();
}
ACTIONS.back = smartBack;

// ============================================================ boot
function buildNav() {
  const tabs = [['home', 'home', 'Главная'], ['courses', 'book', 'Курсы'], ['tap', null, ''], ['shop', 'bag', 'Магазин'], ['profile', 'user', 'Профиль']];
  nav.innerHTML = tabs.map(([id, ic, label]) => id === 'tap'
    ? `<button class="nav-tap" data-tab="tap" data-action="go" data-to="tap" aria-label="Тапать"><span class="psi">Ψ</span></button>`
    : `<button class="nav-btn" data-tab="${id}" data-action="go" data-to="${id}">${icon(ic)}<span>${label}</span></button>`).join('');
}

function boot() {
  initTelegram();
  buildNav();
  route = { name: S.onboarded ? 'home' : 'onboarding', params: {} };
  // реферальный параметр (кто пригласил) сохраняем один раз
  const sp = startParam();
  if (sp && !S.tasks.ref) { S.tasks.ref = sp; save(); }
  render();
  // прогресс с другого устройства через Telegram CloudStorage
  cloudPull(() => { route = { name: S.onboarded ? 'home' : 'onboarding', params: {} }; render(); });
  document.body.classList.add('ready');
}

boot();
