export function calculateSMA(data) { // array of closing prices
    const sum = data.reduce((acc, price) => acc + price, 0);
    return sum / data.length;
}

function calculateStandardDeviation(data, mean) {
    const variance =
        data.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) /
        data.length;
    return Math.sqrt(variance);
}

export function calculateRSI(closingPrices, period) {
    const recentPrices = closingPrices.slice(-period - 1);
    const changes = recentPrices.slice(1).map((price, i) => price - recentPrices[i]);

    const gains = changes.map(change => (change > 0 ? change : 0));
    const losses = changes.map(change => (change < 0 ? -change : 0));

    const avgGain = gains.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
    const avgLoss = losses.slice(0, period).reduce((acc, val) => acc + val, 0) / period;

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return rsi;
}

export function calculateBollingerBands(closingPrices, period) {
    const recentPrices = closingPrices.slice(-period);
    const sma = calculateSMA(recentPrices);
    const stdDev = calculateStandardDeviation(recentPrices, sma);

    return {
        lowerBand: sma - 2 * stdDev,
        upperBand: sma + 2 * stdDev,
        sma,
    };
}

export function calculateEMA(closingPrices, period, smoothing = 2) {
    if (closingPrices.length < period + 1) {
        throw new Error('Not enough data to calculate EMA');
    }

    const initialSMA = closingPrices.slice(0, period)
        .reduce((acc, price) => acc + price, 0) / period;

    const multiplier = smoothing / (period + 1);

    let ema = initialSMA;

    for (let i = period; i < closingPrices.length; i++) {
        ema = (closingPrices[i] - ema) * multiplier + ema;
    }

    return ema;
}

export function calculateMACD(closingPrices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
    const shortEMA = calculateEMA(closingPrices, shortPeriod);
    const longEMA = calculateEMA(closingPrices, longPeriod);

    const macd = shortEMA - longEMA;

    const signal = calculateEMA([macd], signalPeriod);

    return { macd, signal };
}

export function calculateSuperTrend(candles, period = 14, multiplier = 3) {
    if (candles.length < period + 1) {
        throw new Error('Not enough data to calculate SuperTrend');
    }

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
        const currentCandle = candles[i];
        const previousCandle = candles[i - 1];

        const highLow = currentCandle.high - currentCandle.low;
        const highClose = Math.abs(currentCandle.high - previousCandle.close);
        const lowClose = Math.abs(currentCandle.low - previousCandle.close);

        const trueRange = Math.max(highLow, highClose, lowClose);
        trueRanges.push(trueRange);
    }

    const atr = trueRanges.slice(-period).reduce((acc, tr) => acc + tr, 0) / period;

    const midPrice = (candles[candles.length - 1].high + candles[candles.length - 1].low) / 2;
    const upperBand = midPrice + (multiplier * atr);
    const lowerBand = midPrice - (multiplier * atr);

    let superTrend = upperBand;
    if (candles[candles.length - 2].close > upperBand) {
        superTrend = lowerBand;
    } else if (candles[candles.length - 2].close < lowerBand) {
        superTrend = upperBand;
    }

    return superTrend;
}

export function calculateDMI(candles, period = 14) {
    if (candles.length < period + 1) {
        throw new Error('Not enough data to calculate DMI/ADX');
    }

    const plusDM = [];
    const minusDM = [];
    const trueRanges = [];

    for (let i = 1; i < candles.length; i++) {
        const currentCandle = candles[i];
        const previousCandle = candles[i - 1];

        const plusDMValue = currentCandle.high - previousCandle.high > previousCandle.low - currentCandle.low
            ? Math.max(currentCandle.high - previousCandle.high, 0)
            : 0;

        const minusDMValue = previousCandle.low - currentCandle.low > currentCandle.high - previousCandle.high
            ? Math.max(previousCandle.low - currentCandle.low, 0)
            : 0;

        const tr = Math.max(currentCandle.high - currentCandle.low, Math.abs(currentCandle.high - previousCandle.close), Math.abs(currentCandle.low - previousCandle.close));

        plusDM.push(plusDMValue);
        minusDM.push(minusDMValue);
        trueRanges.push(tr);
    }

    const smoothedPlusDM = plusDM.slice(-period).reduce((acc, val) => acc + val, 0) / period;
    const smoothedMinusDM = minusDM.slice(-period).reduce((acc, val) => acc + val, 0) / period;
    const smoothedTR = trueRanges.slice(-period).reduce((acc, val) => acc + val, 0) / period;

    const diPlus = (smoothedPlusDM / smoothedTR) * 100;
    const diMinus = (smoothedMinusDM / smoothedTR) * 100;

    const diDifference = Math.abs(diPlus - diMinus);
    const adx = (diDifference / (diPlus + diMinus)) * 100;

    return { adx, diPlus, diMinus };
}
