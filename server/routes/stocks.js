// routes/stocks.js
import express from 'express';
import { createSupabaseClient } from '../config/supabase.js';
import {
  getTimeSeries,
  getRealTimeQuote,
  searchSymbols,
  getCacheStats,
  getMarketStatus,
  getMarketNews,
} from '../middleware/stockService.js';

const router = express.Router();

// GET /api/stocks/cache-stats
router.get('/cache-stats', (_req, res) => {
  res.json(getCacheStats());
});

// GET /api/stocks/market-status
router.get('/market-status', async (_req, res) => {
  try {
    const status = await getMarketStatus('US');
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load market status.' });
  }
});

// GET /api/stocks/news
router.get('/news', async (_req, res) => {
  try {
    const news = await getMarketNews('general');
    res.json({ success: true, data: news });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load market news.' });
  }
});

// GET /api/stocks/supported
router.get('/supported', async (_req, res) => {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from('stocks')
      .select('stock_id, symbol, company_name, exchange, sector, status')
      .order('symbol', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load supported stocks.' });
  }
});

// GET /api/stocks/candles/:symbol
router.get('/candles/:symbol', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').toUpperCase().trim();
    const interval = String(req.query.interval || '1day');
    const outputsize = Math.min(500, Math.max(5, parseInt(req.query.outputsize, 10) || 90));

    const candleData = await getTimeSeries(symbol, interval, outputsize);
    res.status(200).json({
      success: true,
      symbol,
      interval,
      data: candleData,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/stocks/quote/:symbol
router.get('/quote/:symbol', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').toUpperCase().trim();
    const quoteData = await getRealTimeQuote(symbol);
    res.status(200).json({
      success: true,
      data: quoteData,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/stocks/search/:query
router.get('/search/:query', async (req, res) => {
  try {
    const query = String(req.params.query || '').trim();
    const searchResults = await searchSymbols(query);
    res.status(200).json({
      success: true,
      data: searchResults,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
