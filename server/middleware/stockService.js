// server/middleware/stockService.js
import { env } from '../config/env.js';

const BASE_URL = 'https://api.twelvedata.com';

/**
 * Fetches time series data for a specific symbol
 */
export const getTimeSeries = async (symbol, interval = '1day', outputsize = 30) => {
  try {
    const url = `${BASE_URL}/time_series?symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&apikey=${env.twelveDataApiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    // Twelve Data returns a status: 'error' if something goes wrong
    if (data.status === 'error') {
      throw new Error(data.message || 'Failed to fetch stock data');
    }

    // Format the data for Plotly JS candlestick charts
    // Note: Twelve Data returns newest first, so we reverse it for chronological charting
    return data.values.map(item => ({
      time: item.datetime,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close)
    })).reverse();
    
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error.message);
    throw new Error('Failed to fetch stock data');
  }
};

/**
 * Fetches the real-time quote for a symbol
 */
export const getRealTimeQuote = async (symbol) => {
  try {
    const url = `${BASE_URL}/quote?symbol=${symbol}&apikey=${env.twelveDataApiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'error') {
      throw new Error(data.message || 'Failed to fetch real-time quote');
    }

    return {
      symbol: data.symbol,
      name: data.name,
      currentPrice: parseFloat(data.close),
      highOfDay: parseFloat(data.high),
      lowOfDay: parseFloat(data.low),
      change: parseFloat(data.percent_change)
    };
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error.message);
    throw new Error('Failed to fetch real-time quote');
  }
};

// Add this to server/middleware/stockService.js

/**
 * Searches for stock symbols based on user input
 */
export const searchSymbols = async (query) => {
  try {
    const url = `${BASE_URL}/symbol_search?symbol=${query}&apikey=${env.twelveDataApiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'error') {
      throw new Error(data.message || 'Failed to search symbols');
    }

    // Return only the top 8 results to keep the dropdown clean
    return data.data.slice(0, 8).map(item => ({
      symbol: item.symbol,
      name: item.instrument_name,
      exchange: item.exchange
    }));
  } catch (error) {
    console.error(`Error searching symbols for ${query}:`, error.message);
    throw new Error('Failed to search symbols');
  }
};