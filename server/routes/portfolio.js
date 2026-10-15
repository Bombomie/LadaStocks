import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /api/portfolio/holdings
router.get('/holdings', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    
    const { data, error } = await supabase
      .from('holdings')
      .select(`
        quantity,
        stocks (symbol)
      `)
      .eq('user_id', user.id);

    if (error) throw error;

    // Map to format expected by frontend wallet.js
    const formatted = data.map(h => ({
      symbol: h.stocks?.symbol,
      quantity: h.quantity
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('Holdings fetch error:', err);
    return res.status(500).json({ message: 'Could not load holdings.' });
  }
});

export default router;