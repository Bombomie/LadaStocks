import express from 'express';
import { requireAdmin, requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(requireAuth, requireAdmin);

function sendDatabaseError(res, error) {
  const status = { 42501: 403, PT400: 400, PT404: 404, PT409: 409 }[error.code];
  if (status) return res.status(status).json({ message: error.message });
  console.error('Admin database error:', error);
  return res.status(500).json({ message: 'The admin request could not be completed.' });
}

function validateMutation(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ message: 'A JSON request body is required.' });
  }
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user ID.' });
  }
  next();
}

router.get('/users', async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_users');
  if (error) return sendDatabaseError(res, error);
  return res.json(data);
});

router.patch('/users/:id/status', validateMutation, async (req, res) => {
  const { status } = req.body ?? {};
  if (status !== 'active' && status !== 'suspended') {
    return res.status(400).json({ message: 'Invalid account status.' });
  }

  const { data, error } = await req.auth.supabase.rpc('lada_admin_set_status', {
    target_user_id: req.params.id,
    new_status: status,
  });
  if (error) return sendDatabaseError(res, error);
  return res.json({ status: data });
});

router.post('/users/:id/wallet', validateMutation, async (req, res) => {
  const { amount, direction, requestId } = req.body ?? {};
  if (typeof amount !== 'string' || !/^\d{1,12}(?:\.\d{1,2})?$/.test(amount) || Number(amount) === 0) {
    return res.status(400).json({ message: 'Enter a valid amount with up to two decimal places.' });
  }
  if (direction !== 'credit' && direction !== 'debit') {
    return res.status(400).json({ message: 'Invalid wallet adjustment type.' });
  }
  if (typeof requestId !== 'string' || !uuidPattern.test(requestId)) {
    return res.status(400).json({ message: 'Invalid request ID.' });
  }

  const { data, error } = await req.auth.supabase.rpc('lada_admin_adjust_wallet', {
    target_user_id: req.params.id,
    delta: direction === 'credit' ? amount : `-${amount}`,
    request_id: requestId,
  });
  if (error) return sendDatabaseError(res, error);
  return res.json({ balance: data });
});

export default router;
