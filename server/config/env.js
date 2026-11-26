// config/env.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: ['.env.local', 'env.local', '.env'].map((file) => path.join(projectRoot, file)) });

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const port = Number(process.env.PORT || 20269);

export const env = {
  projectRoot,
  port,
  appUrl: (process.env.APP_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  // Optional: enables updating auth.users.email when an admin edits a user's locked email
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  twelveDataApiKey: process.env.TWELVE_DATA_API_KEY || '',
  finnhubApiKey: process.env.FINNHUB_API_KEY || '',
};
