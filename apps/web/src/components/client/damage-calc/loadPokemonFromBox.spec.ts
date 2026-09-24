import { describe, it, expect } from "vitest";
import { loadPokemonFromBox } from "./loadPokemonFromBox";
import type { TrainedPokemon } from "@/store/team/team";
import { itemByIdentifier } from "@/data/items";
import { abilityByIdentifier } from "@/data/abilities";
import { moveByIdentifier } from "@/data/moves";

describe("loadPokemonFromBox", () => {
  const garchompAbility = abilityByIdentifier.get("rough-skin")!;
  const lifeOrb = itemByIdentifier.get("life-orb")!;
  const earthquake = moveByIdentifier.get("earthquake")!;
  const swordsDance = moveByIdentifier.get("swords-dance")!;

  const samplePokemon: TrainedPokemon = {
    boxId: "01HXYZ00000000000000000001",
    identifier: "garchomp",
    slug: "garchomp",
    ability: garchompAbility.id,
    item: lifeOrb.id,
    gender: { fixed: false },
    nature: { plus: "atk", minus: "spa" }, // Adamant
    moves: [swordsDance.id, earthquake.id, null, null],
    evs: {
      hp: 4,
      atk: 32,
      def: 0,
      spa: 0,
      spd: 0,
      spe: 32,
    },
  };

  it("converts TrainedPokemon to attacker PokemonPanelState with damaging move prioritized", () => {
    const result = loadPokemonFromBox(samplePokemon, "attacker");

    expect(result.identifier).toBe("garchomp");
    expect(result.ability).toBe("rough-skin");
    expect(result.item).toBe("life-orb");
    expect(result.evHp).toBe(4);
    expect(result.evAtk).toBe(32);
    expect(result.evSpe).toBe(32);
    expect(result.evDef).toBe(0);
    expect(result.evSpa).toBe(0);
    expect(result.evSpd).toBe(0);
    expect(result.natures).toEqual({ atk: 1.1, spa: 0.9 });
    // earthquake is a damaging move, prioritized over swords-dance
    expect(result.move).toBe("earthquake");
    expect(result.hpPercent).toBe(100);
    expect(result.boosts).toEqual({});
  });

  it("converts TrainedPokemon to defender PokemonPanelState with move as null", () => {
    const result = loadPokemonFromBox(samplePokemon, "defender");

    expect(result.identifier).toBe("garchomp");
    expect(result.ability).toBe("rough-skin");
    expect(result.item).toBe("life-orb");
    expect(result.evHp).toBe(4);
    expect(result.evAtk).toBe(32);
    expect(result.evSpe).toBe(32);
    expect(result.natures).toEqual({ atk: 1.1, spa: 0.9 });
    expect(result.move).toBeNull();
  });

  it("handles neutral nature correctly", () => {
    const neutralPokemon: TrainedPokemon = {
      ...samplePokemon,
      nature: { plus: "atk", minus: "atk" },
    };
    const result = loadPokemonFromBox(neutralPokemon, "attacker");
    expect(result.natures).toEqual({});
  });

  it("handles pokemon without item", () => {
    const noItemPokemon: TrainedPokemon = {
      ...samplePokemon,
      item: null,
    };
    const result = loadPokemonFromBox(noItemPokemon, "attacker");
    expect(result.item).toBeNull();
  });

  it("selects first move if only status moves exist for attacker", () => {
    const statusOnlyPokemon: TrainedPokemon = {
      ...samplePokemon,
      moves: [swordsDance.id, null, null, null],
    };
    const result = loadPokemonFromBox(statusOnlyPokemon, "attacker");
    expect(result.move).toBe("swords-dance");
  });
});
