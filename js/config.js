// ============================================================
//  НАСТРОЙКИ ШКОЛЫ. Всё, что нужно поменять под реального клиента, лежит здесь.
// ============================================================
export const CONFIG = {
  school: {
    name: 'MindNest',
    tagline: 'школа практической психологии',
    founder: 'Анна Вершинина',
    founderRole: 'Основатель школы, клинический психолог, КПТ-терапевт',
    students: '12 000+',
    years: 8,
    licence: 'Лицензия на образовательную деятельность № Л035-01298-77/00000000',
  },

  currency: { sign: '✦', forms: ['искра', 'искры', 'искр'] },

  links: {
    manager: 'mindnest_care',                     // ник менеджера в Telegram без @
    channel: 'https://t.me/mindnest_school',      // канал школы (задание «подпишись»)
    miniApp: 'https://t.me/m1ndnest_bot/app',     // прямая ссылка на Mini App (для рефералок)
    privacy: 'https://example.com/privacy',       // политика обработки персональных данных
  },

  // Куда отправлять заявки из лид-магнита: n8n / Make / Google Apps Script / свой бэкенд.
  // Пусто = заявка сохраняется только на устройстве (демо-режим).
  leadsWebhook: 'https://script.google.com/macros/s/AKfycbxjvahocOVGMUdYXg40jBZf54rqyiiD51lHoLRL9kLCk4NhkNFZOXj1baCcWX4ns_pA/exec',

  economy: {
    energyBase: 500,       // стартовый запас энергии
    energyPerLevel: 250,   // +энергии за уровень буста «Запас энергии»
    regenPerSec: 1,        // восстановление энергии в секунду
    critChance: 0.04,      // шанс «инсайта» (крит)
    critMult: 5,           // множитель крита
    refillsPerDay: 3,      // бесплатных полных восстановлений в день
  },

  rewards: { quiz: 1000, channel: 500, invite: 2000, mood: 100, breath: 300, streakBase: 500 },

  // Подарочный промокод после теста (дожим лида в покупку курса)
  giftPromo: { percent: 10, hours: 72, prefix: 'GIFT' },
};
