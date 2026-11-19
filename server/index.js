// index.js
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import authRouter from './routes/auth.js';
import stocksRouter from './routes/stocks.js';
import walletRouter from './routes/wallet.js';
import transactionsRouter from './routes/transactions.js';
import portfolioRouter from './routes/portfolio.js';
import tradingRouter from './routes/trading.js';
import watchlistRouter from './routes/watchlist.js'; // <-- Add this
import uploadsRouter from './routes/uploads.js';
import passwordRouter from './routes/password.js';
import adminRouter from './routes/admin.js';
import { requireAdmin, requireAuth } from './middleware/requireAuth.js';

import { env } from './config/env.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lada-stocks-api' });
});

app.use('/api/auth', authRouter);
app.use('/api/stocks', stocksRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/watchlist', watchlistRouter); // <-- Mount watchlist
app.use('/api/uploads', uploadsRouter);
app.use('/api/auth', passwordRouter);
app.use('/api/admin', adminRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API endpoint is not found.' });
});

const adminPage = '/pages/admin/admin-dashboard.html';
app.get('/pages/admin/admin-dashboard', (_req, res) => res.redirect(adminPage));
app.get(adminPage, (_req, res, next) => {
  res.locals.adminPage = true;
  next();
}, requireAuth, requireAdmin, (_req, res) => {
  res.sendFile(path.join(env.projectRoot, 'server/views/admin-dashboard.html'));
});

app.use('/pages', express.static(path.join(env.projectRoot, 'pages')));
app.use('/Images', express.static(path.join(env.projectRoot, 'Images')));
app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(env.projectRoot, 'index.html')));
app.get('/global.css', (_req, res) => res.sendFile(path.join(env.projectRoot, 'global.css')));

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ message: 'Internal server error.' });
});

app.listen(env.port, () => {
  console.log(`Lada Stocks API server running at http://localhost:${env.port}`);
});
