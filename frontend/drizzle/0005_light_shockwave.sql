DO $$ BEGIN
 CREATE TYPE "public"."broker_status" AS ENUM('connected', 'disconnected', 'error', 'pending');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."broker_type" AS ENUM('interactive_brokers');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "broker_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"broker_type" "broker_type" NOT NULL,
	"connection_name" text NOT NULL,
	"status" "broker_status" DEFAULT 'pending' NOT NULL,
	"account_id" text,
	"username" text,
	"last_sync_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "broker_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_id" serial NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"quantity" numeric(18, 8) NOT NULL,
	"average_cost" numeric(13, 2),
	"current_price" numeric(13, 2),
	"market_value" numeric(13, 2),
	"unrealized_pnl" numeric(13, 2),
	"currency" text DEFAULT 'USD',
	"asset_type" text,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broker_positions" ADD CONSTRAINT "broker_positions_connection_id_broker_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."broker_connections"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_broker_idx" ON "broker_connections" USING btree ("user_id","broker_type","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "position_idx" ON "broker_positions" USING btree ("connection_id","symbol");