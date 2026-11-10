import express from 'express';

// Mounted behind requireAuth + requireAdmin (see server file), so
// req.auth.supabase is the logged-in admin's client and req.admin is set.
const router = express.Router();
const STATUSES = ['active', 'frozen', 'restricted', 'banned', 'deleted'];

const fail = (res, error) => res.status(400).json({ message: error.message });

router.get('/users', async (req, res) => {
  const { data, error } = await req.auth.supabase
    .from('users')
    .select('user_id, username, email, birth_date, avatar_url, status, wallets(balance)')
    .order('created_at', { ascending: false });
  if (error) return fail(res, error);

  const users = data.map(({ wallets, ...u }) => ({
    ...u,
    balance: Number((Array.isArray(wallets) ? wallets[0] : wallets)?.balance ?? 0),
  }));
  res.json({ users });
});

router.patch('/users/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status.' });
  }
  const { error } = await req.auth.supabase
    .from('users')
    .update({ status })
    .eq('user_id', req.params.id);
  if (error) return fail(res, error);
  res.json({ message: 'Status updated.' });
});

router.post('/users/:id/bonus', async (req, res) => {
  const amount = Number(req.body.amount);
  if (!(amount > 0)) {
    return res.status(400).json({ message: 'Enter a positive amount.' });
  }
  const { error } = await req.auth.supabase.rpc('grant_bonus', {
    p_user: req.params.id,
    p_amount: amount,
    p_type: req.body.type === 'birthday' ? 'birthday' : 'manual',
    p_reason: String(req.body.reason || '').slice(0, 200) || null,
  });
  if (error) return fail(res, error);
  res.json({ message: 'Bonus granted.' });
});

router.get('/popular-stocks', async (req, res) => {
  const { data, error } = await req.auth.supabase
    .from('transactions')
    .select('quantity, stocks(symbol, company_name)')
    .eq('transaction_type', 'buy');
  if (error) return fail(res, error);

  const totals = {};
  for (const t of data) {
    const s = Array.isArray(t.stocks) ? t.stocks[0] : t.stocks;
    if (!s) continue;
    totals[s.symbol] ??= { symbol: s.symbol, company_name: s.company_name, total: 0 };
    totals[s.symbol].total += t.quantity;
  }
  const stocks = Object.values(totals).sort((a, b) => b.total - a.total).slice(0, 5);
  res.json({ stocks });
});

router.get('/challenges', async (req, res) => {
  const { data, error } = await req.auth.supabase
    .from('challenges')
    .select('challenge_id, title, type, ends_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return fail(res, error);
  res.json({ challenges: data });
});

router.post('/challenges', async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ message: 'Title is required.' });

  const { error } = await req.auth.supabase.from('challenges').insert({
    title: title.slice(0, 100),
    description: String(req.body.description || '').slice(0, 500) || null,
    type: req.body.type === 'special' ? 'special' : 'standard',
    ends_at: req.body.endsAt || null,
    created_by: req.admin.admin_id,
  });
  if (error) return fail(res, error);
  res.status(201).json({ message: 'Challenge created.' });
});

export default router;