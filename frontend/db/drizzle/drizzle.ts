// import { drizzle } from "drizzle-orm/postgres-js";
// import postgres from "postgres";

// const connectionString = process.env.DATABASE_URL!;

// // Disable prefetch as it is not supported for "Transaction" pool mode
// export const client = postgres(connectionString, { prepare: false });
// export const db = drizzle(client);

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema: schema, logger: true });
