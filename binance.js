const { MainClient } = require('binance');

const API_KEY = 'xxx';
const API_SECRET = 'yyy';

// Configure the proxy agent

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


      const prevClose = candles[candles.length-2].close;
      const currentClose = candles[candles.length-1].close;

      for (const { chatId, threshold } of subscribers) {

        const hammer = detectHammerPattern(candles);
        if (hammer.isHammer) {
          const msg = `🔨🔨🔨 ${symbol}: ${hammer.reason} (Confidence: ${hammer.confidenceScore})\nЦена: $${currentClose}`;
          await sendAlert(chatId, msg);
          console.log(`Hammer pattern detected for ${symbol} (${hammer.confidenceScore})`);
        }
        const diffPercent = ((currentClose - prevClose) / prevClose) * 100;

        console.log(`📊 ${symbol}: ${prevClose} → ${currentClose} (${diffPercent.toFixed(2)}%) для ${chatId}`, `IS HAMER: ${hammer.isHammer} (${hammer.confidenceScore})`);

        if (Math.abs(diffPercent) >= threshold) {
          const direction = diffPercent > 0 ? '📈 рост' : '📉 падение';
          const msg = `⚠️ ${symbol}: ${direction} на ${diffPercent.toFixed(2)}%\nЦена: $${currentClose}`;
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

function detectHammerPattern(candles) {
  if (!Array.isArray(candles) || candles.length < 10) {
    return { isHammer: false, confidenceScore: 0, candle: null, reason: 'Not enough candles' };
  }

  const current = candles[candles.length - 1];
  const trendCandles = candles.slice(candles.length - 6, candles.length - 1); // 5 свечей перед последней

  const closes = trendCandles.map(c => c.close);
  const isDowntrend = closes.every((price, i, arr) =>
    i === 0 || price < arr[i - 1]
  );

  if (!isDowntrend) {
    return {
      isHammer: false,
      confidenceScore: 0,
      candle: current,
      reason: 'No clear downtrend before hammer'
    };
  }

  const body = Math.abs(current.close - current.open);
  const range = current.high - current.low;
  const lowerShadow = Math.min(current.open, current.close) - current.low;
  const upperShadow = current.high - Math.max(current.open, current.close);

  const bodyRatio = body / range;
  const lowerRatio = lowerShadow / body;
  const upperRatio = upperShadow / body;

  const isSmallBody = bodyRatio < 0.3;
  const isLongLowerShadow = lowerRatio > 2;
  const isSmallUpperShadow = upperRatio < 0.5;

  const passes = isSmallBody && isLongLowerShadow && isSmallUpperShadow;

  const confidenceScore = Math.min(
    (1 - bodyRatio) * 0.4 +
    Math.min(lowerRatio / 3, 1) * 0.4 +
    (1 - Math.min(upperRatio, 1)) * 0.2,
    1
  );

  return {
    isHammer: passes,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    candle: current,
    reason: passes ? 'Hammer pattern matched' : 'Shadow/body ratio did not match'
  };
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

module.exports = { getLatestKlines, monitor };
