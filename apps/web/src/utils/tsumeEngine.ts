import { Battle, PokemonSet, Side } from "@pkmn/sim";
import type { TsumeData, TsumePokemon } from "@/types/quiz";

export class TsumeEngine {
  private battle: Battle;
  private tsumeData: TsumeData;

  constructor(tsumeData: TsumeData, initialSeed?: number[]) {
    this.tsumeData = tsumeData;
    const isSingles =
      tsumeData.playerSide.active.length === 1 &&
      tsumeData.opponentSide.active.length === 1 &&
      (!tsumeData.playerSide.bench || tsumeData.playerSide.bench.length === 0) &&
      (!tsumeData.opponentSide.bench || tsumeData.opponentSide.bench.length === 0);

    const formatid = isSingles ? "gen9customgame" : "gen9doublescustomgame";

    let prngSeed = initialSeed;
    if (!prngSeed) {
      prngSeed =
        tsumeData.rngControl?.mode === "probabilistic"
          ? [Math.floor(Math.random() * 10000), Math.floor(Math.random() * 10000), 3, 4]
          : [1, 2, 3, 4];
    }

    const formatIdID = (
      typeof formatid === "string" ? formatid : "gen9customgame"
    ) as import("@pkmn/sim").ID;
    const seedStr: `${number},${string}` = `${prngSeed[0]},${prngSeed[1]},${prngSeed[2]},${prngSeed[3]}`;
    this.battle = new Battle({
      formatid: formatIdID,
      seed: seedStr,
    });
    this.initialize();
  }

  private mapPokemon(poke: TsumePokemon): PokemonSet {
    return {
      name: poke.species,
      species: poke.species,
      item: poke.item || "",
      ability: poke.ability || "hardy",
      moves: poke.moves || [],
      nature: poke.nature || "Serious",
      // 努力値が未指定の場合は攻撃面を最大(252)とし、耐久を0にする（ワンパンを発生させやすくする）
      evs: { hp: 0, atk: 252, def: 0, spa: 252, spd: 0, spe: 252 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      level: 50,
      gender: "",
      happiness: 255,
      hpType: "Dark",
      pokeball: "pokeball",
    };
  }

  private initialize() {
    this.battle.setPlayer("p1", { name: "Player 1", team: [] });
    this.battle.setPlayer("p2", { name: "Player 2", team: [] });

    // Since format is not on tsumeData anymore, use gameType
    const isSingles =
      this.battle.format.gameType !== "doubles" && this.battle.format.gameType !== "multi";

    const p1Team = this.tsumeData.playerSide.active.map((p) => this.mapPokemon(p));
    const p2Team = this.tsumeData.opponentSide.active.map((p) => this.mapPokemon(p));
    this.tsumeData.playerSide.bench?.forEach((p) => p1Team.push(this.mapPokemon(p)));
    this.tsumeData.opponentSide.bench?.forEach((p) => p2Team.push(this.mapPokemon(p)));

    const dummyMagikarp: import("@pkmn/sim").PokemonSet = {
      name: "Magikarp",
      species: "Magikarp",
      item: "",
      ability: "",
      moves: ["splash"],
      nature: "Hardy",
      gender: "",
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      level: 1,
    };
    if (!isSingles) {
      if (p1Team.length === 1) {
        p1Team.push(dummyMagikarp);
      }
      if (p2Team.length === 1) {
        p2Team.push(dummyMagikarp);
      }
    }

    this.battle.setPlayer("p1", { name: "Player 1", team: p1Team });
    this.battle.setPlayer("p2", { name: "Player 2", team: p2Team });

    const leads = isSingles ? [1] : [1, 2, 3, 4].slice(0, Math.max(2, Math.min(4, p1Team.length)));
    this.battle.p1.chooseTeam(leads.join(""));
    this.battle.p2.chooseTeam(leads.join(""));

    // Apply states
    this.applySideState(this.battle.p1, this.tsumeData.playerSide.active);
    this.applySideState(this.battle.p2, this.tsumeData.opponentSide.active);

    if (this.tsumeData.correctMoves.includes("encore")) {
      const oppFirstMove = this.tsumeData.opponentSide.active[0]?.moves?.[0];
      if (oppFirstMove) {
        const moveObj = this.battle.dex.moves.get(oppFirstMove);
        if (moveObj && moveObj.exists) {
          this.battle.p2.active[0].lastMove = this.battle.dex.getActiveMove(moveObj);
        }
      }
    }

    // ==========================================
    // RNG Context Interception for Tsume
    // ==========================================
    type RNGContext =
      | "accuracy"
      | "crit"
      | "secondary"
      | "damage_roll"
      | "speed_tie"
      | "sleep_turns"
      | null;
    let currentContext: RNGContext = null;
    let currentAttacker: "p1" | "p2" | null = null;
    const rngRules = this.tsumeData.rngControl || { mode: "deterministic" };

    // Wrapper helper
    const wrapAction = (methodName: keyof typeof this.battle.actions, context: RNGContext) => {
      const actionsObj = this.battle.actions;
      const original = actionsObj[methodName];
      if (typeof original !== "function") return;

      Object.assign(actionsObj, {
        [methodName]: (...args: unknown[]) => {
          const prevContext = currentContext;
          const prevAttacker = currentAttacker;

          currentContext = context;
          // Find the pokemon object in arguments
          interface PokemonArg {
            side?: { id: "p1" | "p2" };
          }
          const isPokemonArg = (a: unknown): a is PokemonArg => {
            if (!a || typeof a !== "object") return false;
            const side = Reflect.get(a, "side");
            return !!side && typeof side === "object" && "id" in side;
          };

          const pokemonArg = args.find(isPokemonArg);
          if (pokemonArg && pokemonArg.side) {
            currentAttacker = pokemonArg.side.id;
          }

          try {
            return Function.prototype.apply.call(original, actionsObj, args);
          } finally {
            currentContext = prevContext;
            currentAttacker = prevAttacker;
          }
        },
      });
    };

    wrapAction("runMove", "accuracy");
    wrapAction("modifyDamage", "crit");
    wrapAction("moveHit", "secondary");
    wrapAction("getDamage", "damage_roll");

    // Override randomChance (Accuracy, Crits, Secondary Effects)
    const originalRandomChance = this.battle.randomChance.bind(this.battle);
    this.battle.randomChance = (numerator: number, denominator: number) => {
      if (rngRules.mode === "probabilistic") {
        return originalRandomChance(numerator, denominator);
      }

      const isPlayer = currentAttacker === "p1";
      const ruleValue = (key: keyof typeof rngRules) => rngRules[key] || "worst_case";

      if (currentContext === "accuracy") {
        const accRule = ruleValue("accuracy");
        if (accRule === "vanilla") return originalRandomChance(numerator, denominator);
        if (accRule === "worst_case") return isPlayer ? numerator >= denominator : true;
        if (accRule === "perfect") return true;
      }

      if (currentContext === "damage_roll" || currentContext === "crit") {
        // Crits are calculated via randomChance(1, 24) inside getDamage
        const critRule = ruleValue("crits");
        if (critRule === "vanilla") return originalRandomChance(numerator, denominator);
        if (critRule === "none") return numerator >= denominator; // Only true if 100%
        if (critRule === "worst_case") return isPlayer ? numerator >= denominator : true;
        if (critRule === "always") return true;
      }

      if (currentContext === "secondary") {
        const secRule = ruleValue("secondaryEffects");
        if (secRule === "vanilla") return originalRandomChance(numerator, denominator);
        if (secRule === "none") return numerator >= denominator;
        if (secRule === "worst_case") return isPlayer ? numerator >= denominator : true;
        if (secRule === "always") return true;
      }

      return originalRandomChance(numerator, denominator);
    };

    // Override random (Damage Rolls, Speed Ties, Sleep Turns)
    const originalRandom = this.battle.random.bind(this.battle);
    this.battle.random = (m?: number, n?: number) => {
      if (rngRules.mode === "probabilistic") {
        return originalRandom(m, n);
      }

      const isPlayer = currentAttacker === "p1";

      // Damage Roll (random(16))
      if (currentContext === "damage_roll" && m === 16 && n === undefined) {
        const dmgRule = rngRules.damageRoll || "worst_case";
        if (dmgRule === "vanilla") return originalRandom(m, n);
        if (dmgRule === "expected") return 8; // Middle of 0-15
        if (dmgRule === "min") return 15; // 100 - 15 = 85%
        if (dmgRule === "max") return 0; // 100 - 0 = 100%
        if (dmgRule === "worst_case") return isPlayer ? 15 : 0;
      }

      // If we need to intercept speed ties or sleep turns, we could do it here
      // For now, vanilla behavior for other random() calls in deterministic mode unless handled
      return originalRandom(m, n);
    };
  }

  private applySideState(side: Side, activeData: TsumePokemon[]) {
    activeData.forEach((pokeData, i) => {
      const poke = side.active[i];
      if (!poke) return;
      if (pokeData.hpCurrent !== undefined) {
        poke.sethp(pokeData.hpCurrent);
      }
      if (pokeData.status) {
        poke.setStatus(pokeData.status);
      }
      // Volatiles and stat stages can be added here later
    });
  }

  public injectSeed(seed: number[]) {
    // Overwrite the PRNG seed mid-battle
    this.battle.prng.seed = [...seed];
  }

  /**
   * Simulate a single turn given choices for p1 and p2.
   * Returns true if the battle is over.
   */
  public simulateTurn(p1Choice: string, p2Choice: string): boolean {
    try {
      this.battle.makeChoices(p1Choice, p2Choice);
    } catch (e) {
      console.log("CRASH in simulateTurn!");
      console.log("P1 Choice:", p1Choice);
      console.log("P2 Choice:", p2Choice);
      console.log("P1 Queued:", this.battle.p1.choice);
      console.log("P2 Queued:", this.battle.p2.choice);
      throw e;
    }
    return this.battle.ended;
  }

  public getLog(): string[] {
    return this.battle.log;
  }

  public getP1ActiveHP(index = 0): number {
    return this.battle.p1.active[index]?.hp || 0;
  }

  public getP1ActiveMaxHP(index = 0): number {
    return this.battle.p1.active[index]?.maxhp || 1;
  }

  public getP2ActiveHP(index = 0): number {
    return this.battle.p2.active[index]?.hp || 0;
  }

  public getP2ActiveMaxHP(index = 0): number {
    return this.battle.p2.active[index]?.maxhp || 1;
  }

  public get winner(): string | undefined {
    return this.battle.winner;
  }

  public get p1Fainted(): boolean {
    return this.battle.p1.pokemon.every((p) => p.fainted || p.hp <= 0);
  }

  public get p2Fainted(): boolean {
    return this.battle.p2.pokemon.every((p) => p.fainted || p.hp <= 0);
  }

  /**
   * Evaluates the pre-computed optimal response for the given history key.
   */
  public getOpponentHeuristicChoice(historyKey: string): string {
    if (this.tsumeData.opponentResponses && this.tsumeData.opponentResponses[historyKey]) {
      return this.tsumeData.opponentResponses[historyKey];
    }
    return "default";
  }
}
