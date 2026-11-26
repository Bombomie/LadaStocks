// routes/wallet.js
import express from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/requireAuth.js';
import { updateWalletBalance, walletChangedMessage } from '../utils/updateWalletBalance.js';

const router = express.Router();

// GET /api/wallet
router.get('/', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    const { data, error } = await supabase
      .from('wallets')
      .select('balance, starting_balance')
      .eq('user_id', user.id)
      .single();

    if (error) return res.status(500).json({ message: 'Could not load wallet.' });

    return res.json({
      balance: parseFloat(data.balance),
      starting_balance: parseFloat(data.starting_balance),
    });
  } catch (err) {
    console.error('Wallet fetch error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// GET /api/wallet/history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    const { data: wallet, error: wError } = await supabase
      .from('wallets')
      .select('balance, starting_balance')
      .eq('user_id', user.id)
      .single();

    if (wError) throw wError;

    let runningBalance = parseFloat(wallet.starting_balance);
    const historyMap = new Map();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    historyMap.set(startDate.toISOString().split('T')[0], runningBalance);

    const [{ data: stockTxns }, { data: walletTxns }] = await Promise.all([
      supabase
        .from('transactions')
        .select('total_amount, transaction_type, executed_at')
        .eq('user_id', user.id)
        .order('executed_at', { ascending: true }),
      supabase
        .from('wallet_transactions')
        .select('amount, transaction_type, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
    ]);

    const events = [
      ...(stockTxns || []).map((tx) => ({
        ts: tx.executed_at,
        delta: tx.transaction_type === 'buy' ? -parseFloat(tx.total_amount) : parseFloat(tx.total_amount),
      })),
      ...(walletTxns || []).map((tx) => ({
        ts: tx.created_at,
        delta: tx.transaction_type === 'deposit' ? parseFloat(tx.amount) : -parseFloat(tx.amount),
      })),
    ].sort((a, b) => new Date(a.ts) - new Date(b.ts));

    events.forEach((ev) => {
      runningBalance += ev.delta;
      const dateStr = String(ev.ts).split('T')[0];
      historyMap.set(dateStr, Number(runningBalance.toFixed(2)));
    });

    const todayStr = new Date().toISOString().split('T')[0];
    historyMap.set(todayStr, parseFloat(wallet.balance));

    const history = Array.from(historyMap.entries())
      .map(([date, balance]) => ({ date, balance }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.json(history);
  } catch (err) {
    console.error('Wallet history error:', err);
    return res.status(500).json([]);
  }
});

// POST /api/wallet/deposit
router.post('/deposit', requireAuth, async (req, res) => {
  try {
    const amount = Number(parseFloat(req.body.amount).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      return res.status(400).json({ message: 'Enter a valid deposit amount up to $10,000,000.' });
    }

    const { supabase, user } = req.auth;

    const { data: wallet, error: wError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (wError) throw wError;

    const newBalance = await updateWalletBalance(
      supabase,
      user.id,
      wallet.balance,
      Number((Number(wallet.balance) + amount).toFixed(2))
    );
    if (newBalance === null) return res.status(409).json({ message: walletChangedMessage });

    const confirmationId = `WL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: logError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: user.id,
        transaction_type: 'deposit',
        amount,
        confirmation_id: confirmationId,
        reason: 'User Deposit',
      });

    if (logError) console.warn('Could not log wallet transaction:', logError.message);

    return res.json({
      message: `Deposited $${amount.toFixed(2)} (${confirmationId}).`,
      balance: newBalance,
      confirmation_id: confirmationId,
    });
  } catch (err) {
    console.error('Deposit error:', err);
    return res.status(500).json({ message: 'Deposit failed.' });
  }
});

// POST /api/wallet/withdraw
router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const amount = Number(parseFloat(req.body.amount).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Enter a valid withdrawal amount.' });
    }

    const { supabase, user } = req.auth;

    const { data: wallet, error: wError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (wError) throw wError;

    if (parseFloat(wallet.balance) < amount) {
      return res.status(400).json({ message: 'Insufficient funds.' });
    }

    const newBalance = await updateWalletBalance(
      supabase,
      user.id,
      wallet.balance,
      Number((Number(wallet.balance) - amount).toFixed(2))
    );
    if (newBalance === null) return res.status(409).json({ message: walletChangedMessage });

    const confirmationId = `WL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: logError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: user.id,
        transaction_type: 'withdrawal',
        amount,
        confirmation_id: confirmationId,
        reason: 'User Withdrawal',
      });

    if (logError) console.warn('Could not log wallet transaction:', logError.message);

    return res.json({
      message: `Withdrew $${amount.toFixed(2)} (${confirmationId}).`,
      balance: newBalance,
      confirmation_id: confirmationId,
    });
  } catch (err) {
    console.error('Withdrawal error:', err);
    return res.status(500).json({ message: 'Withdrawal failed.' });
  }
});

export default router;
