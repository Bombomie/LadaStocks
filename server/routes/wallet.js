import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

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
    
    return res.json({ balance: parseFloat(data.balance) });
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

    // Set starting point 30 days ago
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    historyMap.set(startDate.toISOString().split('T')[0], runningBalance);

    // Fetch stock transactions
    const { data: stockTxns } = await supabase
      .from('transactions')
      .select('total_amount, transaction_type, executed_at')
      .eq('user_id', user.id)
      .order('executed_at', { ascending: true });

    // Fetch wallet transactions (deposits/withdrawals)
    const { data: walletTxns } = await supabase
      .from('wallet_transactions')
      .select('amount, transaction_type, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    // Combine and process stock transactions
    if (stockTxns) {
      stockTxns.forEach(tx => {
        const amount = parseFloat(tx.total_amount);
        if (tx.transaction_type === 'buy') runningBalance -= amount;
        else if (tx.transaction_type === 'sell') runningBalance += amount;
        
        const dateStr = tx.executed_at.split('T')[0];
        historyMap.set(dateStr, runningBalance);
      });
    }

    // Combine and process wallet transactions
    if (walletTxns) {
      walletTxns.forEach(tx => {
        const amount = parseFloat(tx.amount);
        if (tx.transaction_type === 'deposit') runningBalance += amount;
        else if (tx.transaction_type === 'withdrawal') runningBalance -= amount;
        
        const dateStr = tx.created_at.split('T')[0];
        historyMap.set(dateStr, runningBalance);
      });
    }

    // Add today's actual current balance as the final point
    const todayStr = new Date().toISOString().split('T')[0];
    historyMap.set(todayStr, parseFloat(wallet.balance));

    // Convert map to array and sort by date
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
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount.' });
    }

    const { supabase, user } = req.auth;

    // 1. Update Wallet
    const { data: wallet, error: wError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();
      
    if (wError) throw wError;

    const newBalance = parseFloat(wallet.balance) + amount;
    const { error: updateError } = await supabase
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
      
    if (updateError) throw updateError;

    // 2. Log Transaction
    const { error: logError } = await supabase
      .from('wallet_transactions')
      .insert({ user_id: user.id, transaction_type: 'deposit', amount });
      
    if (logError) console.warn('Could not log wallet transaction:', logError.message);

    return res.json({ message: 'Deposit successful', balance: newBalance });
  } catch (err) {
    console.error('Deposit error:', err);
    return res.status(500).json({ message: 'Deposit failed.' });
  }
});

// POST /api/wallet/withdraw
router.post('/withdraw', requireAuth, async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount.' });
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

    const newBalance = parseFloat(wallet.balance) - amount;
    const { error: updateError } = await supabase
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
      
    if (updateError) throw updateError;

    const { error: logError } = await supabase
      .from('wallet_transactions')
      .insert({ user_id: user.id, transaction_type: 'withdrawal', amount });
      
    if (logError) console.warn('Could not log wallet transaction:', logError.message);

    return res.json({ message: 'Withdrawal successful', balance: newBalance });
  } catch (err) {
    console.error('Withdrawal error:', err);
    return res.status(500).json({ message: 'Withdrawal failed.' });
  }
});

export default router;