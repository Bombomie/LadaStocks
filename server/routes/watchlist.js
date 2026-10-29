// routes/watchlist.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getRealTimeQuote } from '../middleware/stockService.js';

const router = express.Router();

async function findOrCreateStock(supabase, symbol) {
  let { data: stock, error: sError } = await supabase
    .from('stocks')
    .select('stock_id, company_name, exchange')
    .eq('symbol', symbol)
    .single();

  if (sError && sError.code !== 'PGRST116') throw sError;

  if (!stock) {
    const quote = await getRealTimeQuote(symbol);
    const { data: newStock, error: insertErr } = await supabase
      .from('stocks')
      .insert({
        symbol,
        company_name: quote?.name || symbol,
        exchange: quote?.exchange || null,
      })
      .select('stock_id, company_name, exchange')
      .single();
    if (insertErr) throw insertErr;
    stock = newStock;
  }

  return stock;
}

// GET /api/watchlist
router.get('/', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    const { data, error } = await supabase
      .from('watchlist_items')
      .select(`
        watchlist_id,
        added_at,
        target_price,
        stocks (stock_id, symbol, company_name, exchange)
      `)
      .eq('user_id', user.id)
      .order('added_at', { ascending: true });

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('Watchlist fetch error:', err);
    return res.status(500).json({ message: 'Could not load watchlist.' });
  }
});

// GET /api/watchlist/with-quotes
router.get('/with-quotes', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    const { data, error } = await supabase
      .from('watchlist_items')
      .select(`
        watchlist_id,
        added_at,
        target_price,
        stocks (stock_id, symbol, company_name, exchange)
      `)
      .eq('user_id', user.id)
      .order('added_at', { ascending: true });

    if (error) throw error;
    if (!data || !data.length) return res.json([]);

    const quotePromises = data.map(item =>
      getRealTimeQuote(item.stocks.symbol)
        .then(quote => ({ symbol: item.stocks.symbol, quote }))
        .catch(() => ({ symbol: item.stocks.symbol, quote: null }))
    );
    const quotes = await Promise.all(quotePromises);
    const quoteMap = new Map(quotes.map(q => [q.symbol, q.quote]));

    const result = data.map(item => {
      const q = quoteMap.get(item.stocks.symbol);
      const currentPrice = parseFloat(q?.close || q?.current_price || 0);
      const targetPrice = item.target_price ? parseFloat(item.target_price) : null;

      // Calculate change based on target price if set, otherwise daily change
      let changePct;
      let changeType;
      if (targetPrice && targetPrice > 0) {
        changePct = ((currentPrice - targetPrice) / targetPrice) * 100;
        changeType = 'target';
      } else {
        changePct = parseFloat(q?.percent_change) || 0;
        changeType = 'daily';
      }

      return {
        watchlist_id: item.watchlist_id,
        added_at: item.added_at,
        symbol: item.stocks.symbol,
        company: item.stocks.company_name || item.stocks.symbol,
        exchange: item.stocks.exchange,
        price: currentPrice,
        target_price: targetPrice,
        changePct,
        changeType,
        dailyChangePct: parseFloat(q?.percent_change) || 0,
        open: parseFloat(q?.open) || 0,
        high: parseFloat(q?.high) || 0,
        low: parseFloat(q?.low) || 0,
        volume: q?.volume ? Number(q.volume).toLocaleString('en-US') : '—',
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('Watchlist with-quotes error:', err);
    return res.status(500).json({ message: 'Could not load watchlist.' });
  }
});

// POST /api/watchlist
router.post('/', requireAuth, async (req, res) => {
  try {
    const symbol = String(req.body.symbol || '').toUpperCase().trim();
    if (!symbol) return res.status(400).json({ message: 'Symbol is required.' });

    const { supabase, user } = req.auth;

    try {
      await getRealTimeQuote(symbol);
    } catch {
      return res.status(400).json({ message: `Symbol "${symbol}" could not be found.` });
    }

    const stock = await findOrCreateStock(supabase, symbol);

    const { error: wError } = await supabase
      .from('watchlist_items')
      .insert({
        user_id: user.id,
        stock_id: stock.stock_id,
      });

    if (wError) {
      if (wError.code === '23505') {
        return res.status(409).json({ message: `${symbol} is already in your watchlist.` });
      }
      throw wError;
    }

    return res.status(201).json({
      message: `Added ${symbol} to watchlist.`,
      symbol,
      company_name: stock.company_name,
    });
  } catch (err) {
    console.error('Add to watchlist error:', err);
    return res.status(500).json({ message: err.message || 'Could not add to watchlist.' });
  }
});

// PATCH /api/watchlist/:symbol
// Update the target price for a watchlist item
router.patch('/:symbol', requireAuth, async (req, res) => {
  try {
    const { symbol } = req.params;
    const targetPrice = req.body.target_price;

    // Allow null (to clear the target price) or a positive number
    if (targetPrice !== null && (isNaN(parseFloat(targetPrice)) || parseFloat(targetPrice) <= 0)) {
      return res.status(400).json({ message: 'Target price must be a positive number or null.' });
    }

    const { supabase, user } = req.auth;

    const { data: stock } = await supabase
      .from('stocks')
      .select('stock_id')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (!stock) return res.status(404).json({ message: 'Stock not found.' });

    const { error } = await supabase
      .from('watchlist_items')
      .update({
        target_price: targetPrice ? parseFloat(targetPrice) : null,
      })
      .eq('user_id', user.id)
      .eq('stock_id', stock.stock_id);

    if (error) throw error;

    return res.json({
      message: targetPrice
        ? `Target price set to $${parseFloat(targetPrice).toFixed(2)} for ${symbol}.`
        : `Target price cleared for ${symbol}.`,
      target_price: targetPrice ? parseFloat(targetPrice) : null,
    });
  } catch (err) {
    console.error('Update target price error:', err);
    return res.status(500).json({ message: 'Could not update target price.' });
  }
});

// DELETE /api/watchlist/:symbol
router.delete('/:symbol', requireAuth, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { supabase, user } = req.auth;

    const { data: stock } = await supabase
      .from('stocks')
      .select('stock_id')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (!stock) return res.status(404).json({ message: 'Stock not found.' });

    const { error } = await supabase
      .from('watchlist_items')
      .delete()
      .eq('user_id', user.id)
      .eq('stock_id', stock.stock_id);

    if (error) throw error;

    return res.json({ message: `Removed ${symbol} from watchlist.` });
  } catch (err) {
    console.error('Remove from watchlist error:', err);
    return res.status(500).json({ message: 'Could not remove from watchlist.' });
  }
});

export default router;