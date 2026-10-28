import {
  weatherModifier,
  terrainModifier,
  terrainDefensiveModifier,
  stabModifier,
  screenModifier,
  spreadModifier,
  isPhysicalCategory,
  getMoveMechanics,
  resolveFieldReactiveMove,
  resolveAbilityTypeChange,
  freezeDryOverride,
  tarShotFireOverride,
  effectivenessShift,
  type Weather,
  type Terrain,
  type DamageInput,
  type PowerContext,
  M,
  type ScreenState,
} from "./index";
import type { Type } from "@/types/pokemon";
import { championsPokemonByIdentifier } from "@/data/champions-pokemon";
import type { StatKey } from "./moveMechanics";
import { moveByIdentifier } from "@/data/moves";
import { pokemonById } from "@/data/pokemon";
import { calcStatus } from "@/data/utility/training";

export type PokemonPanelState = {
  readonly identifier: string | null;
  readonly move: string | null;
  readonly ability: string | null;
  readonly item: string | null;
  readonly boosts: Partial<Record<StatKey, number>>;
  readonly evHp: number;
  readonly evAtk: number;
  readonly evDef: number;
  readonly evSpa: number;
  readonly evSpd: number;
  readonly evSpe: number;
  readonly hpPercent: number;
  readonly conditions: Readonly<Record<string, boolean>>;
  readonly moveConditions: Readonly<Record<string, boolean | number>>;
  readonly itemConditions: Readonly<Record<string, boolean | number>>;
  readonly natures: Readonly<Partial<Record<StatKey, number>>>;
};

export type ResolveContext = {
  attacker: PokemonPanelState;
  defender: PokemonPanelState;
  weather: Weather;
  terrain: Terrain;
  fairyAura: boolean;
  wonderRoom: boolean;
  gravity: boolean;
  screens: ScreenState;
  isDoubles: boolean;
  isCrit: boolean;
};

export function effectiveSpeed(
  base: number,
  boost: number,
  item: string | null,
  ability: string | null,
  weather: Weather,
  terrain: Terrain,
  conditions: Readonly<Record<string, boolean>>,
): number {
  let s = base;
  const num = Math.max(2, 2 + boost);
  const den = Math.max(2, 2 - boost);
  s = Math.floor((s * num) / den);

  if (ability === "chlorophyll" && weather === "sun") s = Math.floor((s * 8192) / 4096);
  else if (ability === "swift-swim" && weather === "rain") s = Math.floor((s * 8192) / 4096);
  else if (ability === "sand-rush" && weather === "sandstorm") s = Math.floor((s * 8192) / 4096);
  else if (ability === "slush-rush" && weather === "snow") s = Math.floor((s * 8192) / 4096);
  else if (ability === "surge-surfer" && terrain === "electric") s = Math.floor((s * 8192) / 4096);
  else if (
    ability === "quick-feet" &&
    (conditions.paralysis || conditions.burn || conditions.poison || conditions.sleep)
  )
    s = Math.floor((s * 6144) / 4096);

  if (item === "choice-scarf") s = Math.floor((s * 6144) / 4096);
  else if (
    item === "iron-ball" ||
    item === "macho-brace" ||
    item === "power-weight" ||
    item === "power-bracer" ||
    item === "power-belt" ||
    item === "power-lens" ||
    item === "power-band" ||
    item === "power-anklet"
  )
    s = Math.floor((s * 2048) / 4096);

  if (conditions.tailwind) s = Math.floor((s * 8192) / 4096);
  if (conditions.paralysis && ability !== "quick-feet") s = Math.floor((s * 2048) / 4096);

  return s;
}

export function isGrounded(
  types: readonly Type[],
  ability: string | null,
  item: string | null,
  gravity: boolean,
  isUndergroundOrSubmerged: boolean = false,
): boolean {
  if (isUndergroundOrSubmerged) return false;
  if (gravity) return true;
  if (item === "iron-ball") return true;
  if (ability === "levitate") return false;
  if (types.includes("flying")) return false;
  return true;
}

export function resolveDamageInput(ctx: ResolveContext): DamageInput | null {
  const {
    attacker,
    defender,
    weather,
    terrain,
    fairyAura,
    wonderRoom,
    gravity,
    screens,
    isDoubles,
    isCrit,
  } = ctx;

  if (!attacker.identifier || !attacker.move || !defender.identifier) return null;

  const atkPokemon = championsPokemonByIdentifier.get(attacker.identifier);
  const defPokemon = championsPokemonByIdentifier.get(defender.identifier);
  const move = moveByIdentifier.get(attacker.move);

  if (!atkPokemon || !defPokemon || !move || move.category === "status") return null;

  const mechanics = getMoveMechanics(move.identifier, move.category);
  const isPhysical = isPhysicalCategory(move.category);
  const ac = attacker.conditions;
  const dc = defender.conditions;

  let moveType = move.type;
  let staticPower = move.power ?? 0;

  const fieldResolved = resolveFieldReactiveMove(
    move.identifier,
    weather,
    terrain,
    move.type,
    move.power ?? 0,
  );
  if (fieldResolved) {
    moveType = fieldResolved.type;
    staticPower = fieldResolved.power;
  }

  let ateBoost = false;
  const abilityType = resolveAbilityTypeChange(attacker.ability, moveType);
  if (abilityType) {
    moveType = abilityType.type;
    ateBoost = abilityType.boosted;
  }

  if (ac.electrify) moveType = "electric";

  const stat = (pokemon: typeof atkPokemon, idx: number, ev: number, nature: number = 1.0) =>
    calcStatus(pokemon.status[idx], ev, nature);

  const atkSpe = effectiveSpeed(
    stat(atkPokemon, 5, attacker.evSpe, attacker.natures?.spe),
    attacker.boosts["spe"] ?? 0,
    attacker.item,
    attacker.ability,
    weather,
    terrain,
    ac,
  );
  const defSpe = effectiveSpeed(
    stat(defPokemon, 5, defender.evSpe, defender.natures?.spe),
    defender.boosts["spe"] ?? 0,
    defender.item,
    defender.ability,
    weather,
    terrain,
    dc,
  );

  const atkWeight = (pokemonById.get(atkPokemon.id)?.weight ?? 0) / 10;
  const defWeight = (pokemonById.get(defPokemon.id)?.weight ?? 0) / 10;

  const attackerGrounded = isGrounded(
    atkPokemon.types,
    attacker.ability,
    attacker.item,
    gravity,
    false,
  );
  const defenderGrounded = isGrounded(
    defPokemon.types,
    defender.ability,
    defender.item,
    gravity,
    !!attacker.moveConditions.targetUnderground ||
      !!attacker.moveConditions.targetSubmerged ||
      !!attacker.moveConditions.targetAirborne ||
      !!attacker.moveConditions.targetPhantom,
  );

  const powerCtx: PowerContext = {
    basePower: staticPower,
    attackerHpPercent: attacker.hpPercent,
    defenderHpPercent: defender.hpPercent,
    attackerSpe: atkSpe,
    defenderSpe: defSpe,
    attackerWeight: atkWeight,
    defenderWeight: defWeight,
    terrain,
    weather,
    attackerGrounded,
    defenderGrounded,
    defenderHasItem: defender.item !== null,
    attackerHasItem: attacker.item !== null,
    attackerItem: attacker.item,
    conditions: attacker.moveConditions,
    gravity,
  };

  const basePower = mechanics.computeBasePower ? mechanics.computeBasePower(powerCtx) : staticPower;
  if (basePower <= 0) return null;

  const bpModifiers: number[] = [];
  if (attackerGrounded && terrainModifier(terrain, moveType) !== M.NEUTRAL)
    bpModifiers.push(terrainModifier(terrain, moveType));
  if (
    defenderGrounded &&
    terrainDefensiveModifier(terrain, moveType, move.identifier) !== M.NEUTRAL
  )
    bpModifiers.push(terrainDefensiveModifier(terrain, moveType, move.identifier));

  if (attacker.item === "type-boost") bpModifiers.push(M.TYPE_ITEM);
  if (attacker.item === "muscle-band" && isPhysical) bpModifiers.push(4505);
  if (attacker.item === "wise-glasses" && !isPhysical) bpModifiers.push(4505);

  if (ateBoost) bpModifiers.push(M.ATE_BOOST);
  if (ac.helpingHand) bpModifiers.push(M.HELPING_HAND);
  if (ac.charge && moveType === "electric") bpModifiers.push(M.CHARGE);
  if (ac.steelySpirit && moveType === "steel") bpModifiers.push(M.STEELY_SPIRIT);
  if (attacker.ability === "fire-mane" && moveType === "fire") bpModifiers.push(M.STEELY_SPIRIT); // 1.5x
  if (ac.powerSpot) bpModifiers.push(M.POWER_SPOT);
  if (ac.battery && !isPhysical) bpModifiers.push(M.BATTERY);
  if (fairyAura && moveType === "fairy") bpModifiers.push(M.FAIRY_AURA);

  if (attacker.ability === "technician" && basePower <= 60) bpModifiers.push(M.TECHNICIAN);
  if (attacker.ability === "iron-fist" && move.classifications.includes("punch"))
    bpModifiers.push(4915); // ~1.2x
  if (attacker.ability === "strong-jaw" && move.classifications.includes("biting"))
    bpModifiers.push(6144); // 1.5x
  if (attacker.ability === "tough-claws" && move.classifications.includes("contact"))
    bpModifiers.push(5324); // ~1.3x
  if (
    attacker.ability === "sand-force" &&
    weather === "sandstorm" &&
    (moveType === "rock" || moveType === "ground" || moveType === "steel")
  )
    bpModifiers.push(5324); // ~1.3x
  if (attacker.ability === "water-bubble" && moveType === "water") bpModifiers.push(8192); // 2.0x
  if (attacker.ability === "steelworker" && moveType === "steel") bpModifiers.push(6144); // 1.5x
  if (attacker.ability === "flare-boost" && ac.burn && !isPhysical) bpModifiers.push(6144); // 1.5x
  if (attacker.ability === "toxic-boost" && ac.poison && isPhysical) bpModifiers.push(6144); // 1.5x

  for (const m of mechanics.bpModifiers?.(powerCtx) ?? []) bpModifiers.push(m);

  const atkAtkVal = stat(atkPokemon, 1, attacker.evAtk, attacker.natures?.atk);
  const atkDefVal = stat(atkPokemon, 2, attacker.evDef, attacker.natures?.def);
  const atkSpaVal = stat(atkPokemon, 3, attacker.evSpa, attacker.natures?.spa);
  const effAtkAtk = ac.powerTrick ? atkDefVal : atkAtkVal;
  const effAtkDef = ac.powerTrick ? atkAtkVal : atkDefVal;

  const defAtkVal = stat(defPokemon, 1, defender.evAtk, defender.natures?.atk);
  const defDefRaw = stat(defPokemon, 2, defender.evDef, defender.natures?.def);
  const defSpdRaw = stat(defPokemon, 4, defender.evSpd, defender.natures?.spd);
  let effDefDef = dc.powerTrick ? defAtkVal : defDefRaw;
  let effDefSpd = defSpdRaw;
  if (wonderRoom) {
    const tmp = effDefDef;
    effDefDef = effDefSpd;
    effDefSpd = tmp;
  }
  const effDefAtk = dc.powerTrick ? defDefRaw : defAtkVal;

  let atkStat: number;
  let attackBoost: number;
  if (mechanics.useTargetAttack) {
    atkStat = effDefAtk;
    attackBoost = defender.boosts["atk"] ?? 0;
  } else if (mechanics.offensiveStat === "def") {
    atkStat = effAtkDef;
    attackBoost = attacker.boosts["def"] ?? 0;
  } else {
    atkStat = mechanics.offensiveStat === "spa" ? atkSpaVal : effAtkAtk;
    attackBoost = attacker.boosts[mechanics.offensiveStat === "spa" ? "spa" : "atk"] ?? 0;
  }

  const defStat = mechanics.defensiveStat === "spd" ? effDefSpd : effDefDef;
  const defenseBoost = mechanics.ignoresTargetDefenseBoosts
    ? 0
    : (defender.boosts[mechanics.defensiveStat === "spd" ? "spd" : "def"] ?? 0);

  const attackModifiers: number[] = [];
  if (attacker.item === "choice-band" && isPhysical) attackModifiers.push(M.CHOICE);
  if (attacker.item === "choice-specs" && !isPhysical) attackModifiers.push(M.CHOICE);
  if (ac.flowerGift && isPhysical) attackModifiers.push(M.FLOWER_GIFT);

  if ((attacker.ability === "huge-power" || attacker.ability === "pure-power") && isPhysical)
    attackModifiers.push(M.HUGE_POWER);
  if (
    attacker.ability === "guts" &&
    (ac.burn || ac.poison || ac.paralysis || ac.sleep) &&
    isPhysical
  )
    attackModifiers.push(6144); // 1.5x
  if (attacker.ability === "hustle" && isPhysical) attackModifiers.push(6144); // 1.5x
  if (attacker.ability === "solar-power" && weather === "sun" && !isPhysical)
    attackModifiers.push(6144); // 1.5x
  if (attacker.ability === "defeatist" && attacker.hpPercent <= 50) attackModifiers.push(2048); // 0.5x

  const defenseModifiers: number[] = [];
  if (dc.flowerGift && !isPhysical) defenseModifiers.push(M.FLOWER_GIFT);

  if (weather === "snow" && defPokemon.types.includes("ice") && mechanics.defensiveStat === "def") {
    defenseModifiers.push(6144); // 1.5x Snow boost to Ice-type Defense
  }
  if (
    weather === "sandstorm" &&
    defPokemon.types.includes("rock") &&
    mechanics.defensiveStat === "spd"
  ) {
    defenseModifiers.push(6144); // 1.5x Sandstorm boost to Rock-type Sp. Def
  }

  if (defender.item === "eviolite") defenseModifiers.push(6144); // 1.5x for NFE
  if (defender.item === "assault-vest" && !isPhysical) defenseModifiers.push(6144); // 1.5x
  if (
    defender.ability === "marvel-scale" &&
    (dc.burn || dc.poison || dc.paralysis || dc.sleep) &&
    isPhysical
  )
    defenseModifiers.push(6144); // 1.5x
  if (defender.ability === "grass-pelt" && terrain === "grassy" && isPhysical)
    defenseModifiers.push(6144); // 1.5x
  if (defender.ability === "fur-coat" && isPhysical) defenseModifiers.push(8192); // 2.0x

  const defType1 = defPokemon.types[0];
  const defType2 = defPokemon.types[1] ?? null;
  let effectivenessOverride: number | null = null;
  if (mechanics.freezeDry && moveType === "ice")
    effectivenessOverride = freezeDryOverride(defType1, defType2);
  else if (dc.tarShot && moveType === "fire")
    effectivenessOverride = tarShotFireOverride(defType1, defType2);

  const shift = effectivenessOverride ?? effectivenessShift(moveType, defType1, defType2);
  const isSuperEffective = shift > 0;
  const isNotVeryEffective = shift < 0;

  const finalModifiers: number[] = [];
  const screenMod = screenModifier(screens, isPhysical, isDoubles, { isCrit });
  if (screenMod !== M.NEUTRAL) finalModifiers.push(screenMod);
  if (attacker.item === "life-orb") finalModifiers.push(M.LIFE_ORB);
  if (attacker.item === "metronome" && typeof attacker.itemConditions.metronome === "number") {
    const turns = attacker.itemConditions.metronome;
    if (turns === 1) finalModifiers.push(M.METRONOME_1);
    else if (turns === 2) finalModifiers.push(M.METRONOME_2);
    else if (turns === 3) finalModifiers.push(M.METRONOME_3);
    else if (turns === 4) finalModifiers.push(M.METRONOME_4);
    else if (turns >= 5) finalModifiers.push(M.METRONOME_5);
  }
  if (attacker.item === "expert-belt" && isSuperEffective) finalModifiers.push(M.EXPERT_BELT);

  if (attacker.ability === "tinted-lens" && isNotVeryEffective) finalModifiers.push(M.TINTED_LENS);
  if ((defender.ability === "solid-rock" || defender.ability === "filter") && isSuperEffective)
    finalModifiers.push(3072); // 0.75x
  if (defender.ability === "thick-fat" && (moveType === "fire" || moveType === "ice"))
    finalModifiers.push(2048); // 0.5x
  if (defender.ability === "water-bubble" && moveType === "fire") finalModifiers.push(2048); // 0.5x
  if (defender.ability === "fluffy") {
    if (move.classifications.includes("contact")) finalModifiers.push(2048); // 0.5x
    if (moveType === "fire") finalModifiers.push(8192); // 2.0x
  }
  if (
    (defender.ability === "multiscale" || defender.ability === "shadow-shield") &&
    defender.hpPercent === 100
  )
    finalModifiers.push(2048); // 0.5x

  let immuneOverride: boolean | null = null;
  if (moveType === "ground") {
    if (gravity) immuneOverride = false;
    else if (defender.ability === "levitate") immuneOverride = true;
  } else if (
    (attacker.ability === "scrappy" || attacker.ability === "mindseye") &&
    (moveType === "normal" || moveType === "fighting") &&
    defPokemon.types.includes("ghost")
  ) {
    immuneOverride = false;
  }

  let protectModifier: number | undefined;
  if (dc.protect) {
    const isContact = move.classifications.includes("contact");
    const canPierce =
      isContact && (attacker.ability === "unseen-fist" || attacker.ability === "piercing-drill");
    if (canPierce) {
      protectModifier = M.Z_INTO_PROTECT; // 1024 = 0.25x
    } else {
      immuneOverride = true;
    }
  }

  const input: DamageInput = {
    level: 50,
    basePower,
    attack: atkStat,
    attackBoost,
    defense: defStat,
    defenseBoost,
    isPhysical,
    moveType,
    defenderType1: defType1,
    spreadModifier: spreadModifier(
      isDoubles && (move.range === "all-opponents" || move.range === "all-pokemon"),
    ),
    weatherModifier: weatherModifier(weather, moveType),
    isCrit,
    critModifier: M.CRIT,
    stabModifier: stabModifier(atkPokemon.types, moveType),
    isBurned: (ac.burn ?? false) && move.identifier !== "facade",
  };

  if (bpModifiers.length > 0) input.bpModifiers = bpModifiers;
  if (attackModifiers.length > 0) input.attackModifiers = attackModifiers;
  if (defenseModifiers.length > 0) input.defenseModifiers = defenseModifiers;
  if (finalModifiers.length > 0) input.finalModifiers = finalModifiers;
  if (defType2) input.defenderType2 = defType2;
  if (effectivenessOverride !== null && effectivenessOverride !== undefined) {
    input.effectivenessOverride = effectivenessOverride;
  }
  if (immuneOverride !== null && immuneOverride !== undefined) {
    input.immuneOverride = immuneOverride;
  }
  if (protectModifier !== undefined) {
    input.protectModifier = protectModifier;
  }

  return input;
}
