// Обёртка над Telegram Mini App SDK. Вне Telegram всё деградирует до обычного браузера.
export const tg = window.Telegram?.WebApp || null;
export const inTelegram = !!(tg && tg.initData);

const ver = (v) => { try { return tg.isVersionAtLeast(v); } catch (e) { return false; } };
const safe = (fn) => { try { fn(); } catch (e) { /* старый клиент Telegram */ } };

export function initTelegram() {
  document.documentElement.classList.add(inTelegram ? 'tg' : 'web');
  if (!inTelegram) return;

  tg.ready();
  tg.expand();

  // Настоящий фулскрин (Bot API 8.0+) только на телефонах, на десктопе он неудобен
  const mobile = ['ios', 'android', 'android_x'].includes(tg.platform);
  if (mobile && ver('8.0')) {
    safe(() => tg.requestFullscreen());
    safe(() => tg.lockOrientation());
  }
  // Чтобы свайп вниз во время тапания не сворачивал приложение
  if (ver('7.7')) safe(() => tg.disableVerticalSwipes());
  if (ver('6.1')) safe(() => { tg.setHeaderColor('#0e0c0a'); tg.setBackgroundColor('#0e0c0a'); });
  if (ver('7.10')) safe(() => tg.setBottomBarColor('#0e0c0a'));
}

export function haptic(kind = 'light') {
  if (inTelegram && ver('6.1')) safe(() => tg.HapticFeedback.impactOccurred(kind));
  else navigator.vibrate?.(kind === 'heavy' ? 20 : 8);
}

export function notify(type = 'success') {
  if (inTelegram && ver('6.1')) safe(() => tg.HapticFeedback.notificationOccurred(type));
  else navigator.vibrate?.([10, 40, 10]);
}

export const tgUser = () => (inTelegram ? tg.initDataUnsafe?.user || null : null);

export const startParam = () =>
  inTelegram ? tg.initDataUnsafe?.start_param || '' : new URLSearchParams(location.search).get('startapp') || '';

export function openLink(url) {
  if (inTelegram) {
    if (/^https:\/\/t\.me\//.test(url)) tg.openTelegramLink(url);
    else tg.openLink(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

let backHandler = null;
export function setBackButton(visible, handler) {
  if (!inTelegram || !ver('6.1')) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = null;
  if (visible) {
    backHandler = handler;
    tg.BackButton.onClick(handler);
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

export function shareLink(url, text) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (inTelegram) tg.openTelegramLink(share);
  else if (navigator.share) navigator.share({ url, text }).catch(() => {});
  else window.open(share, '_blank', 'noopener');
}

// Вне Telegram на телефоне пробуем Fullscreen API (Android Chrome). iOS Safari его не даёт:
// там фулскрин достигается установкой на экран «Домой» (manifest display: fullscreen).
export function tryBrowserFullscreen() {
  if (inTelegram) return;
  const el = document.documentElement;
  if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}
