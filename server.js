const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const querystring = require('querystring');
const axios = require('axios');
const server = express();
const PORT = 5050;
const BINANCE_API_URL = process.env.BINANCE_TESTNET_URL;
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

server.use(cors());
server.use(express.json());
axios.interceptors.response.use(
    response => response,
    error => {
        console.error('Response Error:', error.response ? error.response.data : error.message);
        return Promise.reject(error);
    }
);

const getPrices = (coins = []) => {
    if (coins.length > 0) {
        return Promise.all(coins.map(coin => fetchPrices(coin)));
    }
    return fetchPrices();
};

const fetchPrices = (symbol) => {
    console.log(`Fetching prices for ${symbol}`);
    const url = symbol ? `${BINANCE_API_URL}/ticker/price?symbol=${symbol}` : `${BINANCE_API_URL}/ticker/price`;

    return axios.get(url)
        .then(response => response.data)
        .catch(error => {
            throw new Error('Failed to fetch prices: ' + error.message);
        });
};

const placeOrder = (symbol, side, price, quantity) => {
    const url = `${BINANCE_API_URL}/order`;
    const params = {
        symbol: 'BTCUSDT',
        side: 'BUY', // buy or sell
        type: 'MARKET',
        quantity: 0.001,
        timeStamp: Date.now()
    }

    const { query, signature } = signRequest(params, apiSecret);

    const requestUrl = `${BINANCE_API_URL}/api/v3/order?${query}&signature=${signature}`;

    const config = {
        headers: {
            'X-MBX-APIKEY': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',  // URL-encoded data
        }
    };
    return axios.post(requestUrl, null, config)
        .then(response => response.data)
        .catch(error => {
            throw new Error('Failed to place order: ' + error.message);
        });
};

const signRequest = (params, secretKey) => {
    const query = querystring.stringify(params);
    const signature = crypto.createHmac('sha256', secretKey)
        .update(query)
        .digest('hex');
    return { query, signature };
};

server.get('/api/prices', async (req, res) => {
    const coins = req.query.coins ? req.query.coins.split(',') : [];

    try {
        const prices = await getPrices(coins);
        res.json(prices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

server.post('/api/order', async (req, res) => {
    try {
        const { buyOrSell, symbol, price, amount } = req.body;
        const result = await placeOrder(symbol.toUpperCase(), buyOrSell.toUpperCase(), price, amount);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
