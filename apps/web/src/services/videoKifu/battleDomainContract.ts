import * as E from "fp-ts/lib/Either";

export type SlotIdent = "p1a" | "p1b" | "p2a" | "p2b";
export type SideIdent = "p1" | "p2";

export type WeatherKind = "Rain" | "HarshSunlight" | "Sandstorm" | "Snow";
export type TerrainKind = "Grassy" | "Electric" | "Misty" | "Psychic";
export type FieldEffectKind = "trick-room" | "gravity" | "wonder-room" | "magic-room";
export type SideConditionKind =
  | "tailwind"
  | "reflect"
  | "light-screen"
  | "aurora-veil"
  | "safeguard"
  | "mist"
  | "spikes"
  | "toxic-spikes"
  | "sticky-web"
  | "stealth-rock";

export type MajorStatusKind = "slp" | "brn" | "frz" | "par" | "psn" | "tox";

export interface ActiveMonState {
  readonly slug: string;
  readonly teamIdx: number | null;
  readonly currentHp: string;
  readonly status: MajorStatusKind | null;
  readonly volatile: Readonly<Record<string, boolean | number>>;
  readonly statStages: Readonly<Record<string, number>>;
  readonly itemSlug?: string | null;
}

export type SlotState =
  | { readonly kind: "empty" }
  | { readonly kind: "active"; readonly mon: ActiveMonState }
  | { readonly kind: "fainted"; readonly mon: ActiveMonState };

export interface BattleState {
  readonly phase: "lead" | "turn";
  readonly turnNumber: number;
  readonly slots: Readonly<Record<SlotIdent, SlotState>>;
  readonly observedSlugsBySide: Readonly<Record<SideIdent, readonly string[]>>;
  readonly weather:
    | { readonly kind: "None" }
    | { readonly kind: WeatherKind; readonly remainingTurns: number; readonly maxTurns: number };
  readonly terrain:
    | { readonly kind: "None" }
    | { readonly kind: TerrainKind; readonly remainingTurns: number; readonly maxTurns: number };
  readonly fieldEffects: Readonly<Record<FieldEffectKind, boolean>>;
  readonly sideConditions: Readonly<Record<SideIdent, Readonly<Record<string, number | boolean>>>>;
  readonly turnActions: {
    readonly actedSlots: ReadonlySet<SlotIdent>;
    readonly lastMove: {
      readonly slot: SlotIdent;
      readonly moveSlug: string;
      readonly targetSlot?: SlotIdent | null;
    } | null;
  };
}

export type ContractViolation =
  | {
      readonly type: "LeadAlreadyOccupied";
      readonly slot: SlotIdent;
      readonly currentSlug: string;
      readonly attemptedSlug: string;
    }
  | {
      readonly type: "LeadSpeciesDuplicateOnSide";
      readonly side: SideIdent;
      readonly slug: string;
    }
  | {
      readonly type: "RosterLimitExceeded";
      readonly side: SideIdent;
      readonly count: number;
      readonly attemptedSlug: string;
    }
  | {
      readonly type: "CannotSwitchIntoActiveSlot";
      readonly slot: SlotIdent;
      readonly currentSlug: string;
      readonly attemptedSlug: string;
    }
  | {
      readonly type: "SpeciesAlreadyActiveOnSide";
      readonly side: SideIdent;
      readonly slot: SlotIdent;
      readonly slug: string;
    }
  | {
      readonly type: "WeatherNotActive";
      readonly attemptedEndedWeather: WeatherKind | "None";
      readonly currentWeather: string;
    }
  | {
      readonly type: "TerrainNotActive";
      readonly attemptedEndedTerrain: TerrainKind | "None";
      readonly currentTerrain: string;
    }
  | {
      readonly type: "FieldEffectNotActive";
      readonly effect: FieldEffectKind;
    }
  | {
      readonly type: "SideConditionNotActive";
      readonly side: SideIdent;
      readonly condition: SideConditionKind;
    }
  | {
      readonly type: "SlotNotActive";
      readonly slot: SlotIdent;
      readonly actualKind: "empty" | "fainted";
    }
  | {
      readonly type: "DuplicateActionWithoutInstruct";
      readonly slot: SlotIdent;
      readonly attemptedMove: string;
    }
  | {
      readonly type: "MajorStatusAlreadyPresent";
      readonly slot: SlotIdent;
      readonly currentStatus: MajorStatusKind;
      readonly attemptedStatus: MajorStatusKind;
    }
  | {
      readonly type: "StatusNotPresentForCure";
      readonly slot: SlotIdent;
      readonly attemptedCure: string;
    }
  | {
      readonly type: "CantMovePreconditionFailed";
      readonly slot: SlotIdent;
      readonly reason: string;
    }
  | {
      readonly type: "ResidualPreconditionFailed";
      readonly slot: SlotIdent;
      readonly effect: string;
      readonly reason: string;
    };

export function createInitialBattleState(): BattleState {
  return {
    phase: "lead",
    turnNumber: 0,
    slots: {
      p1a: { kind: "empty" },
      p1b: { kind: "empty" },
      p2a: { kind: "empty" },
      p2b: { kind: "empty" },
    },
    observedSlugsBySide: {
      p1: [],
      p2: [],
    },
    weather: { kind: "None" },
    terrain: { kind: "None" },
    fieldEffects: {
      "trick-room": false,
      gravity: false,
      "wonder-room": false,
      "magic-room": false,
    },
    sideConditions: {
      p1: {},
      p2: {},
    },
    turnActions: {
      actedSlots: new Set(),
      lastMove: null,
    },
  };
}

const getSide = (slot: SlotIdent): SideIdent => (slot.startsWith("p1") ? "p1" : "p2");
const getOtherSlot = (slot: SlotIdent): SlotIdent => {
  switch (slot) {
    case "p1a":
      return "p1b";
    case "p1b":
      return "p1a";
    case "p2a":
      return "p2b";
    case "p2b":
      return "p2a";
  }
};

/**
 * 1. 先発着地契約 (Lead Deployment Precondition)
 * - ターン1前の先発フェーズにおいて各スロットは1回限り確定（Single Assignment）
 * - 同一サイドに同種族の重複は不可（Species Clause）
 * - 4体選出ルール（サイドあたり最大4体）
 */
export function validateLeadDeploy(
  state: BattleState,
  slot: SlotIdent,
  mon: { slug: string; teamIdx?: number | null; hp?: string; itemSlug?: string | null },
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[slot];
  if (current.kind !== "empty") {
    return E.left({
      type: "LeadAlreadyOccupied",
      slot,
      currentSlug: current.mon.slug,
      attemptedSlug: mon.slug,
    });
  }

  const side = getSide(slot);
  const otherSlot = getOtherSlot(slot);
  const other = state.slots[otherSlot];
  if (other.kind === "active" && other.mon.slug === mon.slug) {
    return E.left({
      type: "LeadSpeciesDuplicateOnSide",
      side,
      slug: mon.slug,
    });
  }

  const currentSideSlugs = state.observedSlugsBySide[side];
  const baseSlug = mon.slug.replace(/-mega(-[xyz])?$/, "");
  const alreadyObserved = currentSideSlugs.some(
    (s) => s === mon.slug || s.replace(/-mega(-[xyz])?$/, "") === baseSlug,
  );
  if (!alreadyObserved && currentSideSlugs.length >= 4) {
    return E.left({
      type: "RosterLimitExceeded",
      side,
      count: currentSideSlugs.length,
      attemptedSlug: mon.slug,
    });
  }

  const nextSideSlugs = alreadyObserved ? currentSideSlugs : [...currentSideSlugs, baseSlug];

  const newMon: ActiveMonState = {
    slug: mon.slug,
    teamIdx: mon.teamIdx ?? null,
    currentHp: mon.hp ?? "100%",
    status: null,
    volatile: {},
    statStages: {},
    itemSlug: mon.itemSlug,
  };

  return E.right({
    ...state,
    slots: {
      ...state.slots,
      [slot]: { kind: "active", mon: newMon },
    },
    observedSlugsBySide: {
      ...state.observedSlugsBySide,
      [side]: nextSideSlugs,
    },
  });
}

/**
 * 2. 交代繰り出し契約 (Switch-In Precondition)
 * - 生存中のアクティブスロットへの上書きは契約違反（空きまたはひんしスロットへのみ着地可）
 * - 同一サイドで別スロットに現在生存しているポケモンの重複繰り出しは禁止
 * - VGC 4体選出上限の遵守
 */
export function validateSwitchIn(
  state: BattleState,
  slot: SlotIdent,
  mon: { slug: string; teamIdx?: number | null; hp?: string; itemSlug?: string | null },
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[slot];
  if (current.kind === "active") {
    return E.left({
      type: "CannotSwitchIntoActiveSlot",
      slot,
      currentSlug: current.mon.slug,
      attemptedSlug: mon.slug,
    });
  }

  const side = getSide(slot);
  const otherSlot = getOtherSlot(slot);
  const other = state.slots[otherSlot];
  if (other.kind === "active" && other.mon.slug === mon.slug) {
    return E.left({
      type: "SpeciesAlreadyActiveOnSide",
      side,
      slot: otherSlot,
      slug: mon.slug,
    });
  }

  const currentSideSlugs = state.observedSlugsBySide[side];
  const baseSlug = mon.slug.replace(/-mega(-[xyz])?$/, "");
  const alreadyObserved = currentSideSlugs.some(
    (s) => s === mon.slug || s.replace(/-mega(-[xyz])?$/, "") === baseSlug,
  );
  if (!alreadyObserved && currentSideSlugs.length >= 4) {
    return E.left({
      type: "RosterLimitExceeded",
      side,
      count: currentSideSlugs.length,
      attemptedSlug: mon.slug,
    });
  }

  const nextSideSlugs = alreadyObserved ? currentSideSlugs : [...currentSideSlugs, baseSlug];

  const newMon: ActiveMonState = {
    slug: mon.slug,
    teamIdx: mon.teamIdx ?? (current.kind === "fainted" ? current.mon.teamIdx : null),
    currentHp: mon.hp ?? "100%",
    status: null,
    volatile: {},
    statStages: {},
    itemSlug: mon.itemSlug,
  };

  return E.right({
    ...state,
    slots: {
      ...state.slots,
      [slot]: { kind: "active", mon: newMon },
    },
    observedSlugsBySide: {
      ...state.observedSlugsBySide,
      [side]: nextSideSlugs,
    },
  });
}

/**
 * 3. 控えへの引っこめ契約 (Withdraw Precondition)
 */
export function validateWithdraw(
  state: BattleState,
  slot: SlotIdent,
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[slot];
  if (current.kind !== "active") {
    return E.left({
      type: "SlotNotActive",
      slot,
      actualKind: current.kind,
    });
  }

  return E.right({
    ...state,
    slots: {
      ...state.slots,
      [slot]: { kind: "empty" },
    },
  });
}

/**
 * 4. ひんし契約 (Faint Precondition)
 */
export function validateFaint(
  state: BattleState,
  slot: SlotIdent,
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[slot];
  if (current.kind !== "active") {
    return E.left({
      type: "SlotNotActive",
      slot,
      actualKind: current.kind,
    });
  }

  return E.right({
    ...state,
    slots: {
      ...state.slots,
      [slot]: {
        kind: "fainted",
        mon: {
          ...current.mon,
          currentHp: "0%",
        },
      },
    },
  });
}

/**
 * 5. 天候終了契約 (Weather End Precondition)
 * - 現在天候が None なら解除不可
 * - 特定天候の終了メッセージ（「雨が上がった」等）は現在の天候と完全一致が必須
 */
export function validateWeatherEnd(
  state: BattleState,
  endedKind: WeatherKind | "None" = "None",
): E.Either<ContractViolation, BattleState> {
  if (state.weather.kind === "None") {
    return E.left({
      type: "WeatherNotActive",
      attemptedEndedWeather: endedKind,
      currentWeather: "None",
    });
  }

  if (endedKind !== "None" && state.weather.kind !== endedKind) {
    return E.left({
      type: "WeatherNotActive",
      attemptedEndedWeather: endedKind,
      currentWeather: state.weather.kind,
    });
  }

  return E.right({
    ...state,
    weather: { kind: "None" },
  });
}

/**
 * 6. フィールド終了契約 (Terrain End Precondition)
 */
export function validateTerrainEnd(
  state: BattleState,
  endedKind: TerrainKind | "None" = "None",
): E.Either<ContractViolation, BattleState> {
  if (state.terrain.kind === "None") {
    return E.left({
      type: "TerrainNotActive",
      attemptedEndedTerrain: endedKind,
      currentTerrain: "None",
    });
  }

  if (endedKind !== "None" && state.terrain.kind !== endedKind) {
    return E.left({
      type: "TerrainNotActive",
      attemptedEndedTerrain: endedKind,
      currentTerrain: state.terrain.kind,
    });
  }

  return E.right({
    ...state,
    terrain: { kind: "None" },
  });
}

/**
 * 7. トリックルーム等の全体場効果終了契約
 */
export function validateFieldEffectEnd(
  state: BattleState,
  effect: FieldEffectKind,
): E.Either<ContractViolation, BattleState> {
  if (!state.fieldEffects[effect]) {
    return E.left({
      type: "FieldEffectNotActive",
      effect,
    });
  }

  return E.right({
    ...state,
    fieldEffects: {
      ...state.fieldEffects,
      [effect]: false,
    },
  });
}

/**
 * 8. 追い風・壁等のサイド効果終了契約
 */
export function validateSideConditionEnd(
  state: BattleState,
  side: SideIdent,
  condition: SideConditionKind,
): E.Either<ContractViolation, BattleState> {
  const current = state.sideConditions[side][condition];
  if (!current) {
    return E.left({
      type: "SideConditionNotActive",
      side,
      condition,
    });
  }

  const nextConditions = { ...state.sideConditions[side] };
  delete nextConditions[condition];

  return E.right({
    ...state,
    sideConditions: {
      ...state.sideConditions,
      [side]: nextConditions,
    },
  });
}

/**
 * 9. 技実行契約 (Move Execution Precondition)
 * - スロットが active であること（ひんし・不在スロットは技使用不可）
 * - 行動回数制限: 1ターン原則1回。
 *   Champions環境における唯一の正当な例外: 直前の技が「さいはい (instruct)」であり、かつ対象が自身であること
 */
export function validateMoveExecution(
  state: BattleState,
  actor: SlotIdent,
  moveSlug: string,
  targetSlot?: SlotIdent | null,
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[actor];
  if (current.kind !== "active") {
    return E.left({
      type: "SlotNotActive",
      slot: actor,
      actualKind: current.kind,
    });
  }

  const hasActed = state.turnActions.actedSlots.has(actor);
  if (hasActed) {
    const isInstructed =
      state.turnActions.lastMove?.moveSlug === "instruct" &&
      state.turnActions.lastMove.targetSlot === actor;
    if (!isInstructed) {
      return E.left({
        type: "DuplicateActionWithoutInstruct",
        slot: actor,
        attemptedMove: moveSlug,
      });
    }
  }

  const nextActed = new Set(state.turnActions.actedSlots);
  nextActed.add(actor);

  return E.right({
    ...state,
    turnActions: {
      actedSlots: nextActed,
      lastMove: {
        slot: actor,
        moveSlug,
        targetSlot,
      },
    },
  });
}

/**
 * 10. 状態異常付与契約 (Major Status Precondition)
 * - 主要状態異常（slp, brn, frz, par, psn, tox）の重複付与はルール上不可
 */
export function validateStatusInflict(
  state: BattleState,
  slot: SlotIdent,
  status: MajorStatusKind,
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[slot];
  if (current.kind !== "active") {
    return E.left({
      type: "SlotNotActive",
      slot,
      actualKind: current.kind,
    });
  }

  if (current.mon.status !== null) {
    return E.left({
      type: "MajorStatusAlreadyPresent",
      slot,
      currentStatus: current.mon.status,
      attemptedStatus: status,
    });
  }

  return E.right({
    ...state,
    slots: {
      ...state.slots,
      [slot]: {
        kind: "active",
        mon: {
          ...current.mon,
          status,
        },
      },
    },
  });
}

/**
 * 11. 状態異常治癒契約 (Status Cure Precondition)
 * - 現在その状態異常にかかっていないのに「目を覚ます」「治る」等の遷移は不可
 */
export function validateStatusCure(
  state: BattleState,
  slot: SlotIdent,
  statusToCure: MajorStatusKind | "confusion",
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[slot];
  if (current.kind !== "active") {
    return E.left({
      type: "SlotNotActive",
      slot,
      actualKind: current.kind,
    });
  }

  if (statusToCure === "confusion") {
    if (!current.mon.volatile.confusion) {
      return E.left({
        type: "StatusNotPresentForCure",
        slot,
        attemptedCure: "confusion",
      });
    }
    const nextVolatile = { ...current.mon.volatile };
    delete nextVolatile.confusion;
    return E.right({
      ...state,
      slots: {
        ...state.slots,
        [slot]: {
          kind: "active",
          mon: { ...current.mon, volatile: nextVolatile },
        },
      },
    });
  }

  if (current.mon.status !== statusToCure) {
    return E.left({
      type: "StatusNotPresentForCure",
      slot,
      attemptedCure: statusToCure,
    });
  }

  return E.right({
    ...state,
    slots: {
      ...state.slots,
      [slot]: {
        kind: "active",
        mon: {
          ...current.mon,
          status: null,
        },
      },
    },
  });
}

/**
 * 12. 行動不能契約 (Cant Move Precondition)
 * - 眠りで動けないなら slp、痺れて動けないなら par が必須
 */
export function validateCantMove(
  state: BattleState,
  slot: SlotIdent,
  reason: "slp" | "par" | "frz",
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[slot];
  if (current.kind !== "active") {
    return E.left({
      type: "SlotNotActive",
      slot,
      actualKind: current.kind,
    });
  }

  if (current.mon.status !== reason) {
    return E.left({
      type: "CantMovePreconditionFailed",
      slot,
      reason: `スロット ${slot} は現在 ${reason} ではないため行動不能になり得ない (実態: ${current.mon.status ?? "なし"})`,
    });
  }

  return E.right(state);
}

/**
 * 13. 定数ダメージ契約 (Residual Damage Precondition)
 * - 砂嵐ダメージは天候が Sandstorm でなければ不可
 * - 毒・火傷ダメージは該当状態異常でなければ不可
 */
export function validateResidualDamage(
  state: BattleState,
  slot: SlotIdent,
  effect: "sandstorm" | "poison" | "burn" | "life-orb",
): E.Either<ContractViolation, BattleState> {
  const current = state.slots[slot];
  if (current.kind !== "active") {
    return E.left({
      type: "SlotNotActive",
      slot,
      actualKind: current.kind,
    });
  }

  if (effect === "sandstorm" && state.weather.kind !== "Sandstorm") {
    return E.left({
      type: "ResidualPreconditionFailed",
      slot,
      effect,
      reason: `天候が Sandstorm ではない (実態: ${state.weather.kind})`,
    });
  }

  if (effect === "poison" && current.mon.status !== "psn" && current.mon.status !== "tox") {
    return E.left({
      type: "ResidualPreconditionFailed",
      slot,
      effect,
      reason: `スロット ${slot} は毒状態ではない (実態: ${current.mon.status ?? "なし"})`,
    });
  }

  if (effect === "burn" && current.mon.status !== "brn") {
    return E.left({
      type: "ResidualPreconditionFailed",
      slot,
      effect,
      reason: `スロット ${slot} は火傷状態ではない (実態: ${current.mon.status ?? "なし"})`,
    });
  }

  if (effect === "life-orb") {
    if (current.mon.itemSlug && current.mon.itemSlug !== "life-orb") {
      return E.left({
        type: "ResidualPreconditionFailed",
        slot,
        effect,
        reason: `スロット ${slot} はいのちのたま所持者ではない (実態: ${current.mon.itemSlug})`,
      });
    }
    const updatedMon = { ...current.mon, itemSlug: "life-orb" };
    return E.right({
      ...state,
      slots: {
        ...state.slots,
        [slot]: { ...current, mon: updatedMon },
      },
    });
  }

  return E.right(state);
}
