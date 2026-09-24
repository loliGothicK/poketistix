import { abilityById } from "@/data/abilities";
import { itemById } from "@/data/items";
import { moveById } from "@/data/moves";
import { VARIABLE_POWER_MOVES, type StatKey } from "@/lib/damage";
import type { PokemonPanelState } from "./useDamageCalcPage";
import type { TrainedPokemon } from "@/store/team/team";

export function loadPokemonFromBox(
  pokemon: TrainedPokemon,
  role: "attacker" | "defender",
): PokemonPanelState {
  const abilitySlug = abilityById.get(pokemon.ability)?.identifier ?? null;
  const itemSlug = pokemon.item !== null ? (itemById.get(pokemon.item)?.identifier ?? null) : null;

  const natures: Partial<Record<StatKey, number>> = {};
  const { plus, minus } = pokemon.nature;
  if (plus && plus !== minus) {
    natures[plus as StatKey] = 1.1;
  }
  if (minus && plus !== minus) {
    natures[minus as StatKey] = 0.9;
  }

  // 技の決定 (attacker のみ)
  let moveSlug: string | null = null;
  if (role === "attacker") {
    const validMoves = pokemon.moves
      .filter((m): m is number => m !== null)
      .map((id) => moveById.get(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));

    // 攻撃技（変化技以外で、威力 > 0 または VARIABLE_POWER_MOVES に含まれる）を優先
    const damagingMove = validMoves.find((m) => {
      if (m.category === "status") return false;
      if (VARIABLE_POWER_MOVES.has(m.identifier)) return true;
      return m.power !== null && m.power > 0;
    });

    if (damagingMove) {
      moveSlug = damagingMove.identifier;
    } else if (validMoves.length > 0 && validMoves[0]) {
      moveSlug = validMoves[0].identifier;
    }
  }

  return {
    identifier: pokemon.identifier,
    move: moveSlug,
    ability: abilitySlug,
    item: itemSlug,
    evHp: pokemon.evs.hp ?? 0,
    evAtk: pokemon.evs.atk ?? 0,
    evDef: pokemon.evs.def ?? 0,
    evSpa: pokemon.evs.spa ?? 0,
    evSpd: pokemon.evs.spd ?? 0,
    evSpe: pokemon.evs.spe ?? 0,
    natures,
    boosts: {},
    hpPercent: 100,
    conditions: {},
    moveConditions: {},
    itemConditions: {},
  };
}
