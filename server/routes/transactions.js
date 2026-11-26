// routes/transactions.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /api/transactions
router.get('/', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    // 1. Fetch stock transactions (buys/sells) with full details
    const { data: stockTxns, error: sError } = await supabase
      .from('transactions')
      .select(`
        transaction_id,
        transaction_type,
        quantity,
        price_per_share,
        total_amount,
        realized_pnl,
        confirmation_id,
        review_status,
        review_note,
        executed_at,
        stocks (symbol, company_name, exchange)
      `)
      .eq('user_id', user.id)
      .order('executed_at', { ascending: false });

    if (sError) console.warn('Could not fetch stock transactions:', sError.message);

    // 2. Fetch wallet transactions (deposits/withdrawals)
    const { data: walletTxns, error: wError } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (wError) console.warn('Could not fetch wallet transactions:', wError.message);

    // 3. Merge and normalize fields for transactions.js and wallet.js
    const formatted = [
      ...(stockTxns || []).map((tx) => {
        const qty = Number(tx.quantity || 0);
        const pps = parseFloat(tx.price_per_share || 0);
        const total = parseFloat(tx.total_amount || 0);
        const conf = tx.confirmation_id || `LS-${String(tx.transaction_id).slice(0, 8).toUpperCase()}`;
        const statusLabel = tx.review_status || 'executed';

        return {
          id: tx.transaction_id,
          category: 'trade',
          tradeType: String(tx.transaction_type || '').toUpperCase(),
          symbol: tx.stocks?.symbol || 'UNKNOWN',
          company: tx.stocks?.company_name || tx.stocks?.symbol || 'Unknown',
          shares: qty,
          quantity: qty,
          pricePerShare: pps,
          limitPrice: pps,
          amount: total,
          totalAmount: total,
          realizedPnl: tx.realized_pnl != null ? parseFloat(tx.realized_pnl) : null,
          tradeEntered: tx.executed_at,
          confirmation: conf,
          confirmation_id: conf,
          status: statusLabel,
          reviewNote: tx.review_note || null,
          description: statusLabel === 'flagged'
            ? 'Flagged for Review'
            : statusLabel === 'rejected'
              ? 'Order Rejected'
              : `Market Order Executed (${qty} sh @ $${pps.toFixed(2)})`,
        };
      }),
      ...(walletTxns || []).map((tx, idx) => {
        const amt = parseFloat(tx.amount || 0);
        const pk = tx.wallet_tx_id || tx.transaction_id || tx.id;
        const conf = tx.confirmation_id || (pk ? `WL-${String(pk).slice(0, 8).toUpperCase()}` : `WL-${String(idx + 1).padStart(6, '0')}`);
        const typeUpper = String(tx.transaction_type || 'deposit').toUpperCase();

        return {
          id: pk || `${tx.created_at}-${idx}`,
          category: 'wallet',
          tradeType: typeUpper,
          symbol: 'CASH',
          company: 'Simulation Wallet',
          shares: null,
          quantity: null,
          pricePerShare: null,
          limitPrice: 'CASH',
          amount: amt,
          totalAmount: amt,
          realizedPnl: null,
          tradeEntered: tx.created_at,
          confirmation: conf,
          confirmation_id: conf,
          status: 'executed',
          reviewNote: null,
          description: tx.reason || (typeUpper === 'DEPOSIT' ? 'Wallet Deposit' : 'Wallet Withdrawal'),
        };
      }),
    ];

    formatted.sort((a, b) => new Date(b.tradeEntered) - new Date(a.tradeEntered));
    return res.json(formatted);
  } catch (err) {
    console.error('Transactions fetch error:', err);
    return res.status(500).json({ message: 'Could not load transactions.' });
  }
});

export default router;
