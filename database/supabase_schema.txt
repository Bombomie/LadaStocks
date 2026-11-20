SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


SET default_tablespace = '';
SET default_table_access_method = "heap";

CREATE TABLE IF NOT EXISTS "public"."admins" (
    "admin_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."admins" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."bonuses" (
    "bonus_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "admin_id" "uuid",
    "bonus_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "reason" "text",
    "granted_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."bonuses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."holdings" (
    "holding_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stock_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "avg_buy_price" numeric(12,4) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."holdings" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."news" (
    "news_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "source" "text",
    "published_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."news" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."news_stock_tags" (
    "news_id" "uuid" NOT NULL,
    "stock_id" "uuid" NOT NULL
);


ALTER TABLE "public"."news_stock_tags" OWNER TO "postgres";


-- stock_prices
-- Historical OHLCV data (open, high, low, close, volume) for each stock.

CREATE TABLE IF NOT EXISTS "public"."stock_prices" (
    "price_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stock_id" "uuid" NOT NULL,
    "open_price" numeric(12,4),
    "high_price" numeric(12,4),
    "low_price" numeric(12,4),
    "close_price" numeric(12,4),
    "volume" bigint,
    "recorded_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."stock_prices" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."stocks" (
    "stock_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "symbol" "text" NOT NULL,
    "company_name" "text" NOT NULL,
    "exchange" "text",
    "sector" "text"
);


ALTER TABLE "public"."stocks" OWNER TO "postgres";


-- transactions
-- Trading history. `transaction_type` is restricted to lowercase `buy` or `sell`.

CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "transaction_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stock_id" "uuid" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "price_per_share" numeric(12,4) NOT NULL,
    "total_amount" numeric(14,2) NOT NULL,
    "executed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transactions_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['buy'::"text", 'sell'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."users" (
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "email" "text" NOT NULL,
    "birth_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_login" timestamp with time zone
);


ALTER TABLE "public"."users" OWNER TO "postgres";


-- wallets
-- Simulation wallet. `balance` and `starting_balance` default to 100,000.00.
-- A UNIQUE constraint enforces one wallet per user.

CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "wallet_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "balance" numeric(14,2) DEFAULT 100000.00 NOT NULL,
    "starting_balance" numeric(14,2) DEFAULT 100000.00 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."watchlist_items" (
    "watchlist_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "stock_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."watchlist_items" OWNER TO "postgres";

ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_email_key" UNIQUE ("email");

ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_pkey" PRIMARY KEY ("admin_id");

ALTER TABLE ONLY "public"."admins"
    ADD CONSTRAINT "admins_username_key" UNIQUE ("username");

ALTER TABLE ONLY "public"."bonuses"
    ADD CONSTRAINT "bonuses_pkey" PRIMARY KEY ("bonus_id");

ALTER TABLE ONLY "public"."holdings"
    ADD CONSTRAINT "holdings_pkey" PRIMARY KEY ("holding_id");

ALTER TABLE ONLY "public"."holdings"
    ADD CONSTRAINT "holdings_user_id_stock_id_key" UNIQUE ("user_id", "stock_id");

ALTER TABLE ONLY "public"."news"
    ADD CONSTRAINT "news_pkey" PRIMARY KEY ("news_id");

ALTER TABLE ONLY "public"."news_stock_tags"
    ADD CONSTRAINT "news_stock_tags_pkey" PRIMARY KEY ("news_id", "stock_id");

ALTER TABLE ONLY "public"."stock_prices"
    ADD CONSTRAINT "stock_prices_pkey" PRIMARY KEY ("price_id");

ALTER TABLE ONLY "public"."stocks"
    ADD CONSTRAINT "stocks_pkey" PRIMARY KEY ("stock_id");

ALTER TABLE ONLY "public"."stocks"
    ADD CONSTRAINT "stocks_symbol_key" UNIQUE ("symbol");

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("transaction_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");

ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("wallet_id");

ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_key" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."watchlist_items"
    ADD CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("watchlist_id");

ALTER TABLE ONLY "public"."watchlist_items"
    ADD CONSTRAINT "watchlist_items_user_id_stock_id_key" UNIQUE ("user_id", "stock_id");


CREATE INDEX "idx_holdings_user" ON "public"."holdings" USING "btree" ("user_id");

CREATE INDEX "idx_stock_prices_stock_time" ON "public"."stock_prices" USING "btree" ("stock_id", "recorded_at" DESC);

CREATE INDEX "idx_transactions_user" ON "public"."transactions" USING "btree" ("user_id", "executed_at" DESC);


ALTER TABLE ONLY "public"."bonuses"
    ADD CONSTRAINT "bonuses_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("admin_id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."bonuses"
    ADD CONSTRAINT "bonuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."holdings"
    ADD CONSTRAINT "holdings_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("stock_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."holdings"
    ADD CONSTRAINT "holdings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."news_stock_tags"
    ADD CONSTRAINT "news_stock_tags_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "public"."news"("news_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."news_stock_tags"
    ADD CONSTRAINT "news_stock_tags_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("stock_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stock_prices"
    ADD CONSTRAINT "stock_prices_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("stock_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("stock_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."watchlist_items"
    ADD CONSTRAINT "watchlist_items_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("stock_id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."watchlist_items"
    ADD CONSTRAINT "watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE CASCADE;


CREATE POLICY "Users can insert own transactions" ON "public"."transactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can manage own holdings" ON "public"."holdings" USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can manage own watchlist" ON "public"."watchlist_items" USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can update own wallet" ON "public"."wallets" FOR UPDATE USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view own bonuses" ON "public"."bonuses" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view own holdings" ON "public"."holdings" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view own transactions" ON "public"."transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));
CREATE POLICY "Users can view own wallet" ON "public"."wallets" FOR SELECT USING (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."admins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bonuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."holdings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."news" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."news_stock_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."watchlist_items" ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON TABLE "public"."admins" TO "anon";
GRANT ALL ON TABLE "public"."admins" TO "authenticated";
GRANT ALL ON TABLE "public"."admins" TO "service_role";

GRANT ALL ON TABLE "public"."bonuses" TO "anon";
GRANT ALL ON TABLE "public"."bonuses" TO "authenticated";
GRANT ALL ON TABLE "public"."bonuses" TO "service_role";

GRANT ALL ON TABLE "public"."holdings" TO "anon";
GRANT ALL ON TABLE "public"."holdings" TO "authenticated";
GRANT ALL ON TABLE "public"."holdings" TO "service_role";

GRANT ALL ON TABLE "public"."news" TO "anon";
GRANT ALL ON TABLE "public"."news" TO "authenticated";
GRANT ALL ON TABLE "public"."news" TO "service_role";

GRANT ALL ON TABLE "public"."news_stock_tags" TO "anon";
GRANT ALL ON TABLE "public"."news_stock_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."news_stock_tags" TO "service_role";

GRANT ALL ON TABLE "public"."stock_prices" TO "anon";
GRANT ALL ON TABLE "public"."stock_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_prices" TO "service_role";

GRANT ALL ON TABLE "public"."stocks" TO "anon";
GRANT ALL ON TABLE "public"."stocks" TO "authenticated";
GRANT ALL ON TABLE "public"."stocks" TO "service_role";

GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";

GRANT ALL ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";

GRANT ALL ON TABLE "public"."watchlist_items" TO "anon";
GRANT ALL ON TABLE "public"."watchlist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."watchlist_items" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
