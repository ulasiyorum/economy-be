const express = require('express');
const https = require('https');
const server = express();
const PORT = 3000;

const BINANCE_API_URL = process.env.BINANCE_TESTNET_URL;
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

const getPrices = (coins = []) => {
    let url = `${BINANCE_API_URL}/ticker/price`;

    if (coins.length > 0) {
        return Promise.all(coins.map(coin => fetchPrices(coin)))
    }

    return fetchPrices();
};

const fetchPrices = (symbol) => {
    console.log(`Fetching prices for ${symbol}`);
    return new Promise((resolve, reject) => {
        const url = symbol ? `${BINANCE_API_URL}/ticker/price?symbol=${symbol}` : `${BINANCE_API_URL}/ticker/price`;
        https.get(url, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error('Failed to parse JSON response'));
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
};

const placeOrder = (symbol, price, quantity) => {
    return new Promise((resolve, reject) => {
        const url = `${BINANCE_API_URL}/order`;
        const params = {
            symbol: symbol,
            side: null, // buy or sell
            type: 'MARKET',
            quantity: quantity,
            price: price,
            timeStamp: Date.now()
        }

        
    })
}

server.get('/api/prices', async (req, res) => {
    const coins = req.query.coins ? req.query.coins.split(',') : [];

    try {
        const prices = await getPrices(coins);
        res.json(prices);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});