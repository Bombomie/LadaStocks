// routes/exports.js
// Secure downloadable CSV exports for users & administrators.

import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';
import { getRealTimeQuote } from '../middleware/stockService.js';
import { sendSecureCsv } from '../utils/csv.js';

const router = express.Router();

// === User CSV Exports ===

// GET /api/exports/transactions
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    const [{ data: stockTxns }, { data: walletTxns }] = await Promise.all([
      supabase
        .from('transactions')
        .select('transaction_id, transaction_type, quantity, price_per_share, total_amount, realized_pnl, confirmation_id, review_status, executed_at, stocks (symbol, company_name)')
        .eq('user_id', user.id)
        .order('executed_at', { ascending: false }),
      supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ]);

    const rows = [
      ...(stockTxns || []).map((tx) => ({
        date: tx.executed_at,
        category: 'TRADE',
        type: String(tx.transaction_type || '').toUpperCase(),
        symbol: tx.stocks?.symbol || 'UNKNOWN',
        company: tx.stocks?.company_name || '',
        quantity: tx.quantity,
        price_per_share: Number(tx.price_per_share || 0).toFixed(4),
        total_amount: Number(tx.total_amount || 0).toFixed(2),
        realized_pnl: tx.realized_pnl != null ? Number(tx.realized_pnl).toFixed(2) : '',
        confirmation: tx.confirmation_id || `LS-${String(tx.transaction_id).slice(0, 8).toUpperCase()}`,
        status: tx.review_status || 'executed',
      })),
      ...(walletTxns || []).map((tx, idx) => {
        const pk = tx.wallet_tx_id || tx.transaction_id || tx.id;
        return {
          date: tx.created_at,
          category: 'WALLET',
          type: String(tx.transaction_type || '').toUpperCase(),
          symbol: 'CASH',
          company: tx.reason || 'Simulation Wallet',
          quantity: '',
          price_per_share: '',
          total_amount: Number(tx.amount || 0).toFixed(2),
          realized_pnl: '',
          confirmation: tx.confirmation_id || (pk ? `WL-${String(pk).slice(0, 8).toUpperCase()}` : `WL-${String(idx + 1).padStart(6, '0')}`),
          status: 'executed',
        };
      }),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return sendSecureCsv(
      res,
      `ladastocks_transactions_${new Date().toISOString().slice(0, 10)}`,
      [
        { label: 'Executed At', key: 'date' },
        { label: 'Category', key: 'category' },
        { label: 'Type', key: 'type' },
        { label: 'Symbol', key: 'symbol' },
        { label: 'Description', key: 'company' },
        { label: 'Quantity', key: 'quantity' },
        { label: 'Price Per Share (USD)', key: 'price_per_share' },
        { label: 'Total Amount (USD)', key: 'total_amount' },
        { label: 'Realized P/L (USD)', key: 'realized_pnl' },
        { label: 'Confirmation ID', key: 'confirmation' },
        { label: 'Status', key: 'status' },
      ],
      rows
    );
  } catch (err) {
    console.error('Export transactions error:', err);
    return res.status(500).json({ message: 'Could not export transactions.' });
  }
});

// GET /api/exports/holdings
router.get('/holdings', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    const { data: holdings, error } = await supabase
      .from('holdings')
      .select('quantity, avg_buy_price, stocks (symbol, company_name, exchange, sector)')
      .eq('user_id', user.id)
      .gt('quantity', 0);

    if (error) throw error;

    const quotes = await Promise.all(
      (holdings || []).map((h) =>
        getRealTimeQuote(h.stocks.symbol).catch(() => null)
      )
    );

    const rows = (holdings || []).map((h, i) => {
      const q = quotes[i];
      const currentPrice = parseFloat(q?.currentPrice || q?.close || h.avg_buy_price || 0);
      const avgBuy = parseFloat(h.avg_buy_price || 0);
      const value = currentPrice * h.quantity;
      const costBasis = avgBuy * h.quantity;
      const unrealizedPnl = value - costBasis;
      const returnPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
      return {
        symbol: h.stocks?.symbol || '',
        company: h.stocks?.company_name || '',
        exchange: h.stocks?.exchange || '',
        sector: h.stocks?.sector || 'Unclassified',
        quantity: h.quantity,
        avg_buy_price: avgBuy.toFixed(4),
        current_price: currentPrice.toFixed(2),
        market_value: value.toFixed(2),
        unrealized_pnl: unrealizedPnl.toFixed(2),
        return_pct: returnPct.toFixed(2) + '%',
      };
    });

    return sendSecureCsv(
      res,
      `ladastocks_portfolio_${new Date().toISOString().slice(0, 10)}`,
      [
        { label: 'Symbol', key: 'symbol' },
        { label: 'Company', key: 'company' },
        { label: 'Exchange', key: 'exchange' },
        { label: 'Sector', key: 'sector' },
        { label: 'Shares', key: 'quantity' },
        { label: 'Avg Buy Price (USD)', key: 'avg_buy_price' },
        { label: 'Current Price (USD)', key: 'current_price' },
        { label: 'Market Value (USD)', key: 'market_value' },
        { label: 'Unrealized P/L (USD)', key: 'unrealized_pnl' },
        { label: 'Return (%)', key: 'return_pct' },
      ],
      rows
    );
  } catch (err) {
    console.error('Export holdings error:', err);
    return res.status(500).json({ message: 'Could not export portfolio.' });
  }
});

// GET /api/exports/watchlist
router.get('/watchlist', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;
    const { data, error } = await supabase
      .from('watchlist_items')
      .select('added_at, target_price, stocks (symbol, company_name, exchange)')
      .eq('user_id', user.id)
      .order('added_at', { ascending: true });
    if (error) throw error;

    const quotes = await Promise.all(
      (data || []).map((w) => getRealTimeQuote(w.stocks.symbol).catch(() => null))
    );

    const rows = (data || []).map((w, i) => {
      const q = quotes[i];
      const price = parseFloat(q?.currentPrice || q?.close || 0);
      const target = w.target_price ? parseFloat(w.target_price) : null;
      return {
        symbol: w.stocks?.symbol || '',
        company: w.stocks?.company_name || '',
        exchange: w.stocks?.exchange || '',
        current_price: price > 0 ? price.toFixed(2) : '',
        target_price: target != null ? target.toFixed(2) : '',
        daily_change_pct: q?.change != null ? `${Number(q.change).toFixed(2)}%` : '',
        added_at: w.added_at,
      };
    });

    return sendSecureCsv(
      res,
      `ladastocks_watchlist_${new Date().toISOString().slice(0, 10)}`,
      [
        { label: 'Symbol', key: 'symbol' },
        { label: 'Company', key: 'company' },
        { label: 'Exchange', key: 'exchange' },
        { label: 'Current Price (USD)', key: 'current_price' },
        { label: 'Target Price (USD)', key: 'target_price' },
        { label: 'Daily Change', key: 'daily_change_pct' },
        { label: 'Added At', key: 'added_at' },
      ],
      rows
    );
  } catch (err) {
    console.error('Export watchlist error:', err);
    return res.status(500).json({ message: 'Could not export watchlist.' });
  }
});

// === Admin CSV Exports (logged to admin_audit_logs) ===

async function logAdminExport(supabase, type, details = {}) {
  try {
    await supabase.rpc('lada_admin_log_audit', {
      p_category: 'exports',
      p_action: `EXPORT_${type.toUpperCase()}_CSV`,
      p_target_type: 'csv_export',
      p_target_id: type,
      p_details: details,
    });
  } catch {
    // Non-blocking audit log
  }
}

router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_users');
  if (error) return res.status(500).json({ message: error.message });
  await logAdminExport(req.auth.supabase, 'users', { count: (data || []).length });
  return sendSecureCsv(
    res,
    `admin_users_${new Date().toISOString().slice(0, 10)}`,
    [
      { label: 'User ID', key: 'user_id' },
      { label: 'Username', key: 'username' },
      { label: 'Email', key: 'email' },
      { label: 'Birth Date', key: 'birth_date' },
      { label: 'Status', key: 'status' },
      { label: 'Role', value: (u) => (u.isAdmin ? 'Admin' : 'User') },
      { label: 'Cash Balance (USD)', value: (u) => Number(u.wallet?.balance ?? 0).toFixed(2) },
      { label: 'Portfolio Value (USD)', value: (u) => (u.holdings || []).reduce((s, h) => s + Number(h.quantity) * Number(h.price), 0).toFixed(2) },
      { label: 'Trades', key: 'trade_count' },
      { label: 'Last Login', key: 'last_login' },
      { label: 'Created At', key: 'created_at' },
    ],
    data || []
  );
});

router.get('/admin/stocks', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_stocks');
  if (error) return res.status(500).json({ message: error.message });
  await logAdminExport(req.auth.supabase, 'stocks', { count: (data || []).length });
  return sendSecureCsv(
    res,
    `admin_stocks_${new Date().toISOString().slice(0, 10)}`,
    [
      { label: 'Symbol', key: 'symbol' },
      { label: 'Company Name', key: 'company_name' },
      { label: 'Exchange', key: 'exchange' },
      { label: 'Sector', key: 'sector' },
      { label: 'Status', key: 'status' },
      { label: 'Latest Recorded Price', key: 'latest_price' },
      { label: 'Holders Count', key: 'holders_count' },
      { label: 'Shares Held', key: 'shares_held' },
      { label: 'Trade Count', key: 'trade_count' },
      { label: 'Trade Volume (USD)', key: 'trade_volume' },
    ],
    data || []
  );
});

router.get('/admin/trades', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_trades', { p_limit: 1000 });
  if (error) return res.status(500).json({ message: error.message });
  const rows = data?.stockTrades || [];
  await logAdminExport(req.auth.supabase, 'trades', { count: rows.length });
  return sendSecureCsv(
    res,
    `admin_trades_${new Date().toISOString().slice(0, 10)}`,
    [
      { label: 'Confirmation ID', key: 'confirmation_id' },
      { label: 'Username', key: 'username' },
      { label: 'Email', key: 'email' },
      { label: 'Type', value: (r) => String(r.transaction_type || '').toUpperCase() },
      { label: 'Symbol', key: 'symbol' },
      { label: 'Quantity', key: 'quantity' },
      { label: 'Price Per Share', key: 'price_per_share' },
      { label: 'Total Amount', key: 'total_amount' },
      { label: 'Realized P/L', key: 'realized_pnl' },
      { label: 'Review Status', key: 'review_status' },
      { label: 'Review Note', key: 'review_note' },
      { label: 'Executed At', key: 'executed_at' },
    ],
    rows
  );
});

router.get('/admin/portfolios', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_portfolios');
  if (error) return res.status(500).json({ message: error.message });
  const rows = data?.userPortfolios || [];
  await logAdminExport(req.auth.supabase, 'portfolios', { count: rows.length });
  return sendSecureCsv(
    res,
    `admin_portfolios_${new Date().toISOString().slice(0, 10)}`,
    [
      { label: 'Username', key: 'username' },
      { label: 'Email', key: 'email' },
      { label: 'Status', key: 'status' },
      { label: 'Cash Balance', value: (r) => Number(r.cash_balance || 0).toFixed(2) },
      { label: 'Equity Value', value: (r) => Number(r.equity_value || 0).toFixed(2) },
      { label: 'Cost Basis', value: (r) => Number(r.cost_basis || 0).toFixed(2) },
      { label: 'Unrealized P/L', value: (r) => Number(r.unrealized_pnl || 0).toFixed(2) },
      { label: 'Net Worth', value: (r) => Number(r.net_worth || 0).toFixed(2) },
      { label: 'Holdings Count', value: (r) => (r.holdings || []).length },
    ],
    rows
  );
});

router.get('/admin/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await req.auth.supabase.rpc('lada_admin_audit_logs', { p_limit: 1000 });
  if (error) return res.status(500).json({ message: error.message });
  await logAdminExport(req.auth.supabase, 'audit_logs', { count: (data || []).length });
  return sendSecureCsv(
    res,
    `admin_audit_logs_${new Date().toISOString().slice(0, 10)}`,
    [
      { label: 'Timestamp', key: 'created_at' },
      { label: 'Admin', key: 'admin_username' },
      { label: 'Category', key: 'category' },
      { label: 'Action', key: 'action' },
      { label: 'Target Type', key: 'target_type' },
      { label: 'Target ID', key: 'target_id' },
      { label: 'Details', value: (r) => JSON.stringify(r.details || {}) },
    ],
    data || []
  );
});

router.get('/admin/report', requireAuth, requireAdmin, async (req, res) => {
  const range = ['7d', '30d', '90d', 'all'].includes(req.query.range) ? req.query.range : '30d';
  const { data, error } = await req.auth.supabase.rpc('lada_admin_reports', { p_range: range });
  if (error) return res.status(500).json({ message: error.message });
  await logAdminExport(req.auth.supabase, 'report', { range });
  const rows = data?.dailyVolume || [];
  return sendSecureCsv(
    res,
    `admin_platform_report_${range}_${new Date().toISOString().slice(0, 10)}`,
    [
      { label: 'Date', key: 'day' },
      { label: 'Trades Count', key: 'trades' },
      { label: 'Buy Volume (USD)', value: (r) => Number(r.buy_volume || 0).toFixed(2) },
      { label: 'Sell Volume (USD)', value: (r) => Number(r.sell_volume || 0).toFixed(2) },
      { label: 'Total Volume (USD)', value: (r) => Number(r.total_volume || 0).toFixed(2) },
    ],
    rows
  );
});

export default router;
