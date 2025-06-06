const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  throw new Error('TELEGRAM_TOKEN is not set');
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const subscribers = new Map(); // chatId -> { threshold }

// Enum for button texts
const ButtonText = {
  START: '🟢 START',
  STOP: '🔴 STOP',
  SET_VALUE: '🔧 SET VALUE',
};

const keyboard = {
  reply_markup: {
    keyboard: [
      [{ text: ButtonText.START }, { text: ButtonText.STOP }],
      [{ text: ButtonText.SET_VALUE }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
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

  if (text === ButtonText.START) {
    subscribers.set(chatId, { threshold: subscribers.get(chatId)?.threshold || 50 });

    console.log(`Подписка на ${chatId} с порогом ${subscribers.get(chatId).threshold} %`);
    bot.sendMessage(chatId, `✅ You subscribed (value is: ${subscribers.get(chatId).threshold}).`);
  }

  if (text === ButtonText.STOP) {
    subscribers.delete(chatId);
    bot.sendMessage(chatId, '❌ Unsubscribed.');
  }

  if (text === ButtonText.SET_VALUE) {
    bot.sendMessage(chatId, 'Set the new value, for example: `5`', {
      parse_mode: 'Markdown',
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
    threshold: data.threshold,
  }));
}

async function sendAlert(chatId, message) {
  try {
    const sentMsg = await bot.sendMessage(chatId, message, { disable_web_page_preview: true });
    return sentMsg.message_id;
  } catch (err) {
    console.error(`Ошибка отправки в chatId ${chatId}:`, err.message);
    return null;
  }
}

async function editResultAlert(chatId, messageId, message) {
  try {
    return await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
    });
  } catch (err) {
    console.error(`Ошибка отправки в chatId ${chatId}:`, err.message);
    return null;
  }
}

module.exports = { getSubscribers, sendAlert, editResultAlert };
