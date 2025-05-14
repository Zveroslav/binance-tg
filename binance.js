// binance.js
const { MainClient } = require('binance');
const { HttpsProxyAgent } = require('https-proxy-agent');

const API_KEY = 'xxx';
const API_SECRET = 'yyy';

// Configure the proxy agent
const proxyAgent = new HttpsProxyAgent('https://vhyspcds:t9o17m429cup@92.112.153.212:8159');

const client = new MainClient({
  api_key: API_KEY,
  api_secret: API_SECRET,
  httpAgent: proxyAgent, // Add the proxy agent here
});

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
  return parseKlines(raw)[0];
}

module.exports = { getLatestKlines };
