// npm install technicalindicators

const { RSI, BollingerBands, EMA } = require('technicalindicators');

function detectScalpingSignal(candles, config = {}) {
  const settings = {
    rsiPeriod: 3,
    rsiOverbought: 80,
    rsiOversold: 20,
    bbPeriod: 20,
    emaFast: 8,
    emaSlow: 21,
    riskReward: 1.5,
    ...config
  };

  if (!candles || candles.length < settings.bbPeriod + 2) {
    return { isSignal: false, reason: "Not enough data" };
  }

  const current = candles[candles.length - 1];
  const closes = candles.map(c => c.close);

  // Расчет индикаторов
  const rsi = RSI.calculate({ values: closes, period: settings.rsiPeriod });
  const bb = BollingerBands.calculate({ 
    values: closes, 
    period: settings.bbPeriod, 
    stdDev: 2 
  });
  const emaFast = EMA.calculate({ values: closes, period: settings.emaFast });
  const emaSlow = EMA.calculate({ values: closes, period: settings.emaSlow });

  if (!rsi.length || !bb.length || !emaFast.length || !emaSlow.length) {
    return { isSignal: false, reason: "Indicator calculation failed" };
  }

  const currentRSI = rsi[rsi.length - 1];
  const currentBB = bb[bb.length - 1];
  const currentEMAFast = emaFast[emaFast.length - 1];
  const currentEMASlow = emaSlow[emaSlow.length - 1];

  // Проверка LONG сигнала
  const isLongSetup = 
    currentRSI < settings.rsiOversold &&
    current.close <= currentBB.lower &&
    currentEMAFast > currentEMASlow;

  if (isLongSetup) {
    const confidence = calculateConfidence(currentRSI, settings.rsiOversold, 'long');
    const stopLoss = currentBB.lower * 0.999;
    const riskAmount = current.close - stopLoss;
    const takeProfit = current.close + (riskAmount * settings.riskReward);

    return {
      isSignal: true,
      type: "long",
      candle: current,
      confidence: Number(confidence.toFixed(2)),
      rsi: Number(currentRSI.toFixed(2)),
      entry: current.close,
      stopLoss: Number(stopLoss.toFixed(6)),
      takeProfit: Number(takeProfit.toFixed(6)),
      reason: "RSI oversold + BB lower + EMA bullish"
    };
  }

  // Проверка SHORT сигнала
  const isShortSetup = 
    currentRSI > settings.rsiOverbought &&
    current.close >= currentBB.upper &&
    currentEMAFast < currentEMASlow;

  if (isShortSetup) {
    const confidence = calculateConfidence(currentRSI, settings.rsiOverbought, 'short');
    const stopLoss = currentBB.upper * 1.001;
    const riskAmount = stopLoss - current.close;
    const takeProfit = current.close - (riskAmount * settings.riskReward);

    return {
      isSignal: true,
      type: "short",
      candle: current,
      confidence: Number(confidence.toFixed(2)),
      rsi: Number(currentRSI.toFixed(2)),
      entry: current.close,
      stopLoss: Number(stopLoss.toFixed(6)),
      takeProfit: Number(takeProfit.toFixed(6)),
      reason: "RSI overbought + BB upper + EMA bearish"
    };
  }

  return { isSignal: false, reason: "No signal detected" };
}

function calculateConfidence(rsi, threshold, direction) {
  if (direction === 'long') {
    // Чем ниже RSI от порога, тем выше confidence
    return Math.min(1, (threshold - rsi) / threshold);
  } else {
    // Чем выше RSI от порога, тем выше confidence
    return Math.min(1, (rsi - threshold) / (100 - threshold));
  }
}

module.exports = { detectScalpingSignal };