CREATE TABLE IF NOT EXISTS "plaid_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"item_id" text NOT NULL,
	"institution_id" text,
	"institution_name" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plaid_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plaid_transaction_id" text NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"amount" numeric(13, 2) NOT NULL,
	"date" timestamp NOT NULL,
	"name" text NOT NULL,
	"merchant_name" text,
	"category" text,
	"pending" boolean DEFAULT false,
	"synced_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_item_idx" ON "plaid_items" USING btree ("user_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_idx" ON "plaid_transactions" USING btree ("user_id","plaid_transaction_id");