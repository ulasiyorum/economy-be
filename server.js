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
const clientInventories = new Map();

/* When Client Connects */
wss.on('connection', (clientWs) => {

    /* When connected client changes symbol/interval */
    clientWs.on('message', (message) => {

        const { symbol, interval, balance } = JSON.parse(message);

        if (balance !== undefined) {
            clientBalances.set(clientWs, balance);
            clientInventories.set(clientWs, []);
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

            const randomNumber = Math.floor(Math.random() * 100);

            if (randomNumber < 10) {
                simulateTrade(clientWs, candleData);
            }
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
    let inventory = clientInventories.get(clientWs);

    if(balance === undefined) return;

    if (inventory === undefined) inventory = []

    const action = Math.random() > 0.5 ? 'buy' : 'sell';

    const price = candleData.close;
    const quantity = (Math.random() * 10).toFixed(2);

    let simulatedPrice = price;
    let profitOrLoss = 0;

    const randomIndex = Math.floor(Math.random() * inventory.length);

    if (action === 'sell') {

        if (inventory.length === 0 || inventory[randomIndex] === undefined) {
            console.log('nothing to sell')
            return;
        }

        if(inventory[randomIndex].symbol !== candleData.symbol) {
            console.log('symbol mismatch')
            return;
        }

        profitOrLoss = (price * quantity) - (inventory[randomIndex].boughtAt * quantity);
    }

    if (action === 'buy') {
        const cost = simulatedPrice * quantity;
        if (balance >= cost) {
            balance -= cost;
            inventory.push({
                symbol: candleData.symbol,
                quantity: quantity,
                boughtAt: price
            })
        } else {
            console.log('balance not enough')
            return;
        }
    } else if (action === 'sell') {
        const earnings = simulatedPrice * quantity;
        inventory.splice(randomIndex, 1);
        balance += earnings;
    }
    const tradeData = {
        type: action,
        price: simulatedPrice.toFixed(2),
        quantity: quantity,
        balance: balance.toFixed(2),
        profitOrLoss: profitOrLoss,
        time: Date.now()
    };

    clientBalances.set(clientWs, balance);
    clientInventories.set(clientWs, inventory);
    clientWs.send(JSON.stringify(tradeData));
    console.log(`Simulated ${action} trade:`, tradeData);
};


server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
