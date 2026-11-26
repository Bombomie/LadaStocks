// middleware/stockService.js
// Strictly uses FREE-TIER endpoints of Twelve Data and Finnhub:
// - Twelve Data Free Tier (8 req/min, 800 req/day): /quote, /time_series, /symbol_search
// - Finnhub Free Tier (60 req/min): /quote, /search, /stock/market-status, /news
// NOTE: Paid/removed Finnhub /stock/candle endpoint is intentionally NOT used.

import { env } from '../config/env.js';

const cache = new Map();

const marketConfig = {
  quoteTtlMs: 60 * 1000,
  candleTtlMs: 5 * 60 * 1000,
  searchTtlMs: 10 * 60 * 1000,
  statusTtlMs: 60 * 1000,
  newsTtlMs: 5 * 60 * 1000,
  twelveDataMaxPerMin: 7,     // buffer under 8 req/min free limit
  twelveDataDailyLimit: 800,  // free tier daily cap
  finnhubMaxPerMin: 55,       // buffer under 60 req/min free limit
  autoRefreshPaused: false,
};

let twelveDataMinuteTimes = [];
let twelveDataDailyCount = 0;
let twelveDataDayKey = new Date().toISOString().slice(0, 10);
let finnhubMinuteTimes = [];

const telemetry = {
  cacheHits: 0,
  cacheMisses: 0,
  twelveDataCalls: 0,
  twelveDataErrors: 0,
  finnhubCalls: 0,
  finnhubErrors: 0,
  recentLogs: [],
};

function pushApiLog(entry) {
  telemetry.recentLogs.unshift({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (telemetry.recentLogs.length > 50) {
    telemetry.recentLogs.length = 50;
  }
}

function resetDailyCounterIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== twelveDataDayKey) {
    twelveDataDayKey = today;
    twelveDataDailyCount = 0;
  }
}

function pruneMinuteWindows() {
  const now = Date.now();
  twelveDataMinuteTimes = twelveDataMinuteTimes.filter((t) => now - t < 60 * 1000);
  finnhubMinuteTimes = finnhubMinuteTimes.filter((t) => now - t < 60 * 1000);
}

function getCached(key, ttl, allowStale = false) {
  const entry = cache.get(key);
  if (!entry) {
    telemetry.cacheMisses += 1;
    return null;
  }
  const age = Date.now() - entry.timestamp;
  if (age > ttl) {
    if (allowStale) {
      telemetry.cacheHits += 1;
      return entry.data;
    }
    cache.delete(key);
    telemetry.cacheMisses += 1;
    return null;
  }
  telemetry.cacheHits += 1;
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function canCallTwelveData() {
  resetDailyCounterIfNeeded();
  pruneMinuteWindows();
  if (!env.twelveDataApiKey || marketConfig.autoRefreshPaused) return false;
  if (twelveDataMinuteTimes.length >= marketConfig.twelveDataMaxPerMin) return false;
  if (twelveDataDailyCount >= marketConfig.twelveDataDailyLimit) return false;
  return true;
}

function recordTwelveDataCall() {
  resetDailyCounterIfNeeded();
  twelveDataMinuteTimes.push(Date.now());
  twelveDataDailyCount += 1;
  telemetry.twelveDataCalls += 1;
}

function canCallFinnhub() {
  pruneMinuteWindows();
  if (!env.finnhubApiKey || marketConfig.autoRefreshPaused) return false;
  return finnhubMinuteTimes.length < marketConfig.finnhubMaxPerMin;
}

function recordFinnhubCall() {
  finnhubMinuteTimes.push(Date.now());
  telemetry.finnhubCalls += 1;
}

// === Twelve Data Free-Tier Calls ===

async function twelveDataGetRealTimeQuote(symbol) {
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(env.twelveDataApiKey)}`;
  const start = Date.now();
  recordTwelveDataCall();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error' || data.code === 429) {
    throw new Error(data.message || 'Twelve Data rate limited');
  }
  pushApiLog({ provider: 'TwelveData', endpoint: '/quote', symbol, ok: true, ms: Date.now() - start });
  return {
    symbol: data.symbol || symbol,
    name: data.name || symbol,
    currentPrice: parseFloat(data.close),
    highOfDay: parseFloat(data.high),
    lowOfDay: parseFloat(data.low),
    open: parseFloat(data.open),
    previousClose: parseFloat(data.previous_close),
    change: parseFloat(data.percent_change || 0),
    changeAmount: parseFloat(data.change || 0),
    volume: data.volume ? parseInt(data.volume, 10) : null,
    currency: data.currency || 'USD',
    exchange: data.exchange || null,
    provider: 'TwelveData',
  };
}

async function twelveDataGetTimeSeries(symbol, interval, outputsize) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&outputsize=${encodeURIComponent(outputsize)}&apikey=${encodeURIComponent(env.twelveDataApiKey)}`;
  const start = Date.now();
  recordTwelveDataCall();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error' || data.code === 429) {
    throw new Error(data.message || 'Twelve Data rate limited');
  }
  pushApiLog({ provider: 'TwelveData', endpoint: '/time_series', symbol, ok: true, ms: Date.now() - start });
  // Twelve Data returns newest first; reverse to chronological oldest -> newest for Plotly/Chart.js
  return (data.values || [])
    .map((v) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume ? parseInt(v.volume, 10) : 0,
    }))
    .reverse();
}

async function twelveDataSearchSymbols(query) {
  const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${encodeURIComponent(env.twelveDataApiKey)}`;
  const start = Date.now();
  recordTwelveDataCall();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
  const data = await res.json();
  if (data.status === 'error') {
    throw new Error(data.message || 'Twelve Data search error');
  }
  pushApiLog({ provider: 'TwelveData', endpoint: '/symbol_search', symbol: query, ok: true, ms: Date.now() - start });
  return (data.data || []).slice(0, 15).map((item) => ({
    symbol: item.symbol,
    name: item.instrument_name,
    exchange: item.exchange,
    country: item.country,
  }));
}

// === Finnhub Free-Tier Calls ===

async function finnhubGetRealTimeQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(env.finnhubApiKey)}`;
  const start = Date.now();
  recordFinnhubCall();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !data.c || data.c === 0) {
    throw new Error(`No Finnhub quote data for ${symbol}`);
  }
  pushApiLog({ provider: 'Finnhub', endpoint: '/quote', symbol, ok: true, ms: Date.now() - start });
  return {
    symbol,
    name: symbol,
    currentPrice: parseFloat(data.c),
    highOfDay: parseFloat(data.h),
    lowOfDay: parseFloat(data.l),
    open: parseFloat(data.o),
    previousClose: parseFloat(data.pc),
    change: parseFloat(data.dp || 0),
    changeAmount: parseFloat(data.d || 0),
    volume: null,
    currency: 'USD',
    exchange: null,
    provider: 'Finnhub',
  };
}

async function finnhubSearchSymbols(query) {
  const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${encodeURIComponent(env.finnhubApiKey)}`;
  const start = Date.now();
  recordFinnhubCall();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const data = await res.json();
  pushApiLog({ provider: 'Finnhub', endpoint: '/search', symbol: query, ok: true, ms: Date.now() - start });
  return (data.result || []).slice(0, 15).map((item) => ({
    symbol: item.symbol,
    name: item.description,
    exchange: item.displaySymbol || 'US',
  }));
}

async function finnhubGetMarketStatus(exchange = 'US') {
  const url = `https://finnhub.io/api/v1/stock/market-status?exchange=${encodeURIComponent(exchange)}&token=${encodeURIComponent(env.finnhubApiKey)}`;
  const start = Date.now();
  recordFinnhubCall();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const data = await res.json();
  pushApiLog({ provider: 'Finnhub', endpoint: '/stock/market-status', symbol: exchange, ok: true, ms: Date.now() - start });
  return {
    exchange: data.exchange || exchange,
    isOpen: Boolean(data.isOpen),
    session: data.session || (data.isOpen ? 'regular' : 'closed'),
    holiday: data.holiday || null,
    timezone: data.timezone || 'America/New_York',
    source: 'Finnhub Free Tier',
  };
}

async function finnhubGetMarketNews(category = 'general') {
  const url = `https://finnhub.io/api/v1/news?category=${encodeURIComponent(category)}&token=${encodeURIComponent(env.finnhubApiKey)}`;
  const start = Date.now();
  recordFinnhubCall();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
  const data = await res.json();
  pushApiLog({ provider: 'Finnhub', endpoint: '/news', symbol: category, ok: true, ms: Date.now() - start });
  return (Array.isArray(data) ? data : []).slice(0, 15).map((item) => ({
    id: item.id,
    headline: item.headline,
    summary: item.summary,
    source: item.source,
    url: item.url,
    datetime: item.datetime ? new Date(item.datetime * 1000).toISOString() : null,
    category: item.category || category,
  }));
}

// === Public Market Data Functions ===

export async function getRealTimeQuote(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  const cacheKey = `quote:${sym}`;
  const cached = getCached(cacheKey, marketConfig.quoteTtlMs, marketConfig.autoRefreshPaused);
  if (cached) return cached;

  if (canCallTwelveData()) {
    try {
      const quote = await twelveDataGetRealTimeQuote(sym);
      setCached(cacheKey, quote);
      return quote;
    } catch (err) {
      telemetry.twelveDataErrors += 1;
      pushApiLog({ provider: 'TwelveData', endpoint: '/quote', symbol: sym, ok: false, error: err.message });
    }
  }

  if (canCallFinnhub()) {
    try {
      const quote = await finnhubGetRealTimeQuote(sym);
      setCached(cacheKey, quote);
      return quote;
    } catch (err) {
      telemetry.finnhubErrors += 1;
      pushApiLog({ provider: 'Finnhub', endpoint: '/quote', symbol: sym, ok: false, error: err.message });
    }
  }

  const stale = getCached(cacheKey, Number.MAX_SAFE_INTEGER, true);
  if (stale) return { ...stale, stale: true };

  throw new Error(`Quote unavailable for ${sym}. Verify TWELVE_DATA_API_KEY / FINNHUB_API_KEY or wait for rate limit reset.`);
}

export async function getTimeSeries(symbol, interval = '1day', outputsize = 90) {
  const sym = String(symbol || '').toUpperCase().trim();
  const cacheKey = `candles:${sym}:${interval}:${outputsize}`;
  const cached = getCached(cacheKey, marketConfig.candleTtlMs, marketConfig.autoRefreshPaused);
  if (cached) return cached;

  // Twelve Data free tier supports /time_series (Finnhub /stock/candle is paid/discontinued)
  if (canCallTwelveData()) {
    try {
      const candles = await twelveDataGetTimeSeries(sym, interval, outputsize);
      if (candles.length > 0) {
        setCached(cacheKey, candles);
        return candles;
      }
    } catch (err) {
      telemetry.twelveDataErrors += 1;
      pushApiLog({ provider: 'TwelveData', endpoint: '/time_series', symbol: sym, ok: false, error: err.message });
    }
  }

  const stale = getCached(cacheKey, Number.MAX_SAFE_INTEGER, true);
  if (stale) return stale;

  throw new Error(`Historical time series for ${sym} requires Twelve Data free-tier capacity.`);
}

export async function searchSymbols(query) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return [];
  const cacheKey = `search:${q}`;
  const cached = getCached(cacheKey, marketConfig.searchTtlMs, marketConfig.autoRefreshPaused);
  if (cached) return cached;

  if (canCallTwelveData()) {
    try {
      const results = await twelveDataSearchSymbols(q);
      if (results.length > 0) {
        setCached(cacheKey, results);
        return results;
      }
    } catch (err) {
      telemetry.twelveDataErrors += 1;
      pushApiLog({ provider: 'TwelveData', endpoint: '/symbol_search', symbol: q, ok: false, error: err.message });
    }
  }

  if (canCallFinnhub()) {
    try {
      const results = await finnhubSearchSymbols(q);
      setCached(cacheKey, results);
      return results;
    } catch (err) {
      telemetry.finnhubErrors += 1;
      pushApiLog({ provider: 'Finnhub', endpoint: '/search', symbol: q, ok: false, error: err.message });
    }
  }

  throw new Error('Symbol search unavailable from Twelve Data and Finnhub.');
}

export async function getMarketStatus(exchange = 'US') {
  const cacheKey = `status:${exchange}`;
  const cached = getCached(cacheKey, marketConfig.statusTtlMs, marketConfig.autoRefreshPaused);
  if (cached) return cached;

  if (canCallFinnhub()) {
    try {
      const status = await finnhubGetMarketStatus(exchange);
      setCached(cacheKey, status);
      return status;
    } catch (err) {
      telemetry.finnhubErrors += 1;
      pushApiLog({ provider: 'Finnhub', endpoint: '/stock/market-status', symbol: exchange, ok: false, error: err.message });
    }
  }

  // Fallback US NYSE/NASDAQ clock estimate if Finnhub key is absent
  const nowNy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = nowNy.getDay();
  const minutes = nowNy.getHours() * 60 + nowNy.getMinutes();
  const isOpen = day >= 1 && day <= 5 && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  return {
    exchange,
    isOpen,
    session: isOpen ? 'regular' : 'closed',
    holiday: null,
    timezone: 'America/New_York',
    source: 'Schedule Fallback',
  };
}

export async function getMarketNews(category = 'general') {
  const cacheKey = `news:${category}`;
  const cached = getCached(cacheKey, marketConfig.newsTtlMs, marketConfig.autoRefreshPaused);
  if (cached) return cached;

  if (canCallFinnhub()) {
    try {
      const news = await finnhubGetMarketNews(category);
      setCached(cacheKey, news);
      return news;
    } catch (err) {
      telemetry.finnhubErrors += 1;
      pushApiLog({ provider: 'Finnhub', endpoint: '/news', symbol: category, ok: false, error: err.message });
    }
  }

  return [];
}

// === Diagnostics & Admin Controls ===

export function getCacheStats() {
  resetDailyCounterIfNeeded();
  pruneMinuteWindows();
  const totalLookups = telemetry.cacheHits + telemetry.cacheMisses;
  return {
    cacheSize: cache.size,
    cacheHits: telemetry.cacheHits,
    cacheMisses: telemetry.cacheMisses,
    hitRatePct: totalLookups > 0 ? Number(((telemetry.cacheHits / totalLookups) * 100).toFixed(1)) : 0,
    twelveDataRecentRequests: twelveDataMinuteTimes.length,
    rateLimitMax: marketConfig.twelveDataMaxPerMin,
    rateLimitRemaining: Math.max(0, marketConfig.twelveDataMaxPerMin - twelveDataMinuteTimes.length),
    twelveDataDailyUsed: twelveDataDailyCount,
    twelveDataDailyLimit: marketConfig.twelveDataDailyLimit,
    finnhubRecentRequests: finnhubMinuteTimes.length,
    finnhubMaxPerMin: marketConfig.finnhubMaxPerMin,
  };
}

export function getMarketConfig() {
  return { ...marketConfig };
}

export function updateMarketConfig(patch = {}) {
  if (typeof patch.autoRefreshPaused === 'boolean') {
    marketConfig.autoRefreshPaused = patch.autoRefreshPaused;
  }
  if (Number.isFinite(Number(patch.quoteTtlSec)) && Number(patch.quoteTtlSec) >= 15) {
    marketConfig.quoteTtlMs = Math.min(3600, Number(patch.quoteTtlSec)) * 1000;
  }
  if (Number.isFinite(Number(patch.candleTtlSec)) && Number(patch.candleTtlSec) >= 30) {
    marketConfig.candleTtlMs = Math.min(7200, Number(patch.candleTtlSec)) * 1000;
  }
  return getMarketConfig();
}

export function clearMarketCache(prefix = '') {
  if (!prefix) {
    const count = cache.size;
    cache.clear();
    return count;
  }
  let removed = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export async function refreshSymbols(symbols = []) {
  const clean = [...new Set(symbols.map((s) => String(s).toUpperCase().trim()).filter(Boolean))].slice(0, 10);
  const results = [];
  for (const symbol of clean) {
    cache.delete(`quote:${symbol}`);
    try {
      const q = await getRealTimeQuote(symbol);
      results.push({ symbol, ok: true, price: q.currentPrice, provider: q.provider });
    } catch (err) {
      results.push({ symbol, ok: false, error: err.message });
    }
  }
  return results;
}

export async function getMarketDiagnostics() {
  const marketStatus = await getMarketStatus('US');
  const stats = getCacheStats();
  const cachedKeys = Array.from(cache.entries()).map(([key, entry]) => ({
    key,
    ageSeconds: Math.round((Date.now() - entry.timestamp) / 1000),
  }));

  return {
    marketStatus,
    config: getMarketConfig(),
    stats,
    providers: {
      twelveData: {
        configured: Boolean(env.twelveDataApiKey),
        tier: 'Free Tier (8 req/min, 800 req/day)',
        endpoints: ['/quote', '/time_series', '/symbol_search'],
        totalCalls: telemetry.twelveDataCalls,
        totalErrors: telemetry.twelveDataErrors,
        minuteUsed: stats.twelveDataRecentRequests,
        minuteMax: stats.rateLimitMax,
        dailyUsed: stats.twelveDataDailyUsed,
        dailyLimit: stats.twelveDataDailyLimit,
      },
      finnhub: {
        configured: Boolean(env.finnhubApiKey),
        tier: 'Free Tier (60 req/min)',
        endpoints: ['/quote', '/search', '/stock/market-status', '/news'],
        totalCalls: telemetry.finnhubCalls,
        totalErrors: telemetry.finnhubErrors,
        minuteUsed: stats.finnhubRecentRequests,
        minuteMax: stats.finnhubMaxPerMin,
      },
    },
    cachedKeys: cachedKeys.slice(0, 30),
    recentLogs: telemetry.recentLogs,
  };
}
