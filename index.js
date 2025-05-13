// index.js
const { getLatestKlines } = require('./binance');
const { getSubscribers, sendAlert } = require('./telegram');

const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const interval = '1m';
const checkIntervalMs = 60 * 1000;

const lastPrices = {}; // { symbol: lastPrice }

async function monitor() {
  for (const symbol of symbols) {
    try {
      const kline = await getLatestKlines(symbol, interval);
      const currentClose = kline.close;

      for (const { chatId, threshold } of getSubscribers()) {
        const key = `${symbol}_${chatId}`;
        const prev = lastPrices[key];

        if (prev !== undefined) {
          const diffPercent = ((currentClose - prev) / prev) * 100;
          if (Math.abs(diffPercent) >= threshold) {
            const direction = diffPercent > 0 ? '📈 рост' : '📉 падение';
            const msg = `⚠️ ${symbol}: ${direction} на ${diffPercent.toFixed(2)}%\nЦена: $${currentClose}`;
            await sendAlert(chatId, msg);
          }
        }

        // Обновляем цену для конкретного пользователя
        lastPrices[key] = currentClose;
      }

    } catch (err) {
      console.error(`Ошибка мониторинга ${symbol}:`, err.message);
    }
  }
}

// Запуск каждую минуту
setInterval(monitor, checkIntervalMs);
monitor();
