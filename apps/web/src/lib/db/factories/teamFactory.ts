import { teams } from "@/lib/db/schema";
import { ulid } from "ulid";

export type InsertTeam = typeof teams.$inferInsert;

export class TeamFactory<THasUserId extends boolean = false, THasName extends boolean = false> {
  private data: Partial<InsertTeam> = {
    id: ulid(),
  };

  withUserId(userId: string): TeamFactory<true, THasName> {
    this.data.userId = userId;
    return this as unknown as TeamFactory<true, THasName>;
  }

  withName(name: string): TeamFactory<THasUserId, true> {
    this.data.name = name;
    return this as unknown as TeamFactory<THasUserId, true>;
  }

  withDescription(description: string): this {
    this.data.description = description;
    return this;
  }

  build(this: TeamFactory<true, true>): InsertTeam {
    return this.data as InsertTeam;
  }
}
