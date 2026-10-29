import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

export const env = {
  projectRoot,
  port: Number(process.env.PORT || 20269),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  twelveDataApiKey: process.env.TWELVE_DATA_API_KEY,
  finnhubApiKey: process.env.FINNHUB_API_KEY, // <-- Add this
};