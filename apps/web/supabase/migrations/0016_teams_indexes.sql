-- teams: (user_id, created_at) 複合インデックスに置き換え、ORDER BY created_at ASC のソートを省略する
DROP INDEX IF EXISTS "teams_user_id_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_user_created_idx" ON "teams" USING btree ("user_id", "created_at");--> statement-breakpoint
-- team_members: (team_id, slot_index) 複合主キーを追加し、team_id での JOIN / 検索と整合性を保証する
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_slot_index_pk" PRIMARY KEY ("team_id", "slot_index");
