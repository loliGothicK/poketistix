import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import * as schema from "./schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local manually
try {
  const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      process.env[key] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
} catch {
  // Ignore if no .env.local
}

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function seed() {
  console.log("Seeding database with production data (1f1084ce-f685-4a04-a04f-7e39ec336d3b)...");

  try {
    // 登録されているユーザーを動的に取得する（DBリセット等でIDが変わる可能性があるため）
    const users = await client`
      SELECT id FROM auth.users 
      WHERE email = 'loligothick@gmail.com' OR id = '1f1084ce-f685-4a04-a04f-7e39ec336d3b'
      ORDER BY (CASE WHEN email = 'loligothick@gmail.com' THEN 0 ELSE 1 END)
      LIMIT 1
    `;

    if (users.length === 0) {
      console.error(
        "エラー: 対象ユーザー ('loligothick@gmail.com' または '1f1084ce-f685-4a04-a04f-7e39ec336d3b') が見つかりません。先にアプリ画面からサインアップしてください。",
      );
      process.exit(1);
    }
    const userId = users[0].id as string;
    console.log(`Using userId: ${userId}`);

    // Check if user already has data to avoid duplicating
    const existingSeasons = await db
      .select({ id: schema.seasons.id })
      .from(schema.seasons)
      .where(eq(schema.seasons.userId, userId))
      .limit(1);

    const isDryRun = process.argv.includes("--dry-run");
    const isForce = process.argv.includes("--force");

    if (existingSeasons.length > 0 && !isForce && !isDryRun) {
      console.log("Data already exists for this user. Skipping seed. (Use --force to overwrite)");
      process.exit(0);
    }

    if (isDryRun) {
      console.log("--- STARTING DRY RUN ---");
    }

    const seedDataPath = path.join(__dirname, "seed-data.json");
    const seedData = JSON.parse(fs.readFileSync(seedDataPath, "utf-8"));

    await db.transaction(async (tx) => {
      if (existingSeasons.length > 0) {
        console.log("Cleaning up existing user data for current user...");
        const userBattles = await tx
          .select({ id: schema.battleRecords.id })
          .from(schema.battleRecords)
          .where(eq(schema.battleRecords.userId, userId));
        if (userBattles.length > 0) {
          await tx.delete(schema.battleRecordOpponents).where(
            inArray(
              schema.battleRecordOpponents.battleRecordId,
              userBattles.map((b) => b.id),
            ),
          );
        }
        await tx.delete(schema.battleRecords).where(eq(schema.battleRecords.userId, userId));
        await tx.delete(schema.teamRevisions).where(eq(schema.teamRevisions.userId, userId));
        await tx.delete(schema.sharedTeams).where(eq(schema.sharedTeams.createdBy, userId));

        const userTeams = await tx
          .select({ id: schema.teams.id })
          .from(schema.teams)
          .where(eq(schema.teams.userId, userId));
        if (userTeams.length > 0) {
          await tx.delete(schema.teamMembers).where(
            inArray(
              schema.teamMembers.teamId,
              userTeams.map((t) => t.id),
            ),
          );
        }
        await tx.delete(schema.teams).where(eq(schema.teams.userId, userId));
        await tx.delete(schema.boxPokemon).where(eq(schema.boxPokemon.userId, userId));
        await tx.delete(schema.dashboards).where(eq(schema.dashboards.userId, userId));
        await tx.delete(schema.seasons).where(eq(schema.seasons.userId, userId));
      }

      console.log(`Inserting ${seedData.seasons.length} seasons...`);
      await tx.insert(schema.seasons).values(
        seedData.seasons.map((s: typeof schema.seasons.$inferInsert) => ({
          ...s,
          userId,
          createdAt: new Date(s.createdAt ?? Date.now()),
          updatedAt: new Date(s.updatedAt ?? Date.now()),
        })),
      );

      console.log(`Inserting ${seedData.teams.length} teams...`);
      await tx.insert(schema.teams).values(
        seedData.teams.map((t: typeof schema.teams.$inferInsert) => ({
          ...t,
          userId,
          createdAt: new Date(t.createdAt ?? Date.now()),
          updatedAt: new Date(t.updatedAt ?? Date.now()),
        })),
      );

      console.log(`Inserting ${seedData.boxPokemon.length} box_pokemon...`);
      await tx.insert(schema.boxPokemon).values(
        seedData.boxPokemon.map((bp: typeof schema.boxPokemon.$inferInsert) => ({
          ...bp,
          userId,
          createdAt: new Date(bp.createdAt ?? Date.now()),
          updatedAt: new Date(bp.updatedAt ?? Date.now()),
        })),
      );

      console.log(`Inserting ${seedData.teamMembers.length} team_members...`);
      await tx.insert(schema.teamMembers).values(seedData.teamMembers);

      console.log(`Inserting ${seedData.sharedTeams.length} shared_teams...`);
      await tx.insert(schema.sharedTeams).values(
        seedData.sharedTeams.map((st: typeof schema.sharedTeams.$inferInsert) => ({
          ...st,
          createdBy: userId,
          createdAt: new Date(st.createdAt ?? Date.now()),
        })),
      );

      console.log(`Inserting ${seedData.teamRevisions.length} team_revisions...`);
      await tx.insert(schema.teamRevisions).values(
        seedData.teamRevisions.map((tr: typeof schema.teamRevisions.$inferInsert) => ({
          ...tr,
          userId,
          createdAt: new Date(tr.createdAt ?? Date.now()),
        })),
      );

      console.log(`Inserting ${seedData.dashboards.length} dashboards...`);
      await tx.insert(schema.dashboards).values(
        seedData.dashboards.map((d: typeof schema.dashboards.$inferInsert) => ({
          ...d,
          userId,
          createdAt: new Date(d.createdAt ?? Date.now()),
          updatedAt: new Date(d.updatedAt ?? Date.now()),
        })),
      );

      console.log(`Inserting ${seedData.battleRecords.length} battle_records...`);
      await tx.insert(schema.battleRecords).values(
        seedData.battleRecords.map((br: typeof schema.battleRecords.$inferInsert) => ({
          ...br,
          userId,
          playedAt: new Date(br.playedAt ?? Date.now()),
          createdAt: new Date(br.createdAt ?? Date.now()),
          updatedAt: new Date(br.updatedAt ?? Date.now()),
        })),
      );

      console.log(`Inserting ${seedData.battleRecordOpponents.length} battle_record_opponents...`);
      for (let i = 0; i < seedData.battleRecordOpponents.length; i += 100) {
        await tx
          .insert(schema.battleRecordOpponents)
          .values(seedData.battleRecordOpponents.slice(i, i + 100));
      }

      if (isDryRun) {
        tx.rollback();
      }
    });

    console.log("Seeding complete!");
  } catch (err: unknown) {
    if (isRollbackError(err)) {
      console.log("--- DRY RUN COMPLETE: Transaction rolled back successfully ---");
    } else {
      console.error("Seeding failed:", err);
      process.exit(1);
    }
  } finally {
    await client.end();
    process.exit(0);
  }
}

function isRollbackError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.toLowerCase().includes("rollback");
  }
  return false;
}

void seed();
