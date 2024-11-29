const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const server = express();
const PORT = 5050;
const BINANCE_WS_URL = process.env.BINANCE_WS_URL;

server.use(cors());
server.use(express.json());
axios.interceptors.response.use(
    response => response,
    error => {
        console.error('Response Error:', error.response ? error.response.data : error.message);
        return Promise.reject(error);
    }
);

const wss = new WebSocket.Server({ port: 5051 });
const clientBinanceStreams = new Map();
const clientBalances = new Map();

/* When Client Connects */
wss.on('connection', (clientWs) => {

    /* When connected client changes symbol/interval */
    clientWs.on('message', (message) => {

        const { symbol, interval, balance } = JSON.parse(message);

        if (balance !== undefined) {
            clientBalances.set(clientWs, balance);
            console.log(`Balance set for client: ${balance}`);
            return;
        }

        if (!symbol || !interval) {
            clientWs.send(JSON.stringify({ error: 'Symbol and interval are required.' }));
            return;
        }

        if (clientBinanceStreams.has(clientWs)) {
            const existingBinanceWs = clientBinanceStreams.get(clientWs);
            console.log(`Closing previous WebSocket for ${symbol}`);
            existingBinanceWs.close();
        }

        const streamUrl = `${BINANCE_WS_URL}${symbol.toLowerCase()}@kline_${interval}`;
        const binanceWs = new WebSocket(streamUrl);

        binanceWs.on('open', () => {
            console.log(`Binance WebSocket started for ${symbol} (${interval})`);
        });

        binanceWs.on('message', (data) => {
            const json = JSON.parse(data);
            const kline = json.k;
            console.log(json)
            const candleData = {
                type: 'candle',
                symbol: symbol.toUpperCase(),
                interval,
                open: parseFloat(kline.o),
                high: parseFloat(kline.h),
                low: parseFloat(kline.l),
                close: parseFloat(kline.c),
                volume: parseFloat(kline.v),
                time: Date.now(),
                isFinal: kline.x,
            };

            clientWs.send(JSON.stringify(candleData));

            simulateTrade(clientWs, candleData);
        });

        binanceWs.on('close', () => {
            console.log(`Binance WebSocket for ${symbol} closed.`);
        });

        binanceWs.on('error', (error) => {
            console.error('Binance WebSocket error:', error.message);
        });

        clientBinanceStreams.set(clientWs, binanceWs);
    })

    /* When client disconnects */
    clientWs.on('close', () => {
        console.log('Client disconnected');
        if (clientBinanceStreams.has(clientWs)) {
            const binanceWs = clientBinanceStreams.get(clientWs);
            binanceWs.close();
            clientBinanceStreams.delete(clientWs);
        }
    });
})

const simulateTrade = (clientWs, candleData) => {
    let balance = clientBalances.get(clientWs);

    if(balance === undefined) return;

    const action = Math.random() > 0.5 ? 'buy' : 'sell';

    const price = candleData.close;
    const quantity = (Math.random() * 10).toFixed(2);

    let simulatedPrice = price;
    if (action === 'sell') {
        simulatedPrice = price * (1 + (Math.random() > 0.5 ? 0.01 : -0.01));
    }

    if (action === 'buy') {
        const cost = simulatedPrice * quantity;
        if (balance >= cost) {
            balance -= cost;
        } else {
            console.log('balance not enough')
            return;
        }
    } else if (action === 'sell') {
        const earnings = simulatedPrice * quantity;
        balance += earnings;
    }
    const tradeData = {
        type: action,
        price: simulatedPrice.toFixed(2),
        quantity: quantity,
        balance: balance.toFixed(2),
        time: Date.now()
    };

    clientWs.send(JSON.stringify(tradeData));
    clientBalances.set(clientWs, balance);
    clientWs.send(JSON.stringify(tradeData));
    console.log(`Simulated ${action} trade:`, tradeData);
};


server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
