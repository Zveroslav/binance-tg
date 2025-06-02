const { MainClient } = require('binance');

const API_KEY = 'xxx';
const API_SECRET = 'yyy';

const client = new MainClient({
  api_key: API_KEY,
  api_secret: API_SECRET,
});

async function monitor(interval, getSubscribers, sendAlert) {
  let subscribers = getSubscribers();


  console.log('Подписчики:', subscribers);

  const symbols = await getUsdtPairs();

  console.log(`Мониторинг ${symbols.length} пар...`);

  for (const symbol of symbols) {
    try {
      const candles = await getLatestKlines(symbol, interval, 20);
      if (!candles || candles.length < 2) continue;


      for (const { chatId, threshold } of subscribers) {

        if (!chatId) continue; // Пропускаем, если chatId не указан
        if (!threshold || isNaN(threshold) || threshold <= 0) {
          console.warn(`Неверный порог для ${chatId}, пропускаем...`);
          continue;
        }
        // Проверяем на бычье/медвежье поглощение с RCI
        const engulfingSignal = detectEngulfingWithRCI(candles, 5);
        if (engulfingSignal.isSignal) {
          const direction = (engulfingSignal.type === 'long' ? '🟢' : '🔴') + `SIGNAL: ${engulfingSignal.type}`;
          const msg = `${direction} \nCURRENCY: ${symbol}\nPrice: $${engulfingSignal.entry}\nRCI: ${engulfingSignal.rci}\nConfidence: ${engulfingSignal.confidence}\nStop Loss: $${engulfingSignal.stopLoss}\nTake Profit: $${engulfingSignal.takeProfit} \nReason: ${engulfingSignal.reason} \nLink: ${formatBinanceLink(symbol)}`;
          if (!formatBinanceLink(symbol)) {
            console.error(`ERROR link ${symbol}`);
          } else {
            await sendAlert(chatId, msg);
            console.log(`Engulfing pattern detected for ${symbol} (${engulfingSignal.confidence})`);
          } 
         
        }


        // Проверяем на рост/падение
        const prevClose = candles[candles.length-2].close;
        const currentClose = candles[candles.length-1].close;
        const diffPercent = ((currentClose - prevClose) / prevClose) * 100;
        if (Math.abs(diffPercent) >= threshold) {
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

    const usdtPairs = exchangeInfo.symbols
      .filter(s =>
        s.status === 'TRADING' &&
        (s.quoteAsset === 'USDT' || s.baseAsset === 'USDT')
      )
      .map(s => s.symbol);

    console.log('USDT-пары:', usdtPairs);
    return usdtPairs;
  } catch (error) {
    console.error('Ошибка при получении пар:', error.message);
  }
}

function detectEngulfingWithRCI(candles, rciPeriod = 9) {
  if (!Array.isArray(candles) || candles.length < rciPeriod + 2) {
    return { isSignal: false, reason: "Not enough candles" };
  }

  const prev = candles[candles.length - 2];
  const current = candles[candles.length - 1];

  const rci = calculateRCI(candles, rciPeriod);

  // Проверяем паттерн бычьего поглощения (long)
  const isBullishEngulfing =
    prev.close < prev.open &&
    current.close > current.open &&
    current.open < prev.close &&
    current.close > prev.open &&
    rci < -50;

  // Проверяем паттерн медвежьего поглощения (short)
  const isBearishEngulfing =
    prev.close > prev.open &&
    current.close < current.open &&
    current.open > prev.close &&
    current.close < prev.open &&
    rci > 50;

  // Функция для расчёта confidence
  function calculateConfidence(rciValue, candle) {
    const bodySize = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const bodyRatio = bodySize / range;

    // RCI score: чем дальше от порога (-50 или +50), тем выше score (0..1)
    let rciScore = 0;
    if (rciValue < -50) {
      rciScore = Math.min((Math.abs(rciValue) - 50) / 50, 1); // для лонга
    } else if (rciValue > 50) {
      rciScore = Math.min((rciValue - 50) / 50, 1); // для шорта
    }

    // Чем меньше bodyRatio (тонкое тело), тем ниже confidence, наоборот — плотное тело выше confidence
    const bodyScore = Math.min(1, bodyRatio * 3); // масштабируем bodyRatio для лучшей чувствительности

    // Взвешенный итог
    return Math.min(1, rciScore * 0.7 + bodyScore * 0.3);
  }

  if (isBullishEngulfing) {
    const confidence = calculateConfidence(rci, current);
    const stopLoss = current.low;
    const takeProfit = current.close + (current.close - stopLoss) * 1.5;
    return {
      isSignal: true,
      type: "long",
      candle: current,
      confidence: Number(confidence.toFixed(2)),
      rci,
      entry: current.close,
      stopLoss,
      takeProfit,
      reason: "Bullish Engulfing + RCI confirmation"
    };
  }

  if (isBearishEngulfing) {
    const confidence = calculateConfidence(rci, current);
    const stopLoss = current.high;
    const takeProfit = current.close - (stopLoss - current.close) * 1.5;
    return {
      isSignal: true,
      type: "short",
      candle: current,
      confidence: Number(confidence.toFixed(2)),
      rci,
      entry: current.close,
      stopLoss,
      takeProfit,
      reason: "Bearish Engulfing + RCI confirmation"
    };
  }

  return {
    isSignal: false,
    reason: "No engulfing pattern with RCI filter"
  };
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

function calculateRCI(candles, period) {
  if (candles.length < period) return null;

  // Берём цены закрытия за период
  const closes = candles.slice(-period).map(c => c.close);

  // Ранжируем цены по величине (ранг цен)
  const priceRanks = closes
    .map((price, idx) => ({ price, idx }))
    .sort((a, b) => a.price - b.price)
    .map((item, i) => ({ ...item, rank: i + 1 }))
    .sort((a, b) => a.idx - b.idx)
    .map(item => item.rank);

  // Ранжируем по времени (1..period)
  const timeRanks = Array.from({ length: period }, (_, i) => i + 1);

  // Считаем сумму квадратов разностей рангов
  let dSquaredSum = 0;
  for (let i = 0; i < period; i++) {
    const d = timeRanks[i] - priceRanks[i];
    dSquaredSum += d * d;
  }

  // Рассчитываем RCI по формуле
  const rci = 1 - (6 * dSquaredSum) / (period * (period * period - 1));

  // Возвращаем в процентах (-1..1 => -100..100)
  return rci * 100;
}


module.exports = { getLatestKlines, monitor };
