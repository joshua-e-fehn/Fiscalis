ALTER TABLE "precious_metal_prices" ADD COLUMN "gold_eur" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "precious_metal_prices" ADD COLUMN "gold_usd" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "precious_metal_prices" ADD COLUMN "silver_eur" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "precious_metal_prices" ADD COLUMN "silver_usd" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "precious_metal_prices" ADD COLUMN "platinum_eur" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "precious_metal_prices" ADD COLUMN "platinum_usd" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "precious_metal_prices" ADD COLUMN "palladium_eur" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "precious_metal_prices" ADD COLUMN "palladium_usd" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "precious_metal_prices" DROP COLUMN IF EXISTS "gold";--> statement-breakpoint
ALTER TABLE "precious_metal_prices" DROP COLUMN IF EXISTS "silver";--> statement-breakpoint
ALTER TABLE "precious_metal_prices" DROP COLUMN IF EXISTS "platinum";--> statement-breakpoint
ALTER TABLE "precious_metal_prices" DROP COLUMN IF EXISTS "palladium";