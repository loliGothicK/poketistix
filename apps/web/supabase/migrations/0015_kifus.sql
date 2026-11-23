-- kifus テーブルを新設し、PBN 棋譜（原文 + 構造化 JSONB）を battle_records から独立して正規化管理する
--> statement-breakpoint
CREATE TABLE "kifus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"battle_record_id" uuid,
	"pbn" text NOT NULL,
	"data" jsonb NOT NULL,
	"regulation" text,
	"turn_count" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kifus" ADD CONSTRAINT "kifus_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kifus" ADD CONSTRAINT "kifus_battle_record_id_battle_records_id_fk" FOREIGN KEY ("battle_record_id") REFERENCES "public"."battle_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kifus" ADD CONSTRAINT "kifus_pbn_not_empty" CHECK (char_length("kifus"."pbn") > 0);--> statement-breakpoint
ALTER TABLE "kifus" ADD CONSTRAINT "kifus_data_is_object" CHECK (jsonb_typeof("kifus"."data") = 'object');--> statement-breakpoint
ALTER TABLE "kifus" ADD CONSTRAINT "kifus_turn_count_non_negative" CHECK ("kifus"."turn_count" >= 0);--> statement-breakpoint
CREATE INDEX "kifus_user_created_idx" ON "kifus" USING btree ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX "kifus_battle_record_id_idx" ON "kifus" USING btree ("battle_record_id");--> statement-breakpoint
CREATE INDEX "kifus_data_gin" ON "kifus" USING gin ("data");--> statement-breakpoint
CREATE UNIQUE INDEX "kifus_battle_record_id_uniq" ON "kifus" USING btree ("battle_record_id") WHERE "battle_record_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "kifus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "select own kifus" ON "kifus" FOR SELECT USING (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "insert own kifus" ON "kifus" FOR INSERT WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "update own kifus" ON "kifus" FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);--> statement-breakpoint
CREATE POLICY "delete own kifus" ON "kifus" FOR DELETE USING (auth.uid() = user_id);
