const { MainClient } = require('binance');
const { detectScalpingSignal } = require('./paterns/engulfingStrategy');
const { detectEngulfingWithRCI } = require('./paterns/calculateRCI');

const API_KEY = 'xxx';
const API_SECRET = 'yyy';

const TOP_30_COINS = [
  'BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL', 'DOGE', 'DOT', 'MATIC', 'LTC',
  'SHIB', 'TRX', 'AVAX', 'UNI', 'ATOM', 'LINK', 'XMR', 'ETC', 'BCH', 'NEAR',
  'APE', 'ALGO', 'VET', 'MANA', 'SAND', 'AXS', 'ICP', 'FTM', 'HBAR', 'FLOW'
];

const client = new MainClient({
  api_key: API_KEY,
  api_secret: API_SECRET,
});

//TODO: вынести в отдельный файл
async function monitor(interval, getSubscribers, sendAlert, editResultAlert) {
  let subscribers = getSubscribers();


  console.log('Подписчики:', subscribers);

  const symbols = await getUsdtPairs();

  console.log(`Мониторинг ${symbols.length} пар...`);

  for (const symbol of symbols) {
    try {
      const candles = await getLatestKlines(symbol, interval, 20);
      if (!candles || candles.length < 2) continue;


      for (const { chatId, threshold } of subscribers) {

        
        // Проверяем на бычье/медвежье поглощение с RCI
        const engulfingSignal = detectEngulfingWithRCI(candles, 5);
        if (engulfingSignal.isSignal) {
          const direction = (engulfingSignal.type === 'long' ? '🟢' : '🔴') + `SIGNAL RCI: ${engulfingSignal.type}`;
          const msg = `${direction} \nCURRENCY: ${symbol}\nPrice: $${engulfingSignal.entry}\nRCI: ${engulfingSignal.rci}\nConfidence: ${engulfingSignal.confidence}\nStop Loss: $${engulfingSignal.stopLoss}\nTake Profit: $${engulfingSignal.takeProfit} \nReason: ${engulfingSignal.reason} \nLink: ${formatBinanceLink(symbol)}`;
          if (!formatBinanceLink(symbol)) {
            console.error(`ERROR link ${symbol}`);
          } else {
            const messageId = await sendAlert(chatId, msg);
            console.log(`Engulfing pattern detected for ${symbol} (${engulfingSignal.confidence})`);
            
            setTimeout(() => {
              checkSignalResult(symbol, engulfingSignal.stopLoss, engulfingSignal.takeProfit, engulfingSignal.type, { chatId, messageId, editResultAlert, msg });
            }, 5 * 60 * 1000);
          }
        }

        const signal = detectScalpingSignal(candles);
        if (signal.isSignal) {
          const direction = (signal.type === 'long' ? '🟢' : '🔴') + `SIGNAL Scalping: ${signal.type}`;
          const msg = `${direction} \nCURRENCY: ${symbol}\nPrice: $${signal.entry}\nRCI: ${signal.rci}\nConfidence: ${signal.confidence}\nStop Loss: $${signal.stopLoss}\nTake Profit: $${signal.takeProfit} \nReason: ${signal.reason} \nLink: ${formatBinanceLink(symbol)}`;
          if (!formatBinanceLink(symbol)) {
            console.error(`ERROR link ${symbol}`);
          } else {
            const messageId = await sendAlert(chatId, msg);
            console.log(`Engulfing pattern detected for ${symbol} (${signal.confidence})`);

            // Запускаем проверку через 5 минут
            setTimeout(() => {
              checkSignalResult(symbol, signal.stopLoss, signal.takeProfit, signal.type, { chatId, messageId, editResultAlert, msg });
            }, 5 * 60 * 1000);
          }
        }

        if (!chatId) continue; // Пропускаем, если chatId не указан
        if (!threshold || isNaN(threshold) || threshold <= 0) {
          console.warn(`Неверный порог для ${chatId}, пропускаем...`);
          continue;
        }

        // Проверяем на рост/падение
        const prevClose = candles[candles.length - 2].close;
        const currentClose = candles[candles.length - 1].close;
        const diffPercent = ((currentClose - prevClose) / prevClose) * 100;
        if (Math.abs(diffPercent) >= threshold && process.env.TH === 'true') {
          const direction = diffPercent > 0 ? '📈 GROW' : '📉 DOWN';
          const msg = `⚠️ ${symbol}: ${direction} on ${diffPercent.toFixed(2)}%\nPrice: $${currentClose}`;
          await sendAlert(chatId, msg);
        }
      }

    } catch (err) {
      console.error(`Ошибка мониторинга ${symbol}:`, err.message);
    }
  }
}

function parseKlines(rawKlines) {
  return rawKlines.map(kline => ({
    openTime: new Date(kline[0]).toISOString(),
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
    closeTime: new Date(kline[6]).toISOString(),
    quoteAssetVolume: parseFloat(kline[7]),
    numberOfTrades: kline[8],
    takerBuyBaseAssetVolume: parseFloat(kline[9]),
    takerBuyQuoteAssetVolume: parseFloat(kline[10]),
    ignore: kline[11],
  }));
}

async function getLatestKlines(symbol = 'BTCUSDT', interval = '1m', limit = 1) {
  const raw = await client.getKlines({ symbol, interval, limit });
  return parseKlines(raw);
}

async function getUsdtPairs() {
  try {
    const exchangeInfo = await client.getExchangeInfo();

    const top30UsdtPairs = exchangeInfo.symbols
      .filter(s => {
        // Проверяем статус торговли
        if (s.status !== 'TRADING') return false;

        // Для пар с USDT в качестве quote asset (например, BTC/USDT)
        if (s.quoteAsset === 'USDT') {
          return TOP_30_COINS.includes(s.baseAsset);
        }

        // Для пар с USDT в качестве base asset (например, USDT/BTC) - редко встречается
        if (s.baseAsset === 'USDT') {
          return TOP_30_COINS.includes(s.quoteAsset);
        }

        return false;
      })
      .map(s => s.symbol);

    console.log('Топ-30 USDT-пары:', top30UsdtPairs);
    console.log('Количество пар:', top30UsdtPairs.length);
    return top30UsdtPairs;
  } catch (error) {
    console.error('Ошибка при получении пар:', error.message);
    return [];
  }
}

function formatBinanceLink(symbol) {
  // Например, symbol = 'ANIMEUSDT'
  const quoteCurrencies = ['USDT', 'BTC', 'ETH', 'BUSD', 'USDC']; // популярные валюты

  // Найдем, какая валюта в конце строки
  const quote = quoteCurrencies.find(q => symbol.endsWith(q));
  if (!quote) return null; // если валюта не найдена — возвращаем null или пустую строку

  const base = symbol.slice(0, symbol.length - quote.length);

  return `https://www.binance.com/en/trade/${base}_${quote}`;
}

async function checkSignalResult(symbol, stopLoss, takeProfit, type, { chatId, messageId, editResultAlert, msg }) {

  console.log(`Проверка результата для: \n ${JSON.stringify({ symbol, stopLoss, takeProfit, type, chatId, messageId })}`);
  if (!symbol || !stopLoss || !takeProfit || !type || !chatId || !messageId) {
    console.error(`Недостаточно данных для проверки сигнала: ${JSON.stringify({ symbol, stopLoss, takeProfit, type, chatId, messageId })}`);
    return;
  }
  if (typeof stopLoss !== 'number' || typeof takeProfit !== 'number') {
    console.error(`Неверный тип данных для stopLoss или takeProfit: ${typeof stopLoss}, ${typeof takeProfit}`);
    return;
  }

  try {
    // Получаем последние 5 свечей
    const candles = await getLatestKlines({
      symbol: symbol,
      interval: '1m',
      limit: 5
    });

    if (candles.length === 0) {
      console.log(`Нет данных для ${symbol}`);
      return;
    }

    let result = null;

    // Проверяем каждую свечу на предмет срабатывания SL или TP
    for (const candle of candles) {
      const high = parseFloat(candle.high);
      const low = parseFloat(candle.low);

      if (type === 'long') {
        // Для лонг позиции: сначала проверяем SL (низ свечи), потом TP (верх свечи)
        if (low <= stopLoss) {
          result = { status: 'STOP LOSS', price: stopLoss };
          break; // Стоп лосс сработал раньше
        }
        if (high >= takeProfit) {
          result = { status: 'TAKE PROFIT', price: takeProfit };
          break;
        }
      } else {
        // Для шорт позиции: сначала проверяем SL (верх свечи), потом TP (низ свечи)  
        if (high >= stopLoss) {
          result = { status: 'STOP LOSS', price: stopLoss };
          break; // Стоп лосс сработал раньше
        }
        if (low <= takeProfit) {
          result = { status: 'TAKE PROFIT', price: takeProfit };
          break;
        }
      }
    }

    // Если ничего не сработало
    if (!result) {
      const currentPrice = parseFloat(candles[candles.length - 1].close);
      result = { status: 'ACTIVE', price: currentPrice };
    }

    // Отправляем обновление
    const statusEmoji = result.status === 'TAKE PROFIT' ? '✅' :
      result.status === 'STOP LOSS' ? '❌' : '⏳';

    const updateMsg = msg + `\n ----- \n ${statusEmoji} RESULT \n Status: ${result.status} Price: $${result.price}`;

    await editResultAlert(chatId, messageId, updateMsg);
    console.log(`${symbol} result: ${result.status} at $${result.price}`);

  } catch (error) {
    console.error(`Ошибка проверки ${symbol}:`, error.message);
  }
}

module.exports = { getLatestKlines, monitor };
