-- team_revisions を snapshot + セマンティックdiff (jsonb) として新設する
-- diff: 変更があったキーのみを持つセマンティック差分 ({name?, description?, pokepasteChanged, members[]})
-- snapshot: 改訂時点のフルスナップショット。履歴の復元は単体で完結する
--> statement-breakpoint
CREATE TABLE "team_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"diff" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "team_revisions" ADD CONSTRAINT "team_revisions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_revisions" ADD CONSTRAINT "team_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_revisions" ADD CONSTRAINT "team_revisions_diff_is_object" CHECK (jsonb_typeof("team_revisions"."diff") = 'object');--> statement-breakpoint
ALTER TABLE "team_revisions" ADD CONSTRAINT "team_revisions_snapshot_is_object" CHECK (jsonb_typeof("team_revisions"."snapshot") = 'object');--> statement-breakpoint
CREATE INDEX "team_revisions_team_id_idx" ON "team_revisions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_revisions_created_at_idx" ON "team_revisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "team_revisions_snapshot_gin" ON "team_revisions" USING gin ("snapshot");--> statement-breakpoint
CREATE INDEX "team_revisions_diff_gin" ON "team_revisions" USING gin ("diff");--> statement-breakpoint
ALTER TABLE "team_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "select own team_revisions" ON "team_revisions" FOR SELECT USING (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "insert own team_revisions" ON "team_revisions" FOR INSERT WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "update own team_revisions" ON "team_revisions" FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "delete own team_revisions" ON "team_revisions" FOR DELETE USING (auth.uid() = user_id);
