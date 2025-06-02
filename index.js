// index.js
const { monitor } = require('./binance');
const { getSubscribers, sendAlert } = require('./telegram');

const interval = '1m';
const checkIntervalMs = 60 * 1000;




// Запуск каждую минуту
setInterval(() => monitor(interval, getSubscribers, sendAlert), checkIntervalMs);
monitor(interval, getSubscribers, sendAlert);
