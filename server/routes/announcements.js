// routes/announcements.js
import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /api/announcements — active announcements for authenticated users
router.get('/', requireAuth, async (req, res) => {
  try {
    const { supabase } = req.auth;
    const { data, error } = await supabase
      .from('announcements')
      .select('announcement_id, title, message, severity, is_pinned, created_at, updated_at')
      .eq('is_active', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('Announcements load error:', err);
    return res.status(500).json({ message: 'Could not load announcements.' });
  }
});

export default router;
