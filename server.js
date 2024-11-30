const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const server = express();
const PORT = 5050;
const BINANCE_WS_URL = process.env.BINANCE_WS_URL;
const BINANCE_API_URL = process.env.BINANCE_API_URL;
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
        if(clientBalances.has(clientWs))
            clientBalances.delete(clientWs);

        if(clientInventories.has(clientWs))
            clientInventories.delete(clientWs);
    });
})

const simulateTrade = (clientWs, candleData) => {
    let balance = clientBalances.get(clientWs);
    let inventory = clientInventories.get(clientWs);

    const { tradeData: tradeData, inventory: newInventory, balance: newBalance } = trade(inventory, balance, candleData);

    clientBalances.set(clientWs, newBalance);
    clientInventories.set(clientWs, newInventory);
    clientWs.send(JSON.stringify(tradeData));
    console.log(`Simulated trade:`, tradeData);
};

const trade = (inventory, balance, candleData) => {
    if(balance === undefined) return { inventory, balance };

    if (inventory === undefined) inventory = []

    const action = Math.random() > 0.5 ? 'buy' : 'sell';

    const price = candleData.close;
    const quantity = (Math.random() * 1000 / price);

    let simulatedPrice = price;
    let profitOrLoss = 0;

    const randomIndex = Math.floor(Math.random() * inventory.length);

    if (action === 'sell') {

        if (inventory.length === 0 || inventory[randomIndex] === undefined) {
            console.log('nothing to sell')
            return { inventory, balance };
        }

        if(inventory[randomIndex].symbol !== candleData.symbol) {
            console.log('symbol mismatch')
            return { inventory, balance };
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
            return { inventory, balance };
        }
    } else if (action === 'sell') {
        const earnings = simulatedPrice * quantity;
        inventory.splice(randomIndex, 1);
        balance += earnings;
    }
    const tradeData = {
        type: action,
        price: simulatedPrice,
        quantity: quantity,
        balance: balance,
        profitOrLoss: profitOrLoss,
        time: Date.now()
    };
    return { inventory, balance, tradeData }
}

const fetchHistoricalData = async (symbol, interval, startTime, endTime) => {
    const url = `${BINANCE_API_URL}/klines`;
    try {
        const response = await axios.get(url, {
            params: {
                symbol: symbol.toUpperCase(),
                interval: interval,
                startTime,
                endTime,
                limit:1000
            }
        })

        return response.data.map(kline => ({
            openTime: kline[0],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5]),
            closeTime: kline[6],
        }));
    } catch (error) {
        console.error('Error fetching historical data:', error.message);
        return [];
    }
}

const startBacktesting = async (symbol, interval, startingBalance, startTime, endTime) => {
    let inventory = [];
    let balance = startingBalance;

    const historicalData = await fetchHistoricalData(symbol, interval, startTime, endTime);
    if(!historicalData || historicalData.length === 0) {
        console.log('NO HISTORICAL DATA')
        return;
    }
    const tradeDatas = [];
    for (let candleData of historicalData) {
        const tradeDecision = Math.random() < 0.1;
        if (tradeDecision) {
            const { inventory: newInventory, balance: newBalance, tradeData: tradeData  } = trade(inventory, balance, candleData);
            if (tradeData) {
                tradeDatas.push(tradeData);
                inventory = newInventory;
                balance = newBalance;
            }
        }
    }

    return tradeDatas;
}

server.post('/api/simulate-backtesting', async (req, res) => {
    const { symbol, interval, balance, startTime, endTime } = req.body;
    try {
        const response = await startBacktesting(symbol, interval, balance, startTime, endTime);
        res.json(response);
    } catch(error) {
        console.log('BackTesting Error: ' + error.message);
        res.status(500).send('Internal Server Error');
    }
})

server.get('/api/historical-data', async (req, res) => {
    const { symbol, interval, startTime, endTime } = req.query;

    if (!symbol || !interval) {
        return res.status(400).json({ error: 'Symbol and interval are required.' });
    }

    try {
        const historicalData = await fetchHistoricalData(symbol, interval, startTime, endTime);
        res.json(historicalData);
    } catch (error) {
        console.error('Error in /api/historical-data:', error.message);
        res.status(500).json({ error: 'Failed to fetch historical data.' });
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
