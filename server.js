const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const {tradingStrategies} = require("./strategies");
const {calculateBollingerBands, calculateRSI, calculateSMA, calculateEMA, calculateMACD, calculateSuperTrend,
    calculateDMI
} = require("./strategyHelper");
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
const clientBollingerBands = new Map();
const clientRSIs = new Map();
const clientSMAs = new Map();
const clientEMAs = new Map();
const clientMACDs = new Map();
const clientSuperTrends = new Map();
const clientDMIs = new Map();
const clientHistoricalDatas = new Map();


function addClientStrategies(clientWs) {
    clientBollingerBands.set(clientWs, {
        period: 20,
        active: false
    });
    clientRSIs.set(clientWs, {
        period: 20,
        overbought: 70,
        oversold:30,
        active: false
    })
    clientSMAs.set(clientWs, {
        period: 20,
        active: false
    })
    clientEMAs.set(clientWs, {
        period: 20,
        active: false,
        smoothing: 2
    })
    clientMACDs.set(clientWs, {
        shortPeriod: 12,
        longPeriod: 26,
        signalPeriod: 9,
        active: false
    })
    clientSuperTrends.set(clientWs, {
        period: 20,
        active: false,
        multiplier: 3
    })
    clientDMIs.set(clientWs, {
        period: 20,
        threshold: 25,
        active: false
    })
}

/* When Client Connects */
wss.on('connection', (clientWs) => {
    addClientStrategies(clientWs);
    /* When connected client changes symbol/interval */
    clientWs.on('message', async (message) => {

        const { symbol, interval, balance, strategy } = JSON.parse(message);

        if (balance !== undefined) {
            clientBalances.set(clientWs, balance);
            clientInventories.set(clientWs, []);
            console.log(`Balance set for client: ${balance}`);
            return;
        }
        console.log(strategy)
        if (strategy !== undefined) {
            if (strategy.type === 'bollingerBands') {
                const newStrategy = clientBollingerBands.get(clientWs);
                newStrategy.period = strategy.period;
                newStrategy.active = strategy.active;
                clientBollingerBands.set(clientWs, newStrategy);
            } else if (strategy.type === 'rsi') {
                const newStrategy = clientRSIs.get(clientWs);
                newStrategy.period = strategy.period;
                newStrategy.oversold = strategy.oversold;
                newStrategy.overbought = strategy.overbought;
                newStrategy.active = strategy.active;
                clientRSIs.set(clientWs, newStrategy);
            } else if (strategy.type === 'sma') {
                const newStrategy = clientSMAs.get(clientWs);
                newStrategy.period = strategy.period;
                newStrategy.active = strategy.active;
                clientSMAs.set(clientWs, newStrategy);
            } else if (strategy.type === 'ema') {
                const newStrategy = clientEMAs.get(clientWs);
                newStrategy.period = strategy.period;
                newStrategy.smoothing = strategy.smoothing;
                newStrategy.active = strategy.active;
                clientEMAs.set(clientWs, newStrategy);
            } else if (strategy.type === 'macd') {
                const newStrategy = clientMACDs.get(clientWs);
                newStrategy.shortPeriod = strategy.shortPeriod;
                newStrategy.longPeriod = strategy.longPeriod;
                newStrategy.signalPeriod = strategy.signalPeriod;
                newStrategy.active = strategy.active;
                clientMACDs.set(clientWs, newStrategy);
            } else if (strategy.type === 'superTrend') {
                const newStrategy = clientSuperTrends.get(clientWs);
                newStrategy.period = strategy.period;
                newStrategy.multiplier = strategy.multiplier;
                newStrategy.active = strategy.active;
                clientSuperTrends.set(clientWs, newStrategy);
            } else if (strategy.type === 'dmi') {
                const newStrategy = clientDMIs.get(clientWs);
                newStrategy.period = strategy.period;
                newStrategy.threshold = strategy.threshold;
                newStrategy.active = strategy.active;
                clientDMIs.set(clientWs, newStrategy);
            }

            return;
        }
        const clientHistoricalData = clientHistoricalDatas.get(clientWs);
        if (!symbol || !interval) {
            clientWs.send(JSON.stringify({ error: 'Symbol and interval are required.' }));
            return;
        } else if (!clientHistoricalData
            || clientHistoricalData.interval !== interval
            || clientHistoricalData.symbol !== symbol) {
            const historicalData = await fetchHistoricalData(symbol, interval, undefined, undefined)
            clientHistoricalDatas.set(clientWs, historicalData);
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

            const simulatedStrategy = isStrategy(clientWs, candleData, clientHistoricalDatas.get(clientWs));
            if (simulatedStrategy.shouldTrade) {
                simulateTrade(clientWs, candleData, simulatedStrategy.action);
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

const isStrategy = (clientWs, candle, historicalData) => {
    const closingPrices = historicalData.map(data => data.close);
    let signals = { buy: 0, sell: 0, total: 0 };

    if (clientBollingerBands.get(clientWs).active) {
        const { lowerband, upperband } = calculateBollingerBands(closingPrices, clientBollingerBands.get(clientWs).period);
        if (candle.close < lowerband) signals.buy++;
        if (candle.close > upperband) signals.sell++;
        signals.total++;
    }

    if (clientRSIs.get(clientWs).active) {
        const rsi = calculateRSI(closingPrices, clientRSIs.get(clientWs).period);
        if (rsi < clientRSIs.get(clientWs).oversold) signals.buy++;
        if (rsi > clientRSIs.get(clientWs).overbought) signals.sell++;
        signals.total++;
    }

    if (clientSMAs.get(clientWs).active) {
        const sma = calculateSMA(closingPrices);
        if (candle.close > sma) signals.buy++;
        if (candle.close < sma) signals.sell++;
        signals.total++;
    }
    console.log(clientEMAs.get(clientWs))
    if (clientEMAs.get(clientWs).active && closingPrices.length >= clientEMAs.get(clientWs).period + 1) {
        const ema = calculateEMA(closingPrices, clientEMAs.get(clientWs).period, clientEMAs.get(clientWs).smoothing);
        if (candle.close > ema) signals.buy++;
        if (candle.close < ema) signals.sell++;
        signals.total++;
    }

    if (clientMACDs.get(clientWs).active) {
        const { macd, signal } = calculateMACD(closingPrices, clientMACDs.get(clientWs).shortPeriod, clientMACDs.get(clientWs).longPeriod, clientMACDs.get(clientWs).signalPeriod);
        if (macd > signal) signals.buy++;
        if (macd < signal) signals.sell++;
        signals.total++;
    }

    if (clientSuperTrends.get(clientWs).active) {
        const superTrend = calculateSuperTrend(historicalData, clientSuperTrends.get(clientWs).period, clientSuperTrends.get(clientWs).multiplier);
        if (candle.close > superTrend) signals.buy++;
        if (candle.close < superTrend) signals.sell++;
        signals.total++;
    }

    if (clientDMIs.get(clientWs).active) {
        const { adx, diPlus, diMinus } = calculateDMI(historicalData, clientDMIs.get(clientWs).period);
        if (adx > clientDMIs.get(clientWs).threshold && diPlus > diMinus) signals.buy++;
        if (adx > clientDMIs.get(clientWs).threshold && diMinus > diPlus) signals.sell++;
        signals.total++;
    }

    if (signals.total > 0) {
        const buyPercentage = (signals.buy / signals.total) * 100;
        const sellPercentage = (signals.sell / signals.total) * 100;

        return {
            shouldTrade: buyPercentage > 60 || sellPercentage > 60,
            action: buyPercentage > sellPercentage ? 'buy' : 'sell'
        };
    }

    return { shouldTrade: false };
};

const simulateTrade = (clientWs, candleData, action) => {
    let balance = clientBalances.get(clientWs);
    let inventory = clientInventories.get(clientWs);

    const { tradeData, inventory: newInventory, balance: newBalance } = 
        trade(inventory, balance, candleData, action);

    clientBalances.set(clientWs, newBalance);
    clientInventories.set(clientWs, newInventory);

    if(tradeData)
        clientWs.send(JSON.stringify(tradeData));

    console.log(`Simulated trade:`, tradeData);
};

const trade = (inventory, balance, candleData, action) => {
    if(balance === undefined) return { inventory, balance };
    if (inventory === undefined) inventory = [];

    const price = candleData.close;
    const quantity = (balance * 0.1) / price;

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
                startTime: startTime,
                endTime: endTime,
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

const startBacktesting = async (symbol, interval, startingBalance, startTime, endTime, strategyTypes = []) => {
    let inventory = [];
    let balance = startingBalance;

    const mockClientWs = {};
    addClientStrategies(mockClientWs);
    
    strategyTypes.forEach(type => {
        switch(type) {
            case 'bollingerBands':
                clientBollingerBands.set(mockClientWs, {
                    period: 20,
                    active: true
                });
                break;
            case 'rsi':
                clientRSIs.set(mockClientWs, {
                    period: 14,
                    oversold: 30,
                    overbought: 70,
                    active: true
                });
                break;
            case 'sma':
                clientSMAs.set(mockClientWs, {
                    period: 20,
                    active: true
                });
                break;
            case 'ema':
                clientEMAs.set(mockClientWs, {
                    period: 20,
                    smoothing: 2,
                    active: true
                });
                break;
            case 'macd':
                clientMACDs.set(mockClientWs, {
                    shortPeriod: 12,
                    longPeriod: 26,
                    signalPeriod: 9,
                    active: true
                });
                break;
            case 'superTrend':
                clientSuperTrends.set(mockClientWs, {
                    period: 20,
                    multiplier: 3,
                    active: true
                });
                break;
            case 'dmi':
                clientDMIs.set(mockClientWs, {
                    period: 14,
                    threshold: 25,
                    active: true
                });
                break;
        }
    });

    const historicalData = await fetchHistoricalData(symbol, interval, startTime, endTime);
    if(!historicalData || historicalData.length === 0) {
        console.log('NO HISTORICAL DATA');
        return;
    }

    const tradeDatas = [];
    const windowSize = 100;

    for (let i = windowSize; i < historicalData.length; i++) {
        const candleData = {
            symbol: symbol,
            interval: interval,
            close: historicalData[i].close,
            high: historicalData[i].high,
            low: historicalData[i].low,
            open: historicalData[i].open,
            volume: historicalData[i].volume,
            time: historicalData[i].openTime,
            isFinal: true
        };

        const historicalWindow = historicalData.slice(i - windowSize, i);
        
        const strategyResult = isStrategy(mockClientWs, candleData, historicalWindow);
        
        if (strategyResult.shouldTrade) {
            const { inventory: newInventory, balance: newBalance, tradeData } = 
                trade(inventory, balance, candleData, strategyResult.action);
            
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
    const { symbol, interval, balance, startTime, endTime, strategyTypes } = req.body;
    
    try {
        const response = await startBacktesting(
            symbol, 
            interval, 
            balance, 
            startTime, 
            endTime, 
            strategyTypes.map(data => data.toLowerCase()) || []
        );
        res.json(response);
    } catch(error) {
        console.log('BackTesting Error: ' + error.message);
        res.status(500).send('Internal Server Error');
    }
});

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
