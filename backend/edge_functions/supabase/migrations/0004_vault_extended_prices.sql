-- Migration: Add extended price columns for Vault feature
-- Adds CHF prices for all metals, gold gram/kilo prices, and purity-based prices

-- ============================================
-- CHF prices for all metals (per ounce)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS silver_chf NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS platinum_chf NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS palladium_chf NUMERIC(10, 2);

-- ============================================
-- Gold prices per gram (EUR, USD, CHF)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_gram NUMERIC(12, 6);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_gram NUMERIC(12, 6);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_gram NUMERIC(12, 6);

-- ============================================
-- Gold prices per kilogram (EUR, USD, CHF)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_kilo NUMERIC(12, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_kilo NUMERIC(12, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_kilo NUMERIC(12, 2);

-- ============================================
-- Gold purity-based prices in EUR (per ounce at purity)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_333 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_585 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_750 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_833 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_900 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_916 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_999 NUMERIC(10, 2);

-- ============================================
-- Gold purity-based prices in USD (per ounce at purity)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_333 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_585 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_750 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_833 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_900 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_916 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_999 NUMERIC(10, 2);

-- ============================================
-- Gold purity-based prices in CHF (per ounce at purity)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_333 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_585 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_750 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_833 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_900 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_916 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_999 NUMERIC(10, 2);

-- ============================================
-- Add EUR to CHF exchange rate to currency_exchange_rates
-- ============================================
ALTER TABLE currency_exchange_rates ADD COLUMN IF NOT EXISTS from_eur_to_chf NUMERIC(10, 4);
