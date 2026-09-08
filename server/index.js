import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import authRouter from './routes/auth.js';
import { env } from './config/env.js';

const app = express();

app.disable('x-powered-by');
app.use(
  helmet({
    // The current dashboard embeds TradingView scripts, so a strict CSP would
    // break the existing page. Add a tailored CSP later when deployment starts.
    contentSecurityPolicy: false,
  }),
);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lada-stocks-api' });
});

app.use('/api/auth', authRouter);

// Serve the existing HTML/CSS/JS project from the same Express server.
// This keeps browser -> API same-origin and avoids exposing Supabase in the browser.
app.use(express.static(env.projectRoot));

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API endpoint not found.' });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ message: 'Internal server error.' });
});

app.listen(env.port, () => {
  console.log(`Lada Stocks API server running at http://localhost:${env.port}`);
  console.log(
    `Login page: http://localhost:${env.port}/pages/authentication/login/login.html`,
  );
});
