
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

module.exports = { calculateRCI, detectEngulfingWithRCI };
