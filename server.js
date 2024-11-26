const express = require('express');
const crypto = require('crypto');
const querystring = require('querystring');
const https = require('https');
const server = express();
const PORT = 5000;

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

const placeOrder = (symbol, side, price, quantity) => {
    return new Promise((resolve, reject) => {
        const url = `${BINANCE_API_URL}/order`;
        const params = {
            symbol: symbol,
            side: side, // buy or sell
            type: 'MARKET',
            quantity: quantity,
            price: price,
            timeStamp: Date.now()
        }

        const { query, signature } = signRequest(params, apiSecret);

        const options = {
            hostname: BINANCE_API_URL.replace('https://', '').replace('/api/v3', ''),
            path: `/api/v3/order?${query}&signature=${signature}`,
            method: 'POST',
            headers: {
                'X-MBX-APIKEY': apiKey,
                'Content-Type': 'application/json',
            },
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    resolve(JSON.parse(data));
                } else {
                    reject(JSON.parse(data));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    })
}

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
        res.status(500).json({error: error.message});
    }
});

server.post('/api/order', async (req, res) => {
    try {
        const side = req.body.buyOrSell ? req.body.buyOrSell.toString().toUpperCase() : 'BUY';
        const symbol = req.body.symbol ? req.body.symbol.toUpperCase() : '';
        const price = req.body.price ? req.body.price : 0;
        const quantity = req.body.amount ? req.body.quantity : 0;
        const result = await placeOrder(symbol, side, price, quantity);
        res.json(result);
    } catch (error) {
        res.status(500).json({error: error.message});
    }

})

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});