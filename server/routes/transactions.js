import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /api/transactions
router.get('/', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    // 1. Fetch stock transactions (buys/sells)
    const { data: stockTxns, error: sError } = await supabase
      .from('transactions')
      .select(`
        transaction_type,
        total_amount,
        executed_at,
        stocks (symbol)
      `)
      .eq('user_id', user.id);

    if (sError) console.warn('Could not fetch stock transactions:', sError.message);

    // 2. Fetch wallet transactions (deposits/withdrawals)
    const { data: walletTxns, error: wError } = await supabase
      .from('wallet_transactions')
      .select(`
        transaction_type,
        amount,
        created_at
      `)
      .eq('user_id', user.id);

    if (wError) console.warn('Could not fetch wallet transactions:', wError.message);

    // 3. Format and merge them into a single array
    const formatted = [
      ...(stockTxns || []).map(tx => ({
        tradeType: tx.transaction_type,
        symbol: tx.stocks?.symbol || 'UNKNOWN',
        amount: parseFloat(tx.total_amount),
        tradeEntered: tx.executed_at
      })),
      ...(walletTxns || []).map(tx => ({
        tradeType: tx.transaction_type,
        symbol: 'CASH',
        amount: parseFloat(tx.amount),
        tradeEntered: tx.created_at
      }))
    ];

    // 4. Sort by date descending (most recent first)
    formatted.sort((a, b) => new Date(b.tradeEntered) - new Date(a.tradeEntered));

    return res.json(formatted);
  } catch (err) {
    console.error('Transactions fetch error:', err);
    return res.status(500).json({ message: 'Could not load transactions.' });
  }
});

export default router;