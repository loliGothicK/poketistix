import type { DamageInput, DamageOutput } from "./types";

type DamageCalcModule = {
  calculate: (input: DamageInput) => DamageOutput;
  type_effectiveness_shift: (att: number, def1: number, def2?: number | null) => number;
  is_immune: (att: number, def1: number, def2?: number | null) => boolean;
};

let modulePromise: Promise<DamageCalcModule> | null = null;

async function loadWithRetry(retries = 2, delayMs = 300): Promise<DamageCalcModule> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return (await import("@poketistix/damage-calc")) as unknown as DamageCalcModule;
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error("Failed to load damage-calc module");
}

/**
 * Lazily load and initialise the WASM engine, caching the module across calls.
 *
 * The `bundler` build initialises the wasm instance on import (`__wbindgen_start`),
 * so a single dynamic import is enough.
 */
async function load(): Promise<DamageCalcModule> {
  if (!modulePromise) {
    modulePromise = loadWithRetry().catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

/** Run a full damage calculation, returning all 16 rolls plus min/max. */
export async function calculate(input: DamageInput): Promise<DamageOutput> {
  const mod = await load();
  // serde-wasm-bindgen attempts to deserialize keys present with value `undefined`,
  // which causes errors for sequences (Vec) and integers (u16). Omit undefined keys so
  // Rust's #[serde(default)] triggers correctly.
  const sanitized = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as unknown as DamageInput;
  try {
    return mod.calculate(sanitized);
  } catch (e) {
    console.error(
      "[damage-calc] WASM calculate threw:",
      e,
      "\nInput:",
      JSON.stringify(input, null, 2),
    );
    throw e;
  }
}

/**
 * Preload the engine (e.g. on route mount) so the first user-triggered
 * calculation does not pay the wasm-instantiation cost.
 */
export function preloadDamageEngine(): void {
  void load().catch((err) => {
    // Speculative preload: ignore network aborts, offline state, or transient failures
    // so they do not bubble up as unhandled promise rejections (e.g. Sentry error in Mobile Safari).
    // The engine will be retried on-demand during subsequent calculations.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[damage-calc] Speculative preload failed (will retry on calculate):", err);
    }
  });
}

/** Reset cached module promise (useful for tests). */
export function _resetModuleForTesting(): void {
  modulePromise = null;
}
