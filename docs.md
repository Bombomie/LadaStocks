# LadaStocks — Complete Technical & API Documentation

**Stack:** Vanilla HTML5 · Vanilla CSS3 · Vanilla ES6+ JavaScript · Node.js (Express ESM) · Supabase (PostgreSQL + Auth + RLS + RPCs) · Twelve Data & Finnhub (Free Tier) · Cloudinary

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables & Setup](#2-environment-variables--setup)
3. [Authentication & Security Model](#3-authentication--security-model)
4. [REST API Reference](#4-rest-api-reference)
   - [4.1 Health](#41-health)
   - [4.2 Authentication & Profile (`/api/auth`)](#42-authentication--profile-apiauth)
   - [4.3 Media Uploads (`/api/uploads`)](#43-media-uploads-apiuploads)
   - [4.4 Market Data & Stocks (`/api/stocks`)](#44-market-data--stocks-apistocks)
   - [4.5 Trading (`/api/trading`)](#45-trading-apitrading)
   - [4.6 Portfolio (`/api/portfolio`)](#46-portfolio-apiportfolio)
   - [4.7 Wallet (`/api/wallet`)](#47-wallet-apiwallet)
   - [4.8 Transactions (`/api/transactions`)](#48-transactions-apitransactions)
   - [4.9 Watchlist (`/api/watchlist`)](#49-watchlist-apiwatchlist)
   - [4.10 Announcements (`/api/announcements`)](#410-announcements-apiannouncements)
   - [4.11 Secure CSV Exports (`/api/exports`)](#411-secure-csv-exports-apiexports)
   - [4.12 Administrator Console (`/api/admin`)](#412-administrator-console-apiadmin)
5. [Market Data Providers & Rate Limits (Free Tier)](#5-market-data-providers--rate-limits-free-tier)
6. [Database Schema & Supabase RPCs](#6-database-schema--supabase-rpcs)
7. [Frontend Pages & Client Conventions](#7-frontend-pages--client-conventions)
8. [HTTP Status Codes & Error Format](#8-http-status-codes--error-format)

---

## 1. Architecture Overview

LadaStocks is a paper-trading stock simulator where every new account starts with **$100,000.00 in simulated USD**.

- **Web Server (`server/index.js`)**: Express serves static frontend assets (`/pages`, `/Images`, `/global.css`, `/index.html`), protects the Admin Dashboard view (`server/views/admin-dashboard.html`) with `requireAuth` + `requireAdmin`, and exposes all `/api/*` endpoints.
- **Database & Auth (`Supabase`)**: User sessions are backed by Supabase Auth stored in `httpOnly` cookies (`ACCESS_COOKIE` / `REFRESH_COOKIE`). Row-Level Security (RLS) restricts standard user queries (`auth.uid() = user_id`), while all administrative operations execute through `SECURITY DEFINER` PostgreSQL RPCs that verify `ladastocks_private.current_admin_id()`.
- **Market Data (`server/middleware/stockService.js`)**: Uses in-memory TTL caching, rate-limit tracking, and stale-cache fallback across **free-tier** Twelve Data and Finnhub endpoints.

---

## 2. Environment Variables & Setup

`server/config/env.js` loads environment variables from the repository root in order: `.env.local`, `env.local`, `.env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | **Yes** | — | Supabase project URL (`https://<ref>.supabase.co`). |
| `SUPABASE_PUBLISHABLE_KEY` | **Yes** | — | Supabase `anon` / publishable API key. |
| `SUPABASE_SERVICE_ROLE_KEY` | No | `""` | Optional server-only key; enables syncing `auth.users.email` when an admin updates a user's locked email. |
| `PORT` | No | `20269` | Express HTTP port. |
| `NODE_ENV` | No | `development` | Environment (`development` / `production`). |
| `APP_URL` | No | `http://localhost:20269` | Base URL used for password-recovery redirect links. |
| `TWELVE_DATA_API_KEY` | Recommended | `""` | Twelve Data API key (Free Tier: 8 req/min, 800 req/day). |
| `FINNHUB_API_KEY` | Recommended | `""` | Finnhub API key (Free Tier: 60 req/min). |
| `CLOUDINARY_CLOUD_NAME` | Optional | `""` | Cloudinary cloud name for profile avatar uploads. |
| `CLOUDINARY_API_KEY` | Optional | `""` | Cloudinary API key for signed avatar uploads. |
| `CLOUDINARY_API_SECRET` | Optional | `""` | Cloudinary API secret (stays strictly server-side). |

### Database Migration Order
Execute SQL scripts in the Supabase SQL Editor in order:
1. Base schema (`users`, `wallets`, `stocks`, `stock_prices`, `holdings`, `transactions`, `watchlist_items`, `admins`, `bonuses`, `news`)
2. Target price column addition (`watchlist_items.target_price`)
3. Avatar column migration (`users.avatar_url`)
4. Admin access & RLS (`ladastocks_private.suspended_accounts`, `ladastocks_private.current_admin_id()`, `account_is_suspended()`)
5. **`supabase/migrations/20261120_admin_and_features.sql`** (announcements, audit logs, stock status, trade review & realized P/L, wallet ledger columns, and all `public.lada_admin_*` RPCs)

---

## 3. Authentication & Security Model

- **Session Cookies**: `POST /api/auth/login` sets `httpOnly` access and refresh cookies. All browser requests must use `credentials: 'include'`.
- **Middleware (`server/middleware/requireAuth.js`)**:
  - `requireAuth`: Validates/refreshes Supabase session cookies, checks whether the user is suspended (`403` if suspended), and attaches `req.auth = { supabase, user, isAdmin }`.
  - `requireAdmin`: Requires `req.auth.isAdmin === true`; otherwise returns `403`.
- **Locked Profile Fields**: Users can update **only** `username` and `avatar_url` via `PATCH /api/auth/me`. Sending `email` or `birthDate`/`birth_date` returns `400`; those fields can only be modified by an administrator (`24104152@usc.edu.ph`).
- **Optimistic Wallet Concurrency**: `updateWalletBalance()` checks the expected prior balance before updating `wallets.balance` to prevent race conditions, returning `409 Conflict` on concurrent updates.
- **CSV Download Security (`server/utils/csv.js`)**: All CSV exports set `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, RFC 4180 quoting, and prefix cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` with `'` to prevent spreadsheet formula injection.

---

## 4. REST API Reference

**Base URL (local):** `http://localhost:20269`  
**Request/Response Content-Type:** `application/json` (except CSV downloads in `/api/exports/*`).  
**Authentication:** Cookie session (`credentials: 'include'`). All protected routes return `401 Unauthorized` when unauthenticated and `403 Forbidden` if suspended (or if non-admin calls `/api/admin/*` or `/api/exports/admin/*`).

---

### 4.1 Health

#### `GET /api/health`
Public liveness check.
- **Auth:** None
- **Response `200 OK`:**
```json
{
  "status": "ok",
  "service": "lada-stocks-api"
}
```

---

### 4.2 Authentication & Profile (`/api/auth`)

#### `POST /api/auth/register`
Creates a new user account via Supabase Auth (initializes user profile + $100,000 wallet via DB trigger).
- **Auth:** None
- **Body:**
```json
{
  "username": "trader_jane",
  "email": "jane@example.com",
  "birthDate": "2000-05-14",
  "password": "StrongPassword123"
}
```
- **Validation:** All fields required, valid email format, `birthDate` in `YYYY-MM-DD`, `password.length >= 8`.
- **Response `201 Created`:**
```json
{
  "message": "Account created successfully. You can now log in.",
  "requiresEmailConfirmation": false
}
```

#### `POST /api/auth/login`
Authenticates user credentials, verifies account is not suspended, updates `last_login`, and sets `httpOnly` auth cookies.
- **Auth:** None
- **Body:** `{ "email": "jane@example.com", "password": "StrongPassword123" }`
- **Response `200 OK`:**
```json
{
  "message": "Login successful.",
  "isAdmin": false,
  "user": {
    "id": "uuid",
    "email": "jane@example.com",
    "username": "trader_jane"
  }
}
```
- **Errors:** `400` validation error, `401` invalid credentials, `403` account suspended.

#### `POST /api/auth/logout`
Signs out of Supabase session and clears auth cookies.
- **Auth:** None (reads cookies if present)
- **Response `200 OK`:** `{ "message": "Logged out." }`

#### `GET /api/auth/me`
Returns the current authenticated user's profile and admin flag.
- **Auth:** `requireAuth`
- **Response `200 OK`:**
```json
{
  "user": {
    "user_id": "uuid",
    "username": "trader_jane",
    "email": "jane@example.com",
    "birth_date": "2000-05-14",
    "avatar_url": "https://res.cloudinary.com/...",
    "created_at": "2026-10-01T12:00:00Z",
    "last_login": "2026-11-20T10:00:00Z"
  },
  "isAdmin": false
}
```

#### `PATCH /api/auth/me`
Updates writable user profile fields (**only** `username` and `avatarUrl`).
- **Auth:** `requireAuth`
- **Body:** `{ "username": "new_name", "avatarUrl": "https://res.cloudinary.com/..." }`
- **Rules:**
  - `email`, `birthDate`, or `birth_date` in body → **`400`** (`"...cannot be changed. Contact the administrator."`)
  - `username` must be 1–30 characters (unique constraint enforced).
  - `avatarUrl` must start with `https://res.cloudinary.com/`.
- **Response `200 OK`:** `{ "user": { ... }, "message": "Profile updated." }`

#### `POST /api/auth/change-password`
Changes password for a currently logged-in user after verifying `currentPassword`.
- **Auth:** `requireAuth`
- **Body:** `{ "currentPassword": "oldPass123", "newPassword": "newPass456" }`
- **Response `200 OK`:** `{ "message": "Password updated." }`
- **Errors:** `400` if `currentPassword` is wrong (intentionally `400` rather than `401` to avoid triggering login redirect).

#### `POST /api/auth/forgot-password`
Triggers Supabase password recovery email redirecting to `/pages/authentication/change_password/change_password.html`.
- **Auth:** None
- **Body:** `{ "email": "jane@example.com" }`
- **Response `200 OK`:** Generic non-enumerating confirmation message.

#### `POST /api/auth/update-password`
Completes password reset using tokens from the recovery email fragment.
- **Auth:** None
- **Body:** `{ "accessToken": "...", "refreshToken": "...", "newPassword": "newPass456" }`
- **Response `200 OK`:** `{ "message": "Password updated successfully! You can now log in with your new password." }`

---

### 4.3 Media Uploads (`/api/uploads`)

#### `POST /api/uploads/sign`
Generates a short-lived SHA-1 Cloudinary signature so the browser can upload an avatar directly without exposing `CLOUDINARY_API_SECRET`.
- **Auth:** `requireAuth`
- **Body:** Empty
- **Response `200 OK`:**
```json
{
  "cloudName": "my-cloud",
  "apiKey": "1234567890",
  "timestamp": 1763644800,
  "signature": "sha1hex..."
}
```
> **Client Note:** Send only `file`, `api_key`, `timestamp`, and `signature` to `https://api.cloudinary.com/v1_1/<cloudName>/image/upload`, then save `secure_url` via `PATCH /api/auth/me`.

---

### 4.4 Market Data & Stocks (`/api/stocks`)

#### `GET /api/stocks/quote/:symbol`
Fetches real-time quote (Twelve Data `/quote` primary, Finnhub `/quote` fallback, in-memory 60s cache).
- **Auth:** Public
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "symbol": "NVDA",
    "name": "NVIDIA Corporation",
    "currentPrice": 142.5,
    "highOfDay": 144.1,
    "lowOfDay": 139.8,
    "open": 140.2,
    "previousClose": 139.5,
    "change": 2.15,
    "changeAmount": 3.0,
    "volume": 48120300,
    "currency": "USD",
    "exchange": "NASDAQ",
    "provider": "TwelveData"
  }
}
```

#### `GET /api/stocks/candles/:symbol`
Fetches chronological OHLCV time series from Twelve Data `/time_series` (5m cache).
- **Auth:** Public
- **Query Params:**
  - `interval`: e.g., `15min`, `1h`, `4h`, `1day`, `1week` (default `1day`)
  - `outputsize`: `5`–`500` (default `90`)
- **Response `200 OK`:**
```json
{
  "success": true,
  "symbol": "NVDA",
  "interval": "1day",
  "data": [
    {
      "time": "2026-11-19",
      "open": 140.1,
      "high": 143.2,
      "low": 139.5,
      "close": 142.5,
      "volume": 48120300
    }
  ]
}
```

#### `GET /api/stocks/search/:query`
Searches stocks via Twelve Data `/symbol_search` with Finnhub `/search` fallback (10m cache, max 15 results).
- **Auth:** Public
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    { "symbol": "AAPL", "name": "Apple Inc", "exchange": "NASDAQ", "country": "United States" }
  ]
}
```

#### `GET /api/stocks/market-status`
Checks US market status via Finnhub `/stock/market-status` (with NYSE/NASDAQ EST schedule fallback).
- **Auth:** Public
- **Response `200 OK`:** `{ "success": true, "data": { "exchange": "US", "isOpen": true, "session": "regular", "holiday": null, "timezone": "America/New_York", "source": "Finnhub Free Tier" } }`

#### `GET /api/stocks/news`
Fetches top general market headlines from Finnhub `/news` (5m cache, max 15 items).
- **Auth:** Public
- **Response `200 OK`:** `{ "success": true, "data": [ { "id": 123, "headline": "...", "summary": "...", "source": "Reuters", "url": "https://...", "datetime": "2026-11-20T12:00:00.000Z", "category": "general" } ] }`

#### `GET /api/stocks/supported`
Lists tracked stocks in the Supabase `stocks` table along with their operational `status` (`active`, `halted`, `disabled`).
- **Auth:** Public
- **Response `200 OK`:** `{ "success": true, "data": [ { "stock_id": "uuid", "symbol": "NVDA", "company_name": "NVIDIA Corporation", "exchange": "NASDAQ", "sector": "Technology", "status": "active" } ] }`

#### `GET /api/stocks/cache-stats`
Returns in-memory cache hit/miss metrics and Twelve Data / Finnhub free-tier quota usage.
- **Auth:** Public

---

### 4.5 Trading (`/api/trading`)

#### `POST /api/trading/buy`
Executes a simulated market buy at the current live quote price.
- **Auth:** `requireAuth`
- **Body:** `{ "symbol": "NVDA", "quantity": 5 }` (`quantity` must be a positive integer)
- **Checks:** Rejects with `403` if stock `status` is `halted` or `disabled`; `400` if wallet balance is insufficient; `409` on concurrent wallet modification.
- **Response `200 OK`:**
```json
{
  "message": "Bought 5 share(s) of NVDA at $142.50 (LS-A1B2C3D4).",
  "transaction": {
    "transaction_id": "uuid",
    "confirmation_id": "LS-A1B2C3D4",
    "symbol": "NVDA",
    "name": "NVIDIA Corporation",
    "transaction_type": "buy",
    "quantity": 5,
    "price_per_share": 142.5,
    "total_amount": 712.5,
    "executed_at": "2026-11-20T13:15:00.000Z"
  },
  "position": { "quantity": 5, "avg_buy_price": 142.5 },
  "new_balance": 99287.5
}
```

#### `POST /api/trading/sell`
Executes a simulated market sell at the live quote price and records `realized_pnl` against `avg_buy_price`.
- **Auth:** `requireAuth`
- **Body:** `{ "symbol": "NVDA", "quantity": 2 }`
- **Response `200 OK`:** Includes `transaction.realized_pnl`, updated `position`, and `new_balance`.

#### `GET /api/trading/position/:symbol`
Returns the user's current share count, average buy price, and stock trading status for `:symbol`.
- **Auth:** `requireAuth`
- **Response `200 OK`:** `{ "quantity": 5, "avg_buy_price": 142.5, "stockStatus": "active" }`

#### `GET /api/trading/history/:symbol`
Returns the user's per-symbol position, aggregated buy/sell totals, realized P/L, and chronological trade history for `:symbol`.
- **Auth:** `requireAuth`
- **Response `200 OK`:**
```json
{
  "symbol": "NVDA",
  "company_name": "NVIDIA Corporation",
  "exchange": "NASDAQ",
  "sector": "Technology",
  "status": "active",
  "position": { "quantity": 3, "avg_buy_price": 142.5 },
  "totals": {
    "sharesBought": 5,
    "sharesSold": 2,
    "totalBoughtUsd": 712.5,
    "totalSoldUsd": 300.0,
    "realizedPnl": 15.0
  },
  "trades": [ ... ]
}
```

#### `GET /api/trading/balance`
Returns current available cash balance (`{ "balance": 99287.5 }`).
- **Auth:** `requireAuth`

---

### 4.6 Portfolio (`/api/portfolio`)

#### `GET /api/portfolio/holdings`
Returns active holdings (`quantity > 0`) for the logged-in user.
- **Auth:** `requireAuth`
- **Response `200 OK`:**
```json
[
  {
    "symbol": "NVDA",
    "company": "NVIDIA Corporation",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "status": "active",
    "quantity": 3,
    "avg_buy_price": 142.5
  }
]
```

#### `GET /api/portfolio/summary`
Computes live portfolio valuation, cash balance, net worth (`totalValue`), unrealized P/L, realized P/L, today's change, total return %, and sector allocation breakdown.
- **Auth:** `requireAuth`
- **Response `200 OK`:**
```json
{
  "portfolioValue": 450.0,
  "cashBalance": 99587.5,
  "startingBalance": 100000.0,
  "totalValue": 100037.5,
  "totalCost": 427.5,
  "unrealizedPnl": 22.5,
  "realizedPnl": 15.0,
  "todaysChange": 9.45,
  "totalReturnPct": 5.26,
  "sectorAllocation": [
    { "sector": "Technology", "value": 450.0, "weightPct": 100.0 }
  ]
}
```

#### `GET /api/portfolio/history`
Aggregates a 30-day daily time series comparing portfolio market value against total cost basis.
- **Auth:** `requireAuth`
- **Response `200 OK`:** `[{ "date": "2026-10-21", "value": 410.0, "costBasis": 427.5 }, ...]`

---

### 4.7 Wallet (`/api/wallet`)

#### `GET /api/wallet`
Returns `{ "balance": number, "starting_balance": number }`.
- **Auth:** `requireAuth`

#### `GET /api/wallet/history`
Reconstructs chronological cash balance points over the past 30 days from `starting_balance`, stock trades, and wallet deposits/withdrawals.
- **Auth:** `requireAuth`
- **Response `200 OK`:** `[{ "date": "2026-10-21", "balance": 100000 }, ...]`

#### `POST /api/wallet/deposit`
Credits simulated cash (`0 < amount <= 10,000,000`) and logs a `WL-...` entry in `wallet_transactions`.
- **Auth:** `requireAuth`
- **Body:** `{ "amount": 5000 }`
- **Response `200 OK`:** `{ "message": "Deposited $5000.00 (WL-...).", "balance": 104587.5, "confirmation_id": "WL-..." }`

#### `POST /api/wallet/withdraw`
Debits simulated cash (`0 < amount <= currentBalance`) and logs a `WL-...` entry in `wallet_transactions`.
- **Auth:** `requireAuth`
- **Body:** `{ "amount": 1000 }`
- **Response `200 OK`:** `{ "message": "Withdrew $1000.00 (WL-...).", "balance": 103587.5, "confirmation_id": "WL-..." }`

---

### 4.8 Transactions (`/api/transactions`)

#### `GET /api/transactions`
Returns the unified, descending-chronological ledger merging stock `transactions` (`BUY` / `SELL`) and `wallet_transactions` (`DEPOSIT` / `WITHDRAWAL`).
- **Auth:** `requireAuth`
- **Response `200 OK`:**
```json
[
  {
    "id": "uuid",
    "category": "trade",
    "tradeType": "SELL",
    "symbol": "NVDA",
    "company": "NVIDIA Corporation",
    "shares": 2,
    "quantity": 2,
    "pricePerShare": 150.0,
    "limitPrice": 150.0,
    "amount": 300.0,
    "totalAmount": 300.0,
    "realizedPnl": 15.0,
    "tradeEntered": "2026-11-20T13:20:00.000Z",
    "confirmation": "LS-9F8E7D6C",
    "confirmation_id": "LS-9F8E7D6C",
    "status": "executed",
    "reviewNote": null,
    "description": "Market Order Executed (2 sh @ $150.00)"
  }
]
```

---

### 4.9 Watchlist (`/api/watchlist`)

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/watchlist` | `requireAuth` | Raw watchlist items joined with stock metadata. |
| `GET` | `/api/watchlist/with-quotes` | `requireAuth` | Watchlist enriched with live OHLCV quotes, `dailyChangePct`, `targetDeltaPct`, and `targetStatus` (`hit` \| `above` \| `below` \| `unset`). |
| `POST` | `/api/watchlist` | `requireAuth` | Adds `{ "symbol": "AAPL" }` (validates quote & creates `stocks` row if needed). Returns `409` if already tracked. |
| `PATCH` | `/api/watchlist/:symbol` | `requireAuth` | Sets or clears `{ "target_price": 195.50 \| null }`. |
| `DELETE` | `/api/watchlist/:symbol` | `requireAuth` | Removes `:symbol` from the user's watchlist. |

---

### 4.10 Announcements (`/api/announcements`)

#### `GET /api/announcements`
Returns active administrator announcements ordered by `is_pinned DESC, created_at DESC` for display on the User Dashboard.
- **Auth:** `requireAuth`
- **Response `200 OK`:**
```json
[
  {
    "announcement_id": "uuid",
    "title": "Market Maintenance Notice",
    "message": "After-hours simulation refresh runs at 20:00 UTC.",
    "severity": "info",
    "is_pinned": true,
    "created_at": "2026-11-20T09:00:00Z",
    "updated_at": "2026-11-20T09:00:00Z"
  }
]
```

---

### 4.11 Secure CSV Exports (`/api/exports`)

All endpoints stream sanitized CSV files as downloads (`Content-Disposition: attachment`). Admin exports automatically write an entry to `admin_audit_logs`.

| Method | Endpoint | Auth | Export Contents |
|---|---|---|---|
| `GET` | `/api/exports/transactions` | `requireAuth` | User's combined trade + wallet ledger. |
| `GET` | `/api/exports/holdings` | `requireAuth` | User's current holdings with live prices & unrealized P/L. |
| `GET` | `/api/exports/watchlist` | `requireAuth` | User's watchlist with current vs. target prices. |
| `GET` | `/api/exports/admin/users` | `requireAdmin` | All users, status, roles, cash, portfolio values, trade counts. |
| `GET` | `/api/exports/admin/stocks` | `requireAdmin` | All supported stocks, status, shares held, trade volume. |
| `GET` | `/api/exports/admin/trades` | `requireAdmin` | Platform stock trades (up to 1,000 rows) + review status/notes. |
| `GET` | `/api/exports/admin/portfolios` | `requireAdmin` | User portfolios, equity value, cost basis, net worth. |
| `GET` | `/api/exports/admin/audit-logs` | `requireAdmin` | Administrator audit trail (up to 1,000 rows). |
| `GET` | `/api/exports/admin/report?range=30d` | `requireAdmin` | Daily volume report (`range` = `7d` \| `30d` \| `90d` \| `all`). |

---

### 4.12 Administrator Console (`/api/admin`)

Every route in `/api/admin` enforces `requireAuth` + `requireAdmin`. Mutating `POST` / `PATCH` routes require `Content-Type: application/json` (`415` otherwise) and validate UUID parameters (`400` on malformed UUIDs).

#### System Overview & Announcements
- **`GET /api/admin/overview`** — Platform KPIs (`totalUsers`, `activeUsers`, `suspendedUsers`, `totalCash`, `totalPortfolioValue`, `totalTrades`, `totalVolume`, `volume24h`, `flaggedTrades`, `activeStocks`, `haltedStocks`), `recentTrades`, `recentLogs`, plus live `marketStatus` & `cacheStats`.
- **`GET /api/admin/announcements`** — Lists all announcements (active and archived).
- **`POST /api/admin/announcements`** — Creates announcement: `{ "title", "message", "severity": "info|warning|success|urgent", "is_pinned": boolean, "is_active": boolean }`.
- **`PATCH /api/admin/announcements/:id`** — Updates/toggles announcement fields.
- **`DELETE /api/admin/announcements/:id`** — Deletes an announcement.

#### User Management
- **`GET /api/admin/users`** — Returns all users with wallet, holdings, trade counts/volume, status, and role.
- **`PATCH /api/admin/users/:id/status`** — Body: `{ "status": "active" | "suspended" }` (blocks suspending admin accounts with `409`).
- **`PATCH /api/admin/users/:id/profile`** — Updates locked fields on a user's behalf: `{ "username"?, "email"?, "birth_date"? }` (`YYYY-MM-DD`). If `SUPABASE_SERVICE_ROLE_KEY` is configured, updates `auth.users.email` as well.
- **`POST /api/admin/users/:id/wallet`** — Credits or debits user cash idempotently:
  ```json
  {
    "amount": "500.00",
    "direction": "credit",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "Competition prize"
  }
  ```

#### Stock Management
- **`GET /api/admin/stocks`** — Returns supported stocks with latest recorded price, holders count, shares held, trade count, and trade volume.
- **`POST /api/admin/stocks`** — Creates a stock: `{ "symbol", "company_name", "exchange"?, "sector"?, "status": "active|halted|disabled" }`.
- **`PATCH /api/admin/stocks/:id`** — Updates stock metadata or changes operational status (`active` / `halted` / `disabled`).
- **`DELETE /api/admin/stocks/:id`** — Deletes a stock (`409 Conflict` if any user holds shares > 0).

#### Trade Management
- **`GET /api/admin/trades?limit=200`** — Returns `{ stockTrades, walletTrades }` (`limit` clamped 10–1000).
- **`PATCH /api/admin/trades/:id/review`** — Sets trade review status & note: `{ "review_status": "executed|approved|flagged|rejected", "review_note": "..." }`.

#### Portfolio Monitoring
- **`GET /api/admin/portfolios`** — Returns `{ userPortfolios, assetExposure }` across the platform.

#### Market Data Management
- **`GET /api/admin/market-data`** — Returns provider status, cache stats, config TTLs, cached keys, and recent API request logs.
- **`PATCH /api/admin/market-data/config`** — Body: `{ "autoRefreshPaused"?: boolean, "quoteTtlSec"?: number, "candleTtlSec"?: number }`.
- **`POST /api/admin/market-data/cache/clear`** — Body: `{ "prefix"?: "quote:" | "candles:" | "" }` (empty clears all).
- **`POST /api/admin/market-data/refresh`** — Body: `{ "symbols"?: ["NVDA", "AAPL"] }` (defaults to first 5 active stocks).

#### Reports & Audit Logs
- **`GET /api/admin/reports?range=30d`** — Aggregated trade/wallet summary, daily volume series, and top 10 symbols for `7d` | `30d` | `90d` | `all`.
- **`GET /api/admin/audit-logs?limit=250`** — Returns administrator audit log entries (`limit` clamped 20–1000).

---

## 5. Market Data Providers & Rate Limits (Free Tier)

Only **free-tier** endpoints are called:

| Provider | Free Tier Cap | Internal Buffer | Endpoints Used | Cache TTL |
|---|---|---|---|---|
| **Twelve Data** | 8 req/min, 800 req/day | 7 req/min, 800/day | `/quote`, `/time_series`, `/symbol_search` | Quote 60s · Candles 5m · Search 10m |
| **Finnhub** | 60 req/min | 55 req/min | `/quote`, `/search`, `/stock/market-status`, `/news` | Status 60s · News 5m |

- Finnhub's paid/deprecated `/stock/candle` endpoint is **never used**.
- When rate limits are reached or upstream errors occur, `stockService.js` gracefully falls back (Finnhub for quotes/search; US Eastern Time schedule for market status; stale cached entry if available).

---

## 6. Database Schema & Supabase RPCs

### Core & Extended Tables
- **`public.users`**: `user_id` (PK), `username`, `email`, `birth_date`, `avatar_url`, `created_at`, `last_login`
- **`public.wallets`**: `wallet_id` (PK), `user_id` (unique), `balance` (default `100000.00`), `starting_balance`, `updated_at`
- **`public.stocks`**: `stock_id` (PK), `symbol` (unique), `company_name`, `exchange`, `sector`, `status` (`active` \| `halted` \| `disabled`), `created_at`
- **`public.holdings`**: `holding_id` (PK), `user_id`, `stock_id`, `quantity`, `avg_buy_price`, `updated_at`
- **`public.transactions`**: `transaction_id` (PK), `user_id`, `stock_id`, `transaction_type` (`buy` \| `sell`), `quantity`, `price_per_share`, `total_amount`, `confirmation_id`, `realized_pnl`, `review_status` (`executed` \| `approved` \| `flagged` \| `rejected`), `review_note`, `reviewed_at`, `executed_at`
- **`public.wallet_transactions`**: `user_id`, `transaction_type` (`deposit` \| `withdrawal`), `amount`, `confirmation_id`, `reason`, `created_at`
- **`public.watchlist_items`**: `watchlist_id` (PK), `user_id`, `stock_id`, `target_price`, `added_at`
- **`public.announcements`**: `announcement_id` (PK), `admin_id`, `title`, `message`, `severity`, `is_pinned`, `is_active`, `created_at`, `updated_at`
- **`public.admin_audit_logs`**: `log_id` (PK), `admin_id`, `admin_username`, `category`, `action`, `target_type`, `target_id`, `details` (jsonb), `created_at`

### Admin `SECURITY DEFINER` RPCs (`public.lada_admin_*`)
All execute with `search_path = ''` and reject non-admins with SQLSTATE `42501`:
- `lada_admin_overview()`, `lada_admin_users()`, `lada_admin_set_status(uuid, text)`, `lada_admin_update_profile(uuid, text, text, date)`, `lada_admin_adjust_wallet(uuid, numeric, uuid, text)`
- `lada_admin_stocks()`, `lada_admin_upsert_stock(uuid, text, text, text, text, text)`, `lada_admin_delete_stock(uuid)`
- `lada_admin_trades(int)`, `lada_admin_review_trade(uuid, text, text)`
- `lada_admin_portfolios()`, `lada_admin_reports(text)`
- `lada_admin_announcements()`, `lada_admin_save_announcement(uuid, text, text, text, boolean, boolean)`, `lada_admin_delete_announcement(uuid)`
- `lada_admin_audit_logs(int)`, `lada_admin_log_audit(text, text, text, text, jsonb)`

---

## 7. Frontend Pages & Client Conventions

| Page | Path | Key Capabilities |
|---|---|---|
| **User Dashboard** | `/pages/dashboard/dashboard.html` | Account KPIs, Admin Announcements banner, watchlist target alerts, market status & news. |
| **Charts & Trading** | `/pages/charts/charts.html?symbol=NVDA` | Plotly candlestick + synchronized **volume** subplot, toolbar indicators (SMA/EMA/BB/Annotations), buy/sell order ticket, per-symbol position & trade history. Supports `?symbol=` query param. |
| **Portfolio** | `/pages/portfolio/portfolio.html` | Net Worth, Unrealized/Realized P/L, Today's Change, Sector Allocation bars, 30-day Market Value vs. Cost Basis chart (Chart.js), position weights, CSV export. |
| **Watchlist** | `/pages/watchlist/watchlist.html` | Live quote search, inline target price input, alert status pills (`Target Hit`, `Above Target`, `Below Target`), OHLCV details, direct Trade link to Charts, CSV export. |
| **Wallet** | `/pages/wallet/wallet.html` | 30-day Cash Balance History chart (Chart.js), quick amount presets, Deposit/Withdraw with inline validation, activity filter, ledger CSV export. |
| **Transactions** | `/pages/transactions/transactions.html` | Searchable/filterable trade + wallet ledger, receipt detail modal, live quote column, pagination, CSV export. |
| **Profile** | `/pages/User/user.html` | Editable username, Cloudinary avatar upload, password change, portfolio snapshot, locked `email` & `birth_date` with Administrator contact (`24104152@usc.edu.ph`). |
| **Admin Console** | `/pages/admin/admin-dashboard.html` | Protected view (`server/views/admin-dashboard.html`) with 8 management tabs + Announcements Manager matching the user navy/gold glassmorphic theme. |

---

## 8. HTTP Status Codes & Error Format

API errors return JSON `{ "message": "..." }` (or `{ "error": "..." }` on `/api/auth/me` updates):

| Status | Meaning |
|---|---|
| `400` | Validation error, missing parameters, insufficient funds/shares, or attempt to edit locked profile fields. |
| `401` | Missing or expired session cookies (user pages redirect to login). |
| `403` | Account suspended, non-admin accessing admin endpoints, or trading a halted/disabled stock. |
| `404` | Resource or API route not found. |
| `409` | Duplicate record (`23505`), concurrent wallet modification, invalid admin constraint (e.g., deleting stock with holders or suspending an admin). |
| `415` | Missing `Content-Type: application/json` header on admin write endpoints. |
| `500` | Unexpected server or upstream provider failure. |
