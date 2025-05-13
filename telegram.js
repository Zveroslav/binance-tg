// telegram.js
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  throw new Error('TELEGRAM_TOKEN is not set');
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const subscribers = new Map(); // chatId -> { threshold }

const keyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '🟢 START' }, { text: '🔴 STOP' }],
      [{ text: '🔧 SET VALUE' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Отправить меню при /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Hi, set the action 👇', keyboard);
});

// Обработка кнопок
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '🟢 START') {
    subscribers.set(chatId, { threshold: subscribers.get(chatId)?.threshold || 30 }); // default 30%

    console.log(`Подписка на ${chatId} с порогом ${subscribers.get(chatId).threshold} %`);
    bot.sendMessage(chatId, `✅ You subscribed (value is: ${subscribers.get(chatId).threshold}).`);
  }

  if (text === '🔴 STOP') {
    subscribers.delete(chatId);
    bot.sendMessage(chatId, '❌ Unsubscribed.');
  }

  if (text === '🔧 SET VALUE') {
    bot.sendMessage(chatId, 'Set the new value, for example: `5`', {
      parse_mode: 'Markdown'
    });
    // Ждём следующего сообщения от пользователя
    bot.once('message', (msg) => {
      const newThreshold = parseFloat(msg.text);
      if (!isNaN(newThreshold) && newThreshold > 0) {
        const user = subscribers.get(chatId);
        if (user) {
          user.threshold = newThreshold;
          bot.sendMessage(chatId, `✅ New value is: ${newThreshold}%`);
        } else {
          bot.sendMessage(chatId, 'You did not subscribe yet.');
        }
      } else {
        bot.sendMessage(chatId, '❌ Incorrect value.');
      }
    });
  }
});

// Получить копию подписчиков и порогов
function getSubscribers() {
  return Array.from(subscribers.entries()).map(([chatId, data]) => ({
    chatId,
    threshold: data.threshold
  }));
}

function sendAlert(chatId, message) {
  return bot.sendMessage(chatId, message).catch(err => {
    console.error(`Ошибка отправки в chatId ${chatId}:`, err.message);
  });
}

module.exports = { getSubscribers, sendAlert };
