// routes/portfolio.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getRealTimeQuote } from '../middleware/stockService.js';

const router = express.Router();

// GET /api/portfolio/holdings
router.get('/holdings', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    // Try the joined query first
    let { data, error } = await supabase
      .from('holdings')
      .select(`
        quantity,
        avg_buy_price,
        stocks (symbol, company_name, exchange)
      `)
      .eq('user_id', user.id);

    // If the join fails (e.g. RLS on stocks), fall back to holdings-only
    if (error) {
      console.warn('Joined query failed, falling back:', error.message);
      const fallback = await supabase
        .from('holdings')
        .select('quantity, avg_buy_price, stock_id')
        .eq('user_id', user.id);

      if (fallback.error) throw fallback.error;

      // Fetch stock symbols individually
      const stockIds = fallback.data.map(h => h.stock_id);
      const { data: stocks } = await supabase
        .from('stocks')
        .select('stock_id, symbol, company_name, exchange')
        .in('stock_id', stockIds);

      const stockMap = new Map((stocks || []).map(s => [s.stock_id, s]));

      data = fallback.data.map(h => ({
        quantity: h.quantity,
        avg_buy_price: h.avg_buy_price,
        stocks: stockMap.get(h.stock_id) || { symbol: 'UNKNOWN', company_name: 'Unknown', exchange: null },
      }));
    }

    const formatted = (data || [])
      .filter(h => h.quantity > 0 && h.stocks)
      .map(h => ({
        symbol: h.stocks.symbol,
        company: h.stocks.company_name || h.stocks.symbol,
        exchange: h.stocks.exchange,
        quantity: h.quantity,
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

    const [holdingsRes, walletRes] = await Promise.all([
      supabase
        .from('holdings')
        .select(`
          quantity,
          avg_buy_price,
          stocks (symbol)
        `)
        .eq('user_id', user.id),
      supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single(),
    ]);

    if (holdingsRes.error) throw holdingsRes.error;
    if (walletRes.error) throw walletRes.error;

    const holdings = (holdingsRes.data || []).filter(h => h.quantity > 0 && h.stocks);

    const quotePromises = holdings.map(h =>
      getRealTimeQuote(h.stocks.symbol)
        .then(quote => ({ symbol: h.stocks.symbol, quote }))
        .catch(() => ({ symbol: h.stocks.symbol, quote: null }))
    );
    const quotes = await Promise.all(quotePromises);
    const quoteMap = new Map(quotes.map(q => [q.symbol, q.quote]));

    let portfolioValue = 0;
    let totalCost = 0;
    let todaysChange = 0;

    holdings.forEach(h => {
      const q = quoteMap.get(h.stocks.symbol);
      const price = parseFloat(q?.currentPrice || q?.close || q?.price || 0);
      const changePct = parseFloat(q?.change || q?.percent_change || 0);
      const value = price * h.quantity;
      portfolioValue += value;
      totalCost += parseFloat(h.avg_buy_price) * h.quantity;
      todaysChange += value * (changePct / 100);
    });

    const cashBalance = parseFloat(walletRes.data.balance);
    const totalValue = portfolioValue + cashBalance;
    const totalReturnPct = totalCost ? ((portfolioValue - totalCost) / totalCost) * 100 : 0;

    return res.json({
      portfolioValue,
      cashBalance,
      totalValue,
      totalCost,
      todaysChange,
      totalReturnPct,
    });
  } catch (err) {
    console.error('Portfolio summary error:', err);
    return res.status(500).json({ message: 'Could not load portfolio summary.', detail: err.message });
  }
});

export default router;