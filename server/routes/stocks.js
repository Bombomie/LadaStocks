// routes/stocks.js
import express from 'express';

import { getTimeSeries, getRealTimeQuote, searchSymbols } from '../middleware/stockService.js';

const router = express.Router();

// GET /api/stocks/candles/:symbol
router.get('/candles/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '1day', outputsize = 30 } = req.query;

    const candleData = await getTimeSeries(
      symbol.toUpperCase(),
      interval,
      parseInt(outputsize)
    );

    res.status(200).json({
      success: true,
      symbol: symbol.toUpperCase(),
      data: candleData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/stocks/quote/:symbol
router.get('/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const quoteData = await getRealTimeQuote(symbol.toUpperCase());

    res.status(200).json({
      success: true,
      data: quoteData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/stocks/search/:query
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const searchResults = await searchSymbols(query.toUpperCase());

    res.status(200).json({
      success: true,
      data: searchResults
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


export default router;