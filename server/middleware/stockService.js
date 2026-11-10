// middleware/stockService.js
import { env } from '../config/env.js';

// === In-memory cache ===
// TTL: 60s for quotes, 300s (5min) for candles/search
const cache = new Map();
const QUOTE_TTL = 60 * 1000;        // 60 seconds
const CANDLE_TTL = 5 * 60 * 1000;   // 5 minutes
const SEARCH_TTL = 10 * 60 * 1000;   // 10 minutes

function getCached(key, ttl) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// === Rate limit tracking for Twelve Data ===
// Free tier: 8 requests/minute, 800/day
let twelveDataRequestTimes = [];
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 7;            // stay under 8 to be safe

function twelveDataRateLimited() {
  const now = Date.now();
  // Prune old entries
  twelveDataRequestTimes = twelveDataRequestTimes.filter(
    t => now - t < RATE_LIMIT_WINDOW
  );
  return twelveDataRequestTimes.length >= RATE_LIMIT_MAX;
}

function recordTwelveDataRequest() {
  twelveDataRequestTimes.push(Date.now());
}

// === Twelve Data (Primary) ===
async function twelveDataGetRealTimeQuote(symbol) {
  const url = `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${env.twelveDataApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error' || data.code === 429) {
    throw new Error(data.message || 'Twelve Data rate limited');
  }
  return {
    name: data.name,
    currentPrice: parseFloat(data.close),
    highOfDay: parseFloat(data.high),
    lowOfDay: parseFloat(data.low),
    open: parseFloat(data.open),
    change: parseFloat(data.percent_change),
    volume: data.volume,
    currency: data.currency || 'USD',
    exchange: data.exchange,
  };
}

async function twelveDataGetTimeSeries(symbol, interval, outputsize) {
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&apikey=${env.twelveDataApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error' || data.code === 429) {
    throw new Error(data.message || 'Twelve Data rate limited');
  }
  return (data.values || []).map(v => ({
    time: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume ? parseInt(v.volume) : null,
  }));
}

async function twelveDataSearchSymbols(query) {
  const url = `https://api.twelvedata.com/symbol_search?symbol=${query}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(item => ({
    symbol: item.symbol,
    name: item.instrument_name,
    exchange: item.exchange,
  }));
}

// === Finnhub (Fallback) ===
async function finnhubGetRealTimeQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${env.finnhubApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const data = await res.json();
  if (!data || data.c === 0) {
    throw new Error(`No data for ${symbol}`);
  }
  return {
    name: symbol, // Finnhub quote doesn't return name; fetch separately if needed
    currentPrice: parseFloat(data.c),
    highOfDay: parseFloat(data.h),
    lowOfDay: parseFloat(data.l),
    open: parseFloat(data.o),
    change: parseFloat(data.dp), // percent change
    volume: null,
    currency: 'USD',
    exchange: null,
  };
}

async function finnhubGetTimeSeries(symbol, interval, outputsize) {
  // Map intervals: 1day -> D, 1week -> W, 1min -> 1, 5min -> 5, 15min -> 15, 1h -> 60
  const resolutionMap = {
    '1min': '1', '5min': '5', '15min': '15', '1h': '60',
    '1day': 'D', '1week': 'W',
  };
  const resolution = resolutionMap[interval] || 'D';

  const now = Math.floor(Date.now() / 1000);
  // Calculate `from` based on outputsize and interval
  let secondsPerCandle;
  switch (interval) {
    case '1min': secondsPerCandle = 60; break;
    case '5min': secondsPerCandle = 300; break;
    case '15min': secondsPerCandle = 900; break;
    case '1h': secondsPerCandle = 3600; break;
    case '1day': secondsPerCandle = 86400; break;
    case '1week': secondsPerCandle = 604800; break;
    default: secondsPerCandle = 86400;
  }
  const from = now - (outputsize * secondsPerCandle);

  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${env.finnhubApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const data = await res.json();
  if (data.s !== 'ok') {
    throw new Error('No candle data from Finnhub');
  }

  const result = [];
  for (let i = 0; i < data.t.length; i++) {
    const date = new Date(data.t[i] * 1000);
    let timeStr;
    if (interval === '1day' || interval === '1week') {
      timeStr = date.toISOString().split('T')[0];
    } else {
      timeStr = date.toISOString().replace('T', ' ').substring(0, 16);
    }
    result.push({
      time: timeStr,
      open: parseFloat(data.o[i]),
      high: parseFloat(data.h[i]),
      low: parseFloat(data.l[i]),
      close: parseFloat(data.c[i]),
      volume: data.v[i] ? parseInt(data.v[i]) : null,
    });
  }
  return result;
}

async function finnhubSearchSymbols(query) {
  const url = `https://finnhub.io/api/v1/search?q=${query}&token=${env.finnhubApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const data = await res.json();
  return (data.result || []).map(item => ({
    symbol: item.symbol,
    name: item.description,
    exchange: item.displaySymbol,
  }));
}

// === Public API (with cache + fallback) ===

export async function getRealTimeQuote(symbol) {
  const cacheKey = `quote:${symbol}`;
  const cached = getCached(cacheKey, QUOTE_TTL);
  if (cached) return cached;

  // Try Twelve Data first (unless we know we're rate limited)
  if (env.twelveDataApiKey && !twelveDataRateLimited()) {
    try {
      recordTwelveDataRequest();
      const quote = await twelveDataGetRealTimeQuote(symbol);
      setCached(cacheKey, quote);
      return quote;
    } catch (err) {
      console.warn(`Twelve Data quote failed for ${symbol}, falling back to Finnhub:`, err.message);
    }
  }

  // Fallback to Finnhub
  if (env.finnhubApiKey) {
    const quote = await finnhubGetRealTimeQuote(symbol);
    setCached(cacheKey, quote);
    return quote;
  }

  throw new Error('No market data API available or both APIs failed.');
}

export async function getTimeSeries(symbol, interval = '1day', outputsize = 30) {
  const cacheKey = `candles:${symbol}:${interval}:${outputsize}`;
  const cached = getCached(cacheKey, CANDLE_TTL);
  if (cached) return cached;

  // Try Twelve Data first
  if (env.twelveDataApiKey && !twelveDataRateLimited()) {
    try {
      recordTwelveDataRequest();
      const candles = await twelveDataGetTimeSeries(symbol, interval, outputsize);
      setCached(cacheKey, candles);
      return candles;
    } catch (err) {
      console.warn(`Twelve Data candles failed for ${symbol}, falling back to Finnhub:`, err.message);
    }
  }

  // Fallback to Finnhub
  if (env.finnhubApiKey) {
    const candles = await finnhubGetTimeSeries(symbol, interval, outputsize);
    setCached(cacheKey, candles);
    return candles;
  }

  throw new Error('No market data API available or both APIs failed.');
}

export async function searchSymbols(query) {
  const cacheKey = `search:${query}`;
  const cached = getCached(cacheKey, SEARCH_TTL);
  if (cached) return cached;

  // Try Twelve Data first
  if (env.twelveDataApiKey && !twelveDataRateLimited()) {
    try {
      recordTwelveDataRequest();
      const results = await twelveDataSearchSymbols(query);
      if (results.length > 0) {
        setCached(cacheKey, results);
        return results;
      }
    } catch (err) {
      console.warn(`Twelve Data search failed for ${query}, falling back to Finnhub:`, err.message);
    }
  }

  // Fallback to Finnhub
  if (env.finnhubApiKey) {
    const results = await finnhubSearchSymbols(query);
    setCached(cacheKey, results);
    return results;
  }

  throw new Error('No market data API available or both APIs failed.');
}

// At the bottom of stockService.js
export function getCacheStats() {
  const now = Date.now();
  twelveDataRequestTimes = twelveDataRequestTimes.filter(
    t => now - t < RATE_LIMIT_WINDOW
  );
  return {
    cacheSize: cache.size,
    twelveDataRecentRequests: twelveDataRequestTimes.length,
    rateLimitMax: RATE_LIMIT_MAX,
    rateLimitRemaining: Math.max(0, RATE_LIMIT_MAX - twelveDataRequestTimes.length),
  };
}