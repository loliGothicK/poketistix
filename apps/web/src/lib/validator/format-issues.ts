import { teamSchema } from "@/lib/validator/team";
import { itemById } from "@/data/items";
import { MAX_EV_PER_STAT, MAX_EV_TOTAL } from "@/store/team/lint";
import * as v from "valibot";

import type { TFunction } from "i18next";

/**
 * teamSchema の v.safeParse の結果から、人間が読みやすいエラー文字列の配列を生成する。
 * - スロット番号ではなくポケモン名を使用する
 * - アイテム ID ではなくアイテム名を使用する
 * - Valibot の生メッセージではなくローカライズされた説明文を出力する
 */
export function formatTeamValidationIssues(
  result: v.SafeParseResult<typeof teamSchema>,
  t: TFunction,
  members: readonly ({ identifier: string; item: number | null } | null)[],
): string[] {
  if (result.success) return [];

  return result.issues.map((issue) => {
    const path = issue.path?.map((p) => p.key) ?? [];

    // 1. チーム全体のレベルのエラー
    if (path.length === 0 || (path.length === 1 && path[0] === "name")) {
      return t("teamBuilder.validation.teamNameRequired");
    }
    if (path.length === 1 && path[0] === "members") {
      return t("teamBuilder.validation.teamSizeRequired");
    }

    // 2. メンバーレベルのエラー: path = ["members", slotIndex, ...fields]
    if (path.length >= 2 && path[0] === "members" && typeof path[1] === "number") {
      const slotIndex = path[1] as number;
      const member = members[slotIndex];

      // ポケモン名（翻訳キー: pokemon.{identifier}.name）
      const pokemonName = member
        ? t(`pokemon.${member.identifier}.name`)
        : t("teamBuilder.slotLabel", { index: slotIndex + 1 });

      const field = path[2];

      if (!field && issue.message.includes("Invalid Pokemon")) {
        return `${pokemonName}: ${t("teamBuilder.validation.invalidPokemon")}`;
      }

      // 特性 (ability)
      if (field === "ability") {
        if (issue.message.includes("not valid")) {
          return `${pokemonName}: ${t("teamBuilder.validation.invalidAbility")}`;
        }
        return `${pokemonName}: ${t("teamBuilder.validation.abilityRequired")}`;
      }

      // 技 (moves)
      if (field === "moves") {
        if (path.length > 3 || issue.message.includes("not valid")) {
          return `${pokemonName}: ${t("teamBuilder.validation.invalidMove")}`;
        }
        return `${pokemonName}: ${t("teamBuilder.validation.movesRequired")}`;
      }

      // 持ち物重複 (item)
      if (field === "item") {
        const itemIdentifier =
          member?.item !== null && member?.item !== undefined
            ? itemById.get(member.item)?.identifier
            : null;
        const itemName = itemIdentifier ? t(`items.${itemIdentifier}.name`) : null;
        const prefix = itemName ? `${pokemonName} (${itemName})` : pokemonName;
        return `${prefix}: ${t("teamBuilder.validation.duplicateItem")}`;
      }

      // ポケモン重複・不正 (identifier)
      if (field === "identifier") {
        if (issue.message.includes("Invalid") || issue.message.includes("not valid")) {
          return `${pokemonName}: ${t("teamBuilder.validation.invalidPokemon")}`;
        }
        return `${pokemonName}: ${t("teamBuilder.validation.duplicateSpecies")}`;
      }

      // 努力値 (evs)
      if (field === "evs") {
        const statKey = path[3];
        if (typeof statKey === "string") {
          const statName = t(`teamBuilder.status.${statKey}.name`);
          return `${pokemonName}: ${t("teamBuilder.validation.statEvExceeded", {
            stat: statName,
            max: MAX_EV_PER_STAT,
          })}`;
        }
        return `${pokemonName}: ${t("teamBuilder.validation.totalEvExceeded", {
          max: MAX_EV_TOTAL,
        })}`;
      }

      // 性格 (nature)
      if (field === "nature") {
        return `${pokemonName}: ${t("teamBuilder.validation.natureRequired")}`;
      }

      // 性別 (gender)
      if (field === "gender") {
        return `${pokemonName}: ${t("teamBuilder.validation.invalidGender")}`;
      }

      // その他のフィールドがある場合
      const fieldPath = path.slice(2).join("/");
      return `${pokemonName}: ${fieldPath} — ${issue.message}`;
    }

    return issue.message;
  });
}
