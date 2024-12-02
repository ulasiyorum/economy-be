export const tradingStrategies = {
    /**
     * Bollinger Bands Strategy
     * @param {Object} candle - Current candle data
     * @param {number} lowerBand - Lower Bollinger Band
     * @param {number} upperBand - Upper Bollinger Band
     * @returns {boolean} - True if price crosses upper or lower band
     */
    bollingerBandsStrategy(candle, lowerBand, upperBand) {
        return candle.close < lowerBand || candle.close > upperBand;
    },

    /**
     * RSI Strategy
     * @param {number} rsi - Current RSI value
     * @param {number} overbought - Overbought RSI threshold
     * @param {number} oversold - Oversold RSI threshold
     * @returns {boolean} - True if RSI indicates overbought or oversold
     */
    rsiStrategy(rsi, overbought = 70, oversold = 30) {
        return rsi > overbought || rsi < oversold;
    },

    /**
     * SMA Strategy
     * @param {Object} candle - Current candle data
     * @param {number} sma - Simple Moving Average value
     * @returns {boolean} - True if price crosses SMA
     */
    smaStrategy(candle, sma) {
        return candle.close > sma || candle.close < sma;
    },

    /**
     * EMA Strategy
     * @param {Object} candle - Current candle data
     * @param {number} ema - Exponential Moving Average value
     * @returns {boolean} - True if price crosses EMA
     */
    emaStrategy(candle, ema) {
        return candle.close > ema || candle.close < ema;
    },

    /**
     * MACD Strategy
     * @param {number} macd - MACD value
     * @param {number} signal - Signal line value
     * @returns {boolean} - True if MACD crosses signal line
     */
    macdStrategy(macd, signal) {
        return macd > signal || macd < signal;
    },

    /**
     * SuperTrend Strategy
     * @param {Object} candle - Current candle data
     * @param {number} superTrend - SuperTrend value
     * @returns {boolean} - True if price crosses SuperTrend line
     */
    superTrendStrategy(candle, superTrend) {
        return candle.close > superTrend || candle.close < superTrend;
    },

    /**
     * DMI Strategy
     * @param {number} adx - ADX value
     * @param {number} diPlus - Positive Directional Index
     * @param {number} diMinus - Negative Directional Index
     * @param {number} threshold - Threshold for a strong trend
     * @returns {boolean} - True if strong trend detected
     */
    dmiStrategy(adx, diPlus, diMinus, threshold = 25) {
        return adx > threshold && (diPlus > diMinus || diMinus > diPlus);
    }
};