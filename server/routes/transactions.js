// server/routes/transactions.js
import express from 'express';
import { env } from '../config/env.js';

const router = express.Router();

// GET /api/transactions
router.get('/', async (req, res) => {
  try {
    // NOTE: In a real app, you should get the user ID from the auth token/cookie
    // For now, we fetch recent transactions. You can add a filter like:
    // ?user_id=eq.YOUR_USER_ID
    
    const url = `${env.supabaseUrl}/rest/v1/transactions?select=*&order=executed_at.desc`;
    
    const response = await fetch(url, {
      headers: {
        apikey: env.supabaseKey,
        Authorization: `Bearer ${env.supabaseKey}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Supabase error:', errorData);
      throw new Error('Failed to fetch transactions from database');
    }

    const dbData = await response.json();

    // Map the DB columns to what the frontend expects
    const formattedData = dbData.map(tx => ({
      tradeType: tx.transaction_type,       // 'buy', 'sell', etc.
      symbol: tx.stock_id,                 // Assuming stock_id is the ticker symbol (e.g., AAPL)
      shares: tx.quantity,
      limitPrice: tx.price_per_share,
      tradeEntered: tx.executed_at,        // ISO string
      confirmation: tx.transaction_id ? tx.transaction_id.substring(0, 8) : '—', // Short ID for UI
      status: 'Executed',
      description: 'Order Executed',
      isDollarValue: false
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Transactions route error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;