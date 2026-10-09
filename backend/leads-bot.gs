/**
 * MindNest: заявки из Mini App → сообщение менеджеру в Telegram (+ строка в Google Таблице).
 *
 * Где живёт: script.google.com (бесплатно, свой сервер не нужен).
 * Секреты НЕ пишутся в код, а лежат в «Настройки проекта → Свойства скрипта»:
 *   BOT_TOKEN  токен @m1ndnest_bot от BotFather (обязательно)
 *   CHAT_ID    кому слать: id менеджера или группы (обязательно, узнать через findChatId)
 *   SHEET_ID   id Google Таблицы для дублирования лидов (необязательно)
 */

const PROPS = PropertiesService.getScriptProperties();

// ------------------------------------------------------------ приём заявки
function doPost(e) {
  if (!e || !e.postData) {
    console.log('doPost вызывается приложением, вручную его запускать не нужно. Для проверки запусти findChatId или testLead.');
    return reply('no data');
  }
  try {
    const lead = JSON.parse(e.postData.contents);
    if (!lead.name || !lead.contact) return reply('bad request');

    // антиспам: один и тот же человек не чаще раза в минуту
    const cache = CacheService.getScriptCache();
    const spamKey = 'lead_' + ((lead.tg_user && lead.tg_user.id) || lead.contact);
    if (cache.get(spamKey)) return reply('too often');
    cache.put(spamKey, '1', 60);

    const verified = verifyInitData(lead.init_data);
    sendToManager(lead, verified);
    saveToSheet(lead, verified);
    return reply('ok');
  } catch (err) {
    console.error(err);
    return reply('error');
  }
}

function doGet() {
  return reply('MindNest leads endpoint работает');
}

function reply(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

// ------------------------------------------------------------ Telegram
function sendToManager(lead, verified) {
  const token = PROPS.getProperty('BOT_TOKEN');
  const chatId = PROPS.getProperty('CHAT_ID');
  if (!token || !chatId) throw new Error('Не заданы BOT_TOKEN или CHAT_ID в свойствах скрипта');

  const u = lead.tg_user || {};
  const contact = String(lead.contact).trim();
  const nick = contact.replace(/^@/, '');
  const isNick = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(nick) && !/^\+?\d/.test(contact);

  const lines = [
    '🔥 <b>Новый лид · тест на тревожность</b>',
    '',
    '👤 <b>' + esc(lead.name) + '</b>',
    '📞 ' + (isNick ? '<a href="https://t.me/' + esc(nick) + '">@' + esc(nick) + '</a>' : esc(contact)),
  ];
  if (u.id) {
    lines.push('💬 Telegram: ' + (u.username ? '@' + esc(u.username) : esc([u.first_name, u.last_name].filter(String).join(' '))) +
      ' · <a href="tg://user?id=' + u.id + '">открыть профиль</a>');
  }
  lines.push(
    '',
    '📊 Результат: <b>' + esc(lead.result) + '</b> (' + lead.score + ' из ' + (lead.max_score || 21) + ')',
    '🎁 Промокод: <code>' + esc(lead.promo) + '</code> (−10%, 72 часа)',
  );
  if (lead.ref) lines.push('🔗 Пришёл по ссылке: ' + esc(lead.ref));
  lines.push('', verified ? '✅ Подпись Telegram проверена' : '⚠️ Заявка не из Telegram (или подпись не прошла проверку)');

  // кнопка «Написать» сразу открывает чат с клиентом
  const writeTo = u.username || (isNick ? nick : '');
  const markup = writeTo ? { inline_keyboard: [[{ text: '✍️ Написать клиенту', url: 'https://t.me/' + writeTo }]] } : undefined;

  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: chatId,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: markup,
    }),
  });
  if (res.getResponseCode() !== 200) throw new Error('Telegram: ' + res.getContentText());
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ------------------------------------------------------------ Google Таблица (необязательно)
function saveToSheet(lead, verified) {
  const sheetId = PROPS.getProperty('SHEET_ID');
  if (!sheetId) return;
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName('Лиды') || ss.insertSheet('Лиды');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Дата', 'Имя', 'Контакт', 'Telegram', 'TG id', 'Баллы', 'Результат', 'Промокод', 'Реферал', 'Проверено']);
  }
  const u = lead.tg_user || {};
  sh.appendRow([new Date(), lead.name, lead.contact, u.username ? '@' + u.username : '', u.id || '', lead.score, lead.result, lead.promo, lead.ref || '', verified ? 'да' : 'нет']);
}

// ------------------------------------------------------------ проверка подписи Telegram initData
// Защищает от подделки: заявку с «чужим» Telegram-аккаунтом собрать нельзя без токена бота.
function verifyInitData(initData) {
  if (!initData) return false;
  try {
    const token = PROPS.getProperty('BOT_TOKEN');
    const pairs = initData.split('&').map(function (p) {
      const i = p.indexOf('=');
      return [p.slice(0, i), decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '))];
    });
    const hashPair = pairs.find(function (p) { return p[0] === 'hash'; });
    if (!hashPair) return false;
    const checkString = pairs
      .filter(function (p) { return p[0] !== 'hash'; })
      .sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; })
      .map(function (p) { return p[0] + '=' + p[1]; })
      .join('\n');
    const bytes = function (s) { return Utilities.newBlob(s).getBytes(); };
    const secret = Utilities.computeHmacSha256Signature(bytes(token), bytes('WebAppData'));
    const sig = Utilities.computeHmacSha256Signature(bytes(checkString), secret);
    const hex = sig.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    return hex === hashPair[1];
  } catch (err) {
    console.error(err);
    return false;
  }
}

// ------------------------------------------------------------ помощники для настройки
// 1) Менеджер пишет боту /start (или бота добавляют в группу и пишут там любое сообщение).
// 2) Запусти эту функцию: в «Журнале выполнения» появятся chat_id. Нужный положи в CHAT_ID.
function findChatId() {
  const token = PROPS.getProperty('BOT_TOKEN');
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText());
  if (!data.ok) return console.log('Ошибка Telegram: ' + res.getContentText());
  if (!data.result.length) return console.log('Пусто. Напиши боту /start и запусти функцию ещё раз.');
  data.result.forEach(function (upd) {
    const m = upd.message || upd.my_chat_member || upd.channel_post;
    if (m && m.chat) console.log('chat_id = ' + m.chat.id + '  ·  ' + (m.chat.title || m.chat.username || m.chat.first_name) + '  (' + m.chat.type + ')');
  });
}

// Отправляет тестовую заявку, чтобы проверить всю цепочку без приложения
function testLead() {
  sendToManager({
    name: 'Тестовый лид', contact: '@test_client', score: 9, max_score: 21,
    result: 'Волны на поверхности', promo: 'GIFT-TEST01', ref: 'ref_test',
    tg_user: { id: 1, username: 'test_client', first_name: 'Test' },
  }, false);
  console.log('Отправлено. Проверь Telegram.');
}
