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

app.use(express.static(env.projectRoot));

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API endpoint is not found.' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ message: 'Internal server error.' });
});

app.listen(env.port, () => {
  console.log(`Lada Stocks API server running at http://localhost:${env.port}`);
});