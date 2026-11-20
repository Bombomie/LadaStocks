// routes/admin.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, requireAuth } from '../middleware/requireAuth.js';
import {
  clearMarketCache,
  getMarketDiagnostics,
  refreshSymbols,
  updateMarketConfig,
} from '../middleware/stockService.js';
import { env } from '../config/env.js';

const router = express.Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(requireAuth, requireAdmin);

function sendDatabaseError(res, error) {
  const status = { 42501: 403, PT400: 400, PT404: 404, PT409: 409 }[error.code];
  if (status) return res.status(status).json({ message: error.message });
  console.error('Admin database error:', error);
  return res.status(500).json({ message: error.message || 'The admin request could not be completed.' });
}

function validateUuidParam(paramName = 'id') {
  return (req, res, next) => {
    if (!uuidPattern.test(req.params[paramName] || '')) {
      return res.status(400).json({ message: `Invalid ${paramName} identifier.` });
    }
    next();
  };
}

function requireJsonBody(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ message: 'A JSON request body is required.' });
  }
  next();
}

// === 1. Overview & System Dashboard ===

router.get('/overview', async (req, res) => {
  const [overviewRes, diagnostics] = await Promise.all([
    req.auth.supabase.rpc('lada_admin_overview'),
    getMarketDiagnostics().catch(() => null),
  ]);
  if (overviewRes.error) return sendDatabaseError(res, overviewRes.error);
  return res.json({
    ...(overviewRes.data || {}),
    marketStatus: diagnostics?.marketStatus || null,
    cacheStats: diagnostics?.stats || null,
  });
});

// === 2. User Management ===

router.get('/users', async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_users');
  if (error) return sendDatabaseError(res, error);
  return res.json(data || []);
});

router.patch('/users/:id/status', requireJsonBody, validateUuidParam('id'), async (req, res) => {
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

// Edit locked profile fields (username, email, birth_date) on behalf of a user
router.patch('/users/:id/profile', requireJsonBody, validateUuidParam('id'), async (req, res) => {
  const { username, email, birth_date } = req.body ?? {};
  const cleanUsername = username !== undefined ? String(username).trim() : null;
  const cleanEmail = email !== undefined ? String(email).trim().toLowerCase() : null;
  const cleanBirthDate = birth_date !== undefined && birth_date !== '' ? String(birth_date).trim() : null;

  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (cleanBirthDate && !/^\d{4}-\d{2}-\d{2}$/.test(cleanBirthDate)) {
    return res.status(400).json({ message: 'Birth date must use YYYY-MM-DD format.' });
  }

  // If service role key is present and email is changing, sync Supabase Auth user email too
  if (cleanEmail && env.supabaseServiceRoleKey) {
    try {
      const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: authErr } = await adminClient.auth.admin.updateUserById(req.params.id, {
        email: cleanEmail,
        email_confirm: true,
      });
      if (authErr) {
        return res.status(400).json({ message: authErr.message || 'Could not update Auth email.' });
      }
    } catch (err) {
      return res.status(500).json({ message: err.message || 'Auth sync failed.' });
    }
  }

  const { data, error } = await req.auth.supabase.rpc('lada_admin_update_profile', {
    target_user_id: req.params.id,
    new_username: cleanUsername,
    new_email: cleanEmail,
    new_birth_date: cleanBirthDate,
  });
  if (error) return sendDatabaseError(res, error);
  return res.json(data);
});

router.post('/users/:id/wallet', requireJsonBody, validateUuidParam('id'), async (req, res) => {
  const { amount, direction, requestId, reason } = req.body ?? {};
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
    adjust_reason: reason ? String(reason).slice(0, 140) : 'Admin dashboard',
  });
  if (error) return sendDatabaseError(res, error);
  return res.json({ balance: data });
});

// === 3. Stock Management ===

router.get('/stocks', async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_stocks');
  if (error) return sendDatabaseError(res, error);
  return res.json(data || []);
});

router.post('/stocks', requireJsonBody, async (req, res) => {
  const { symbol, company_name, exchange, sector, status } = req.body ?? {};
  const { data, error } = await req.auth.supabase.rpc('lada_admin_upsert_stock', {
    p_stock_id: null,
    p_symbol: symbol,
    p_company_name: company_name,
    p_exchange: exchange || null,
    p_sector: sector || null,
    p_status: status || 'active',
  });
  if (error) return sendDatabaseError(res, error);
  return res.status(201).json(data);
});

router.patch('/stocks/:id', requireJsonBody, validateUuidParam('id'), async (req, res) => {
  const { symbol, company_name, exchange, sector, status } = req.body ?? {};
  const { data, error } = await req.auth.supabase.rpc('lada_admin_upsert_stock', {
    p_stock_id: req.params.id,
    p_symbol: symbol || null,
    p_company_name: company_name || null,
    p_exchange: exchange === undefined ? null : exchange,
    p_sector: sector === undefined ? null : sector,
    p_status: status || 'active',
  });
  if (error) return sendDatabaseError(res, error);
  return res.json(data);
});

router.delete('/stocks/:id', validateUuidParam('id'), async (req, res) => {
  const { error } = await req.auth.supabase.rpc('lada_admin_delete_stock', {
    p_stock_id: req.params.id,
  });
  if (error) return sendDatabaseError(res, error);
  return res.json({ deleted: true });
});

// === 4. Trade Management ===

router.get('/trades', async (req, res) => {
  const limit = Math.min(1000, Math.max(10, parseInt(req.query.limit, 10) || 200));
  const { data, error } = await req.auth.supabase.rpc('lada_admin_trades', { p_limit: limit });
  if (error) return sendDatabaseError(res, error);
  return res.json(data || { stockTrades: [], walletTrades: [] });
});

router.patch('/trades/:id/review', requireJsonBody, validateUuidParam('id'), async (req, res) => {
  const { review_status, review_note } = req.body ?? {};
  const { data, error } = await req.auth.supabase.rpc('lada_admin_review_trade', {
    p_tx_id: req.params.id,
    p_review_status: review_status,
    p_review_note: review_note || null,
  });
  if (error) return sendDatabaseError(res, error);
  return res.json(data);
});

// === 5. Portfolio Monitoring ===

router.get('/portfolios', async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_portfolios');
  if (error) return sendDatabaseError(res, error);
  return res.json(data || { userPortfolios: [], assetExposure: [] });
});

// === 6. Market Data Management ===

router.get('/market-data', async (_req, res) => {
  try {
    const diagnostics = await getMarketDiagnostics();
    return res.json(diagnostics);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Could not load market diagnostics.' });
  }
});

async function safeAudit(supabase, payload) {
  try {
    await supabase.rpc('lada_admin_log_audit', payload);
  } catch {
    // Non-blocking audit log
  }
}

router.patch('/market-data/config', requireJsonBody, async (req, res) => {
  const updated = updateMarketConfig(req.body ?? {});
  await safeAudit(req.auth.supabase, {
    p_category: 'market_data',
    p_action: 'MARKET_CONFIG_UPDATED',
    p_target_type: 'market_config',
    p_target_id: 'global',
    p_details: updated,
  });
  return res.json(updated);
});

router.post('/market-data/cache/clear', async (req, res) => {
  const prefix = String(req.body?.prefix || '');
  const cleared = clearMarketCache(prefix);
  await safeAudit(req.auth.supabase, {
    p_category: 'market_data',
    p_action: 'MARKET_CACHE_CLEARED',
    p_target_type: 'cache',
    p_target_id: prefix || 'all',
    p_details: { cleared },
  });
  return res.json({ cleared });
});

router.post('/market-data/refresh', requireJsonBody, async (req, res) => {
  let symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
  if (!symbols.length) {
    const { data: stocks } = await req.auth.supabase.rpc('lada_admin_stocks');
    symbols = (stocks || []).filter((s) => s.status === 'active').slice(0, 5).map((s) => s.symbol);
  }
  const results = await refreshSymbols(symbols);
  await safeAudit(req.auth.supabase, {
    p_category: 'market_data',
    p_action: 'MARKET_QUOTES_REFRESHED',
    p_target_type: 'stocks',
    p_target_id: symbols.join(','),
    p_details: { results },
  });
  return res.json({ results });
});

// === 7. Reports & Analytics ===

router.get('/reports', async (req, res) => {
  const range = ['7d', '30d', '90d', 'all'].includes(req.query.range) ? req.query.range : '30d';
  const { data, error } = await req.auth.supabase.rpc('lada_admin_reports', { p_range: range });
  if (error) return sendDatabaseError(res, error);
  return res.json(data);
});

// === 8. Announcements CRUD ===

router.get('/announcements', async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_announcements');
  if (error) return sendDatabaseError(res, error);
  return res.json(data || []);
});

router.post('/announcements', requireJsonBody, async (req, res) => {
  const { title, message, severity, is_pinned, is_active } = req.body ?? {};
  const { data, error } = await req.auth.supabase.rpc('lada_admin_save_announcement', {
    p_announcement_id: null,
    p_title: title,
    p_message: message,
    p_severity: severity || 'info',
    p_is_pinned: Boolean(is_pinned),
    p_is_active: is_active !== false,
  });
  if (error) return sendDatabaseError(res, error);
  return res.status(201).json(data);
});

router.patch('/announcements/:id', requireJsonBody, validateUuidParam('id'), async (req, res) => {
  const { title, message, severity, is_pinned, is_active } = req.body ?? {};
  const { data, error } = await req.auth.supabase.rpc('lada_admin_save_announcement', {
    p_announcement_id: req.params.id,
    p_title: title ?? null,
    p_message: message ?? null,
    p_severity: severity ?? 'info',
    p_is_pinned: is_pinned ?? null,
    p_is_active: is_active ?? null,
  });
  if (error) return sendDatabaseError(res, error);
  return res.json(data);
});

router.delete('/announcements/:id', validateUuidParam('id'), async (req, res) => {
  const { error } = await req.auth.supabase.rpc('lada_admin_delete_announcement', {
    p_announcement_id: req.params.id,
  });
  if (error) return sendDatabaseError(res, error);
  return res.json({ deleted: true });
});

// === 9. Audit Logs ===

router.get('/audit-logs', async (req, res) => {
  const limit = Math.min(1000, Math.max(20, parseInt(req.query.limit, 10) || 250));
  const { data, error } = await req.auth.supabase.rpc('lada_admin_audit_logs', { p_limit: limit });
  if (error) return sendDatabaseError(res, error);
  return res.json(data || []);
});

export default router;
