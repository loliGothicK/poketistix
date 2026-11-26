import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// This module is server-only. Never import from client components.
const client = postgres(
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  {
    // Supabase Pooler（特に Transaction Pooler :6543）およびサーバーレス環境向けの最適化
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  },
);

export const db = drizzle(client, { schema });
