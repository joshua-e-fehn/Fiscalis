CREATE TABLE IF NOT EXISTS "precious_metal_prices" (
	"timestamp" timestamp PRIMARY KEY NOT NULL,
	"gold" numeric(10, 2) NOT NULL,
	"silver" numeric(10, 2) NOT NULL,
	"platinum" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" RENAME TO "currency_exchange_rates";--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" ADD COLUMN "timestamp" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" ADD COLUMN "from_eur_to_usd" numeric(10, 4) NOT NULL;--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" DROP COLUMN IF EXISTS "email";--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" DROP COLUMN IF EXISTS "password";--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" DROP COLUMN IF EXISTS "role";--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" DROP COLUMN IF EXISTS "created_at";--> statement-breakpoint
ALTER TABLE "currency_exchange_rates" DROP COLUMN IF EXISTS "updated_at";