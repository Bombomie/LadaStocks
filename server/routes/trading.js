// routes/trading.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getRealTimeQuote } from '../middleware/stockService.js';

const router = express.Router();

// Fetch live price + metadata from Twelve Data (single source of truth)
async function getStockData(symbol) {
  const quote = await getRealTimeQuote(symbol.toUpperCase());
  const price = parseFloat(quote?.close || quote?.currentPrice || quote?.price);
  if (!price || price <= 0) {
    throw new Error(`Could not fetch current price for ${symbol}.`);
  }
  return {
    price,
    name: quote?.name || symbol,
    exchange: quote?.exchange || null,
  };
}

// POST /api/trading/buy
router.post('/buy', requireAuth, async (req, res) => {
  try {
    const symbol = String(req.body.symbol || '').toUpperCase();
    const quantity = parseInt(req.body.quantity);

    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Symbol and a valid quantity are required.' });
    }

    const { supabase, user } = req.auth;

    // 1. Fetch live price + stock metadata
    const stockData = await getStockData(symbol);
    const pricePerShare = stockData.price;
    const totalCost = pricePerShare * quantity;

    // 2. Check wallet balance
    const { data: wallet, error: wError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();
    if (wError) throw wError;

    const currentBalance = parseFloat(wallet.balance);
    if (currentBalance < totalCost) {
      return res.status(400).json({
        message: `Insufficient funds. You need $${totalCost.toFixed(2)} but have $${currentBalance.toFixed(2)}.`,
      });
    }

    // 3. Find or create stock record
    let { data: stock, error: sError } = await supabase
      .from('stocks')
      .select('stock_id')
      .eq('symbol', symbol)
      .single();

    // PGRST116 = no rows found; that's fine, we'll insert
    if (sError && sError.code !== 'PGRST116') throw sError;

    if (!stock) {
      const { data: newStock, error: insertErr } = await supabase
        .from('stocks')
        .insert({
          symbol,
          company_name: stockData.name,
          exchange: stockData.exchange,
        })
        .select('stock_id')
        .single();
      if (insertErr) throw insertErr;
      stock = newStock;
    }

    // 4. Deduct cash from wallet
    const newBalance = currentBalance - totalCost;
    const { error: walletUpdateErr } = await supabase
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (walletUpdateErr) throw walletUpdateErr;

    // 5. Update holdings (calculate weighted average buy price)
    const { data: existingHolding } = await supabase
      .from('holdings')
      .select('quantity, avg_buy_price')
      .eq('user_id', user.id)
      .eq('stock_id', stock.stock_id)
      .single();

    if (existingHolding) {
      const oldQty = existingHolding.quantity;
      const oldAvg = parseFloat(existingHolding.avg_buy_price);
      const newQty = oldQty + quantity;
      const newAvg = ((oldQty * oldAvg) + (quantity * pricePerShare)) / newQty;

      const { error: holdUpdateErr } = await supabase
        .from('holdings')
        .update({
          quantity: newQty,
          avg_buy_price: newAvg,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('stock_id', stock.stock_id);
      if (holdUpdateErr) throw holdUpdateErr;
    } else {
      const { error: holdInsertErr } = await supabase
        .from('holdings')
        .insert({
          user_id: user.id,
          stock_id: stock.stock_id,
          quantity,
          avg_buy_price: pricePerShare,
        });
      if (holdInsertErr) throw holdInsertErr;
    }

    // 6. Log the transaction
    const { error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        stock_id: stock.stock_id,
        transaction_type: 'buy',
        quantity,
        price_per_share: pricePerShare,
        total_amount: totalCost,
        executed_at: new Date().toISOString(),
      });
    if (txErr) throw txErr;

    return res.json({
      message: `Bought ${quantity} share(s) of ${symbol} at $${pricePerShare.toFixed(2)} (${stockData.name}).`,
      transaction: {
        symbol,
        name: stockData.name,
        quantity,
        price_per_share: pricePerShare,
        total_amount: totalCost,
      },
      new_balance: newBalance,
    });
  } catch (err) {
    console.error('Buy error:', err);
    return res.status(500).json({ message: err.message || 'Buy order failed.' });
  }
});

// POST /api/trading/sell
router.post('/sell', requireAuth, async (req, res) => {
  try {
    const symbol = String(req.body.symbol || '').toUpperCase();
    const quantity = parseInt(req.body.quantity);

    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Symbol and a valid quantity are required.' });
    }

    const { supabase, user } = req.auth;

    // 1. Find the stock record
    const { data: stock, error: sError } = await supabase
      .from('stocks')
      .select('stock_id, company_name')
      .eq('symbol', symbol)
      .single();
    if (sError || !stock) {
      return res.status(400).json({
        message: `Stock ${symbol} is not yet tracked. Buy some shares first.`,
      });
    }

    // 2. Check user's holding
    const { data: holding, error: hError } = await supabase
      .from('holdings')
      .select('quantity, avg_buy_price')
      .eq('user_id', user.id)
      .eq('stock_id', stock.stock_id)
      .single();

    if (hError || !holding || holding.quantity === 0) {
      return res.status(400).json({ message: `You don't own any shares of ${symbol}.` });
    }

    if (holding.quantity < quantity) {
      return res.status(400).json({
        message: `Insufficient shares. You own ${holding.quantity} but tried to sell ${quantity}.`,
      });
    }

    // 3. Fetch live price
    const stockData = await getStockData(symbol);
    const pricePerShare = stockData.price;
    const totalProceeds = pricePerShare * quantity;

    // 4. Add cash to wallet
    const { data: wallet, error: wError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();
    if (wError) throw wError;

    const newBalance = parseFloat(wallet.balance) + totalProceeds;
    const { error: walletUpdateErr } = await supabase
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (walletUpdateErr) throw walletUpdateErr;

    // 5. Update holdings (delete row if fully sold)
    const newQty = holding.quantity - quantity;
    if (newQty === 0) {
      const { error: holdDeleteErr } = await supabase
        .from('holdings')
        .delete()
        .eq('user_id', user.id)
        .eq('stock_id', stock.stock_id);
      if (holdDeleteErr) throw holdDeleteErr;
    } else {
      const { error: holdUpdateErr } = await supabase
        .from('holdings')
        .update({
          quantity: newQty,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('stock_id', stock.stock_id);
      if (holdUpdateErr) throw holdUpdateErr;
    }

    // 6. Log the transaction
    const { error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        stock_id: stock.stock_id,
        transaction_type: 'sell',
        quantity,
        price_per_share: pricePerShare,
        total_amount: totalProceeds,
        executed_at: new Date().toISOString(),
      });
    if (txErr) throw txErr;

    return res.json({
      message: `Sold ${quantity} share(s) of ${symbol} at $${pricePerShare.toFixed(2)}.`,
      transaction: {
        symbol,
        name: stock.company_name || stockData.name,
        quantity,
        price_per_share: pricePerShare,
        total_amount: totalProceeds,
      },
      new_balance: newBalance,
    });
  } catch (err) {
    console.error('Sell error:', err);
    return res.status(500).json({ message: err.message || 'Sell order failed.' });
  }
});

// GET /api/trading/position/:symbol
// Returns the user's current holding for a specific symbol (0 if none)
router.get('/position/:symbol', requireAuth, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { supabase, user } = req.auth;

    const { data: stock } = await supabase
      .from('stocks')
      .select('stock_id')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (!stock) {
      return res.json({ quantity: 0, avg_buy_price: 0 });
    }

    const { data: holding } = await supabase
      .from('holdings')
      .select('quantity, avg_buy_price')
      .eq('user_id', user.id)
      .eq('stock_id', stock.stock_id)
      .single();

    return res.json({
      quantity: holding?.quantity || 0,
      avg_buy_price: holding ? parseFloat(holding.avg_buy_price) : 0,
    });
  } catch (err) {
    console.error('Position fetch error:', err);
    return res.status(500).json({ message: 'Could not fetch position.' });
  }
});

// GET /api/trading/balance
// Returns the user's current cash balance (for the trade panel)
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();
    if (error) throw error;
    return res.json({ balance: parseFloat(wallet.balance) });
  } catch (err) {
    console.error('Balance fetch error:', err);
    return res.status(500).json({ message: 'Could not fetch balance.' });
  }
});

export default router;