import { describe, it, expect } from "vitest";
import { resolveDamageInput, effectiveSpeed, isGrounded, type PokemonPanelState, type ResolveContext } from "./resolve";
import { M } from "./types";

const defaultPanel: PokemonPanelState = {
  identifier: "pikachu", // Arbitrary defaults to avoid null checks
  move: "tackle",
  ability: "static",
  item: null,
  boosts: {},
  evHp: 0,
  evAtk: 0,
  evDef: 0,
  evSpa: 0,
  evSpd: 0,
  evSpe: 0,
  hpPercent: 100,
  conditions: {},
  moveConditions: {},
  itemConditions: {},
  natures: {},
};

const defaultContext: ResolveContext = {
  attacker: { ...defaultPanel, identifier: "charizard", move: "flamethrower" },
  defender: { ...defaultPanel, identifier: "venusaur" },
  weather: "none",
  terrain: "none",
  fairyAura: false,
  wonderRoom: false,
  gravity: false,
  screens: { reflect: false, lightScreen: false, auroraVeil: false },
  isDoubles: true,
  isCrit: false,
};

describe("resolveDamageInput", () => {
  it("returns null if attacker or defender is missing", () => {
    expect(
      resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: null },
      }),
    ).toBeNull();
    expect(
      resolveDamageInput({
        ...defaultContext,
        defender: { ...defaultContext.defender, identifier: null },
      }),
    ).toBeNull();
  });

  describe("Base Power Modifiers (bpModifiers)", () => {
    it("applies Technician (1.5x) for moves with base power <= 60", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "scizor", ability: "technician", move: "bullet-punch" },
      });
      expect(res?.bpModifiers).toContain(M.TECHNICIAN);
      expect(res?.basePower).toBe(40);
    });

    it("does not apply Technician for moves with base power > 60", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "scizor", ability: "technician", move: "iron-head" },
      });
      expect(res?.bpModifiers ?? []).not.toContain(M.TECHNICIAN);
      expect(res?.basePower).toBe(80);
    });

    it("applies Iron Fist (~1.2x) for punch classification moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", ability: "iron-fist", move: "mach-punch" },
      });
      expect(res?.bpModifiers).toContain(4915);
    });

    it("applies Strong Jaw (1.5x) for biting classification moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", ability: "strong-jaw", move: "crunch" },
      });
      expect(res?.bpModifiers).toContain(6144);
    });

    it("applies Water Bubble (2.0x) for water type moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "araquanid", ability: "water-bubble", move: "liquidation" },
      });
      expect(res?.bpModifiers).toContain(8192);
    });
    it("applies Tough Claws (~1.3x) for contact moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", ability: "tough-claws", move: "flare-blitz" },
      });
      expect(res?.bpModifiers).toContain(5324);
    });

    it("does not apply Tough Claws for non-contact moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", ability: "tough-claws", move: "flamethrower" },
      });
      expect(res?.bpModifiers ?? []).not.toContain(5324);
    });

    it("applies Sand Force (~1.3x) for Rock/Ground/Steel moves in Sandstorm", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "sandstorm",
        attacker: { ...defaultContext.attacker, identifier: "excadrill", ability: "sand-force", move: "earthquake" },
      });
      expect(res?.bpModifiers).toContain(5324);
    });

    it("applies Steelworker (1.5x) for steel moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", ability: "steelworker", move: "iron-head" },
      });
      expect(res?.bpModifiers).toContain(6144);
    });

    it("applies Flare Boost (1.5x) for special moves when burned", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          ability: "flare-boost",
          move: "shadow-ball",
          conditions: { burn: true },
        },
      });
      expect(res?.bpModifiers).toContain(6144);
    });

    it("applies Toxic Boost (1.5x) for physical moves when poisoned", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          ability: "toxic-boost",
          move: "facade",
          conditions: { poison: true },
        },
      });
      expect(res?.bpModifiers).toContain(6144);
    });

    it("applies Muscle Band (~1.1x) for physical moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", item: "muscle-band", move: "flare-blitz" },
      });
      expect(res?.bpModifiers).toContain(4505);
    });

    it("applies Wise Glasses (~1.1x) for special moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", item: "wise-glasses", move: "flamethrower" },
      });
      expect(res?.bpModifiers).toContain(4505);
    });

    it("applies Type-enhancing item (1.2x)", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", item: "type-boost", move: "flamethrower" },
      });
      expect(res?.bpModifiers).toContain(M.TYPE_ITEM);
    });

    it("applies Helping Hand (1.5x)", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          move: "flamethrower",
          conditions: { helpingHand: true },
        },
      });
      expect(res?.bpModifiers).toContain(M.HELPING_HAND);
    });

    it("applies Charge (2.0x) for electric moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "pikachu",
          move: "thunderbolt",
          conditions: { charge: true },
        },
      });
      expect(res?.bpModifiers).toContain(M.CHARGE);
    });

    it("applies Steely Spirit (1.5x) for steel moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          move: "iron-head",
          conditions: { steelySpirit: true },
        },
      });
      expect(res?.bpModifiers).toContain(6144);
    });

    it("applies Battery (1.3x) for special moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          move: "flamethrower",
          conditions: { battery: true },
        },
      });
      expect(res?.bpModifiers).toContain(M.BATTERY);
    });

    it("applies Power Spot (1.3x)", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          move: "flamethrower",
          conditions: { powerSpot: true },
        },
      });
      expect(res?.bpModifiers).toContain(M.POWER_SPOT);
    });

    it("applies Fairy Aura (~1.3x) for fairy moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        fairyAura: true,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "moonblast" },
      });
      expect(res?.bpModifiers).toContain(5448);
    });
  });

  describe("Attack / Defense Modifiers", () => {
    it("applies Huge Power (2.0x) for physical moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "azumarill", ability: "huge-power", move: "play-rough" },
      });
      expect(res?.attackModifiers).toContain(M.HUGE_POWER);
    });

    it("does not apply Huge Power for special moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "azumarill", ability: "huge-power", move: "surf" },
      });
      expect(res?.attackModifiers ?? []).not.toContain(M.HUGE_POWER);
    });

    it("applies Choice Band (1.5x) for physical moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "garchomp", item: "choice-band", move: "earthquake" },
      });
      expect(res?.attackModifiers).toContain(M.CHOICE);
    });

    it("applies Choice Specs (1.5x) for special moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", item: "choice-specs", move: "draco-meteor" },
      });
      expect(res?.attackModifiers).toContain(M.CHOICE);
    });

    it("applies Guts (1.5x) for physical moves when statused", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          ability: "guts",
          move: "flare-blitz",
          conditions: { burn: true },
        },
      });
      expect(res?.attackModifiers).toContain(6144);
    });

    it("applies Hustle (1.5x) for physical moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", ability: "hustle", move: "flare-blitz" },
      });
      expect(res?.attackModifiers).toContain(6144);
    });

    it("applies Solar Power (1.5x) for special moves in Sun", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "sun",
        attacker: { ...defaultContext.attacker, identifier: "charizard", ability: "solar-power", move: "flamethrower" },
      });
      expect(res?.attackModifiers).toContain(6144);
    });

    it("applies Defeatist (0.5x) when HP <= 50%", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          ability: "defeatist",
          move: "acrobatics",
          hpPercent: 49,
        },
      });
      expect(res?.attackModifiers).toContain(2048);
    });

    it("applies Marvel Scale (1.5x) for defense when statused", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flare-blitz" }, // Physical move
        defender: {
          ...defaultContext.defender,
          identifier: "dragonite",
          ability: "marvel-scale",
          conditions: { burn: true },
        },
      });
      expect(res?.defenseModifiers).toContain(6144);
    });

    it("applies Grass Pelt (1.5x) for defense in Grassy Terrain", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        terrain: "grassy",
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flare-blitz" },
        defender: { ...defaultContext.defender, identifier: "dragonite", ability: "grass-pelt" },
      });
      expect(res?.defenseModifiers).toContain(6144);
    });

    it("applies Fur Coat (2.0x) for physical defense", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flare-blitz" },
        defender: { ...defaultContext.defender, identifier: "dragonite", ability: "fur-coat" },
      });
      expect(res?.defenseModifiers).toContain(8192);
    });

    it("applies Eviolite (1.5x) for NFE pokemon (simulated by item check)", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flare-blitz" },
        defender: { ...defaultContext.defender, identifier: "dragonite", item: "eviolite" },
      });
      expect(res?.defenseModifiers).toContain(6144);
    });

    it("applies Assault Vest (1.5x) for special defense", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" }, // Special move
        defender: { ...defaultContext.defender, identifier: "dragonite", item: "assault-vest" },
      });
      expect(res?.defenseModifiers).toContain(6144);
    });

    it("applies Snow defense boost (1.5x) for Ice-type defender against physical moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "snow",
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flare-blitz" }, // Physical move
        defender: { ...defaultContext.defender, identifier: "abomasnow" }, // Ice/Grass
      });
      expect(res?.defenseModifiers).toContain(6144);
    });

    it("applies Snow defense boost (1.5x) for Ice-type defender against Psyshock (defensiveStat: def)", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "snow",
        attacker: { ...defaultContext.attacker, identifier: "starmie", move: "psyshock" }, // Special move with def target
        defender: { ...defaultContext.defender, identifier: "abomasnow" },
      });
      expect(res?.defenseModifiers).toContain(6144);
    });

    it("does not apply Snow defense boost for Ice-type defender against special moves (defensiveStat: spd)", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "snow",
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" }, // Special move
        defender: { ...defaultContext.defender, identifier: "abomasnow" },
      });
      expect(res?.defenseModifiers ?? []).not.toContain(6144);
    });

    it("does not apply Snow defense boost for non-Ice defender against physical moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "snow",
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flare-blitz" },
        defender: { ...defaultContext.defender, identifier: "venusaur" }, // Grass/Poison
      });
      expect(res?.defenseModifiers ?? []).not.toContain(6144);
    });

    it("applies Sandstorm special defense boost (1.5x) for Rock-type defender against special moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "sandstorm",
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" }, // Special move
        defender: { ...defaultContext.defender, identifier: "tyranitar" }, // Rock/Dark
      });
      expect(res?.defenseModifiers).toContain(6144);
    });

    it("does not apply Sandstorm special defense boost for Rock-type defender against physical moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "sandstorm",
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flare-blitz" }, // Physical move
        defender: { ...defaultContext.defender, identifier: "tyranitar" },
      });
      expect(res?.defenseModifiers ?? []).not.toContain(6144);
    });
  });

  describe("Final Modifiers", () => {
    it("applies Expert Belt (1.2x) on super effective hits", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "starmie", item: "expert-belt", move: "ice-beam" },
        defender: { ...defaultContext.defender, identifier: "dragonite" },
      });
      expect(res?.finalModifiers).toContain(M.EXPERT_BELT);
    });

    it("does not apply Expert Belt on neutral hits", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "starmie", item: "expert-belt", move: "surf" },
        defender: { ...defaultContext.defender, identifier: "dragonite" }, // Water vs Dragon/Flying is not very effective (0.5x)
      });
      expect(res?.finalModifiers ?? []).not.toContain(M.EXPERT_BELT);
    });

    it("applies Tinted Lens (2.0x) on not very effective hits", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", ability: "tinted-lens", move: "bug-buzz" },
        defender: { ...defaultContext.defender, identifier: "skarmory" }, // Bug vs Steel/Flying is 0.25x
      });
      expect(res?.finalModifiers).toContain(M.TINTED_LENS);
    });

    it("applies Thick Fat (0.5x) when taking fire or ice moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" },
        defender: { ...defaultContext.defender, identifier: "snorlax", ability: "thick-fat" },
      });
      expect(res?.finalModifiers).toContain(2048);
    });

    it("applies Water Bubble (0.5x) defense when taking fire moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" },
        defender: { ...defaultContext.defender, identifier: "araquanid", ability: "water-bubble" },
      });
      expect(res?.finalModifiers).toContain(2048);
    });

    it("applies Solid Rock / Filter (0.75x) on super effective hits", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "dragonite", move: "surf" },
        defender: { ...defaultContext.defender, identifier: "charizard", ability: "solid-rock" }, // Water vs Fire/Flying is SE
      });
      expect(res?.finalModifiers).toContain(3072);
    });

    it("applies Fluffy (0.5x) for contact moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flare-blitz" }, // Contact
        defender: { ...defaultContext.defender, identifier: "dragonite", ability: "fluffy" },
      });
      expect(res?.finalModifiers).toContain(2048);
    });

    it("applies Fluffy weakness (2.0x) for fire moves", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" }, // Fire, non-contact
        defender: { ...defaultContext.defender, identifier: "dragonite", ability: "fluffy" },
      });
      expect(res?.finalModifiers).toContain(8192); // 2.0x
    });

    it("applies Multiscale (0.5x) when at 100% HP", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" },
        defender: { ...defaultContext.defender, identifier: "dragonite", ability: "multiscale", hpPercent: 100 },
      });
      expect(res?.finalModifiers).toContain(M.MULTISCALE);
    });

    it("does not apply Multiscale when HP < 100%", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" },
        defender: { ...defaultContext.defender, identifier: "dragonite", ability: "multiscale", hpPercent: 99 },
      });
      expect(res?.finalModifiers ?? []).not.toContain(M.MULTISCALE);
    });

    it("applies Life Orb (1.3x)", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", item: "life-orb", move: "flamethrower" },
      });
      expect(res?.finalModifiers).toContain(M.LIFE_ORB);
    });

    it("applies Metronome (1.0x to 2.0x)", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          item: "metronome",
          move: "flamethrower",
          itemConditions: { metronome: 3 },
        },
      });
      // 1.0 + 3 * 0.2 = 1.6x => 6553
      expect(res?.finalModifiers).toContain(6553);
    });

    it("applies Freeze-Dry override on Water types", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "freeze-dry" },
        defender: { ...defaultContext.defender, identifier: "blastoise" }, // Water type
      });
      // Should be Super Effective due to Freeze-Dry override. If it is SE, multiplier > 1
      expect(res?.effectivenessOverride).toBe(1);
    });
  });

  describe("Move specific logic", () => {
    it("applies Spit Up base power correctly based on stockpileTurns", () => {
      const res1 = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          move: "spit-up",
          moveConditions: { stockpileTurns: 1 },
        },
      });
      expect(res1?.basePower).toBe(100);

      const res3 = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          move: "spit-up",
          moveConditions: { stockpileTurns: 3 },
        },
      });
      expect(res3?.basePower).toBe(300);
    });

    it("applies Fickle Beam full power correctly", () => {
      const resNormal = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          move: "fickle-beam",
          moveConditions: { fickleBeamFullPower: false },
        },
      });
      expect(resNormal?.basePower).toBe(80);

      const resFull = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "charizard",
          move: "fickle-beam",
          moveConditions: { fickleBeamFullPower: true },
        },
      });
      expect(resFull?.basePower).toBe(160);
    });
  });

  describe("Weather and Terrain", () => {
    it("applies Weather Boost (1.5x) for Fire moves in Sun", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "sun",
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" },
      });
      expect(res?.weatherModifier).toBe(M.WEATHER_BOOST);
    });

    it("applies Weather Penalty (0.5x) for Fire moves in Rain", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        weather: "rain",
        attacker: { ...defaultContext.attacker, identifier: "charizard", move: "flamethrower" },
      });
      expect(res?.weatherModifier).toBe(M.WEATHER_PENALTY);
    });
  });

  describe("Immunity Overrides (immuneOverride)", () => {
    it("sets immuneOverride to false for Scrappy attacker with Normal move against Ghost defender", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "kangaskhan",
          ability: "scrappy",
          move: "fake-out",
        },
        defender: {
          ...defaultContext.defender,
          identifier: "gengar",
          ability: "cursed-body",
        },
      });
      expect(res?.immuneOverride).toBe(false);
    });

    it("sets immuneOverride to false for Scrappy attacker with Fighting move against Ghost defender", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "kangaskhan",
          ability: "scrappy",
          move: "low-kick",
        },
        defender: {
          ...defaultContext.defender,
          identifier: "gengar",
          ability: "cursed-body",
        },
      });
      expect(res?.immuneOverride).toBe(false);
    });

    it("does not set immuneOverride for non-Scrappy attacker using Normal move against Ghost defender", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "kangaskhan",
          ability: "early-bird",
          move: "fake-out",
        },
        defender: {
          ...defaultContext.defender,
          identifier: "gengar",
          ability: "cursed-body",
        },
      });
      expect(res?.immuneOverride).toBeUndefined();
    });

    it("does not set immuneOverride for Scrappy attacker using non-Normal/Fighting move", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "kangaskhan",
          ability: "scrappy",
          move: "fire-punch",
        },
        defender: {
          ...defaultContext.defender,
          identifier: "gengar",
          ability: "cursed-body",
        },
      });
      expect(res?.immuneOverride).toBeUndefined();
    });

    it("sets immuneOverride to true when defender is protecting, even if attacker has Scrappy", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        attacker: {
          ...defaultContext.attacker,
          identifier: "kangaskhan",
          ability: "scrappy",
          move: "fake-out",
        },
        defender: {
          ...defaultContext.defender,
          identifier: "gengar",
          ability: "cursed-body",
          conditions: { protect: true },
        },
      });
      expect(res?.immuneOverride).toBe(true);
    });

    it("sets immuneOverride to false under Gravity for Ground moves against Flying / Levitate", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        gravity: true,
        attacker: {
          ...defaultContext.attacker,
          identifier: "garchomp",
          ability: "rough-skin",
          move: "earthquake",
        },
        defender: {
          ...defaultContext.defender,
          identifier: "charizard",
          ability: "blaze",
        },
      });
      expect(res?.immuneOverride).toBe(false);
    });

    it("sets immuneOverride to true for Ground moves against Levitate defender without Gravity", () => {
      const res = resolveDamageInput({
        ...defaultContext,
        gravity: false,
        attacker: {
          ...defaultContext.attacker,
          identifier: "garchomp",
          ability: "rough-skin",
          move: "earthquake",
        },
        defender: {
          ...defaultContext.defender,
          identifier: "rotom-wash",
          ability: "levitate",
        },
      });
      expect(res?.immuneOverride).toBe(true);
    });
  });

  describe("Effective Speed (effectiveSpeed)", () => {
    it("doubles speed in Sun with Chlorophyll", () => {
      const speed = effectiveSpeed(100, 0, null, "chlorophyll", "sun", "none", {});
      expect(speed).toBe(200);
    });

    it("doubles speed in Rain with Swift Swim", () => {
      const speed = effectiveSpeed(105, 0, null, "swift-swim", "rain", "none", {});
      expect(speed).toBe(210);
    });

    it("doubles speed in Sandstorm with Sand Rush", () => {
      const speed = effectiveSpeed(108, 0, null, "sand-rush", "sandstorm", "none", {});
      expect(speed).toBe(216);
    });

    it("doubles speed in Snow with Slush Rush", () => {
      const speed = effectiveSpeed(70, 0, null, "slush-rush", "snow", "none", {});
      expect(speed).toBe(140);
    });

    it("doubles speed in Electric Terrain with Surge Surfer", () => {
      const speed = effectiveSpeed(130, 0, null, "surge-surfer", "none", "electric", {});
      expect(speed).toBe(260);
    });

    it("applies 1.5x speed with Quick Feet and a status condition, ignoring paralysis penalty", () => {
      const speed = effectiveSpeed(150, 0, null, "quick-feet", "none", "none", { paralysis: true });
      expect(speed).toBe(225);
    });

    it("halves speed with Paralysis (without Quick Feet)", () => {
      const speed = effectiveSpeed(150, 0, null, "overgrow", "none", "none", { paralysis: true });
      expect(speed).toBe(75);
    });

    it("applies 1.5x speed with Choice Scarf", () => {
      const speed = effectiveSpeed(122, 0, "choice-scarf", "rough-skin", "none", "none", {});
      expect(speed).toBe(183);
    });

    it("halves speed with Iron Ball", () => {
      const speed = effectiveSpeed(122, 0, "iron-ball", "rough-skin", "none", "none", {});
      expect(speed).toBe(61);
    });

    it("doubles speed with Tailwind", () => {
      const speed = effectiveSpeed(122, 0, null, "rough-skin", "none", "none", { tailwind: true });
      expect(speed).toBe(244);
    });

    it("applies stage boosts correctly", () => {
      const speed = effectiveSpeed(122, 2, null, "rough-skin", "none", "none", {});
      expect(speed).toBe(244);
    });
  });

  describe("Grounding (isGrounded)", () => {
    it("is true for grounded types like Pikachu", () => {
      const grounded = isGrounded(["electric"], null, null, false);
      expect(grounded).toBe(true);
    });

    it("is false for Flying types like Charizard", () => {
      const grounded = isGrounded(["fire", "flying"], null, null, false);
      expect(grounded).toBe(false);
    });

    it("is false for Pokemon with Levitate like Gengar", () => {
      const grounded = isGrounded(["ghost", "poison"], "levitate", null, false);
      expect(grounded).toBe(false);
    });

    it("is true if Gravity is active even for Flying types", () => {
      const grounded = isGrounded(["fire", "flying"], null, null, true);
      expect(grounded).toBe(true);
    });

    it("is true if holding Iron Ball even for Flying types", () => {
      const grounded = isGrounded(["fire", "flying"], null, "iron-ball", false);
      expect(grounded).toBe(true);
    });

    it("is false if underground, ignoring Gravity and Iron Ball", () => {
      const grounded = isGrounded(["fire", "flying"], null, "iron-ball", true, true);
      expect(grounded).toBe(false);
    });
  });
});
