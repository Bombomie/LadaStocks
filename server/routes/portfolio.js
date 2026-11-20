// routes/portfolio.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getRealTimeQuote, getTimeSeries } from '../middleware/stockService.js';

const router = express.Router();

async function fetchUserHoldingsRows(supabase, userId) {
  let { data, error } = await supabase
    .from('holdings')
    .select(`
      quantity,
      avg_buy_price,
      stocks (stock_id, symbol, company_name, exchange, sector, status)
    `)
    .eq('user_id', userId);

  if (error) {
    const fallback = await supabase
      .from('holdings')
      .select('quantity, avg_buy_price, stock_id')
      .eq('user_id', userId);

    if (fallback.error) throw fallback.error;

    const stockIds = (fallback.data || []).map((h) => h.stock_id);
    let stocks = [];
    if (stockIds.length) {
      const sRes = await supabase
        .from('stocks')
        .select('stock_id, symbol, company_name, exchange, sector, status')
        .in('stock_id', stockIds);
      stocks = sRes.data || [];
    }
    const stockMap = new Map(stocks.map((s) => [s.stock_id, s]));
    data = (fallback.data || []).map((h) => ({
      quantity: h.quantity,
      avg_buy_price: h.avg_buy_price,
      stocks: stockMap.get(h.stock_id) || { symbol: 'UNKNOWN', company_name: 'Unknown', exchange: null, sector: null, status: 'active' },
    }));
  }

  return (data || []).filter((h) => h.quantity > 0 && h.stocks);
}

// GET /api/portfolio/holdings
router.get('/holdings', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    const rows = await fetchUserHoldingsRows(supabase, user.id);

    const formatted = rows.map((h) => ({
      symbol: h.stocks.symbol,
      company: h.stocks.company_name || h.stocks.symbol,
      exchange: h.stocks.exchange || null,
      sector: h.stocks.sector || 'Unclassified',
      status: h.stocks.status || 'active',
      quantity: Number(h.quantity),
      avg_buy_price: parseFloat(h.avg_buy_price),
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('Holdings fetch error:', err);
    return res.status(500).json({ message: 'Could not load holdings.', detail: err.message });
  }
});

// GET /api/portfolio/summary
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    const [holdings, walletRes, realizedRes] = await Promise.all([
      fetchUserHoldingsRows(supabase, user.id),
      supabase
        .from('wallets')
        .select('balance, starting_balance')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('transactions')
        .select('realized_pnl')
        .eq('user_id', user.id)
        .eq('transaction_type', 'sell'),
    ]);

    if (walletRes.error) throw walletRes.error;

    const quotes = await Promise.all(
      holdings.map((h) =>
        getRealTimeQuote(h.stocks.symbol)
          .then((quote) => ({ symbol: h.stocks.symbol, quote }))
          .catch(() => ({ symbol: h.stocks.symbol, quote: null }))
      )
    );
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q.quote]));

    let portfolioValue = 0;
    let totalCost = 0;
    let todaysChange = 0;
    const sectorTotals = new Map();

    holdings.forEach((h) => {
      const sym = h.stocks.symbol;
      const q = quoteMap.get(sym);
      const price = parseFloat(q?.currentPrice || q?.close || q?.price || h.avg_buy_price || 0);
      const changePct = parseFloat(q?.change || q?.percent_change || 0);
      const value = price * h.quantity;
      const cost = parseFloat(h.avg_buy_price) * h.quantity;
      const sector = h.stocks.sector || 'Unclassified';

      portfolioValue += value;
      totalCost += cost;
      todaysChange += value * (changePct / 100);
      sectorTotals.set(sector, (sectorTotals.get(sector) || 0) + value);
    });

    const cashBalance = parseFloat(walletRes.data.balance || 0);
    const startingBalance = parseFloat(walletRes.data.starting_balance || 100000);
    const totalValue = portfolioValue + cashBalance;
    const unrealizedPnl = portfolioValue - totalCost;
    const realizedPnl = (realizedRes.data || []).reduce((sum, t) => sum + parseFloat(t.realized_pnl || 0), 0);
    const totalReturnPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;

    const sectorAllocation = Array.from(sectorTotals.entries())
      .map(([sector, value]) => ({
        sector,
        value,
        weightPct: portfolioValue > 0 ? (value / portfolioValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return res.json({
      portfolioValue,
      cashBalance,
      startingBalance,
      totalValue,
      totalCost,
      unrealizedPnl,
      realizedPnl,
      todaysChange,
      totalReturnPct,
      sectorAllocation,
    });
  } catch (err) {
    console.error('Portfolio summary error:', err);
    return res.status(500).json({ message: 'Could not load portfolio summary.', detail: err.message });
  }
});

// GET /api/portfolio/history
// Returns aggregated 30-day portfolio market value vs cost basis series
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    const holdings = await fetchUserHoldingsRows(supabase, user.id);

    if (!holdings.length) {
      return res.json([]);
    }

    const totalCost = holdings.reduce((sum, h) => sum + parseFloat(h.avg_buy_price) * h.quantity, 0);

    const seriesResults = await Promise.all(
      holdings.map((h) =>
        getTimeSeries(h.stocks.symbol, '1day', 30)
          .then((candles) => ({ holding: h, candles }))
          .catch(() => ({ holding: h, candles: [] }))
      )
    );

    const dateValues = new Map();
    seriesResults.forEach(({ holding, candles }) => {
      candles.forEach((c) => {
        const day = String(c.time).slice(0, 10);
        const val = parseFloat(c.close || 0) * holding.quantity;
        dateValues.set(day, (dateValues.get(day) || 0) + val);
      });
    });

    const history = Array.from(dateValues.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        value: Number(value.toFixed(2)),
        costBasis: Number(totalCost.toFixed(2)),
      }));

    return res.json(history);
  } catch (err) {
    console.error('Portfolio history error:', err);
    return res.status(500).json([]);
  }
});

export default router;
