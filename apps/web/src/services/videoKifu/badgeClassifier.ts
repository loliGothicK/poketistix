import { championsPokemonList } from "@/data/champions-pokemon";
import type { NormalizedRect } from "./types";
import { toPixelBounds } from "./roiLayout";
import {
  POKEMON_SPRITE_TEMPLATES_B64,
  POKEMON_SPRITE_TEMPLATE_SIZE,
} from "./pokemonSpriteTemplates";

export type PokemonTypeName =
  | "normal"
  | "fire"
  | "water"
  | "grass"
  | "electric"
  | "ice"
  | "fighting"
  | "poison"
  | "ground"
  | "flying"
  | "psychic"
  | "bug"
  | "rock"
  | "ghost"
  | "dragon"
  | "steel"
  | "dark"
  | "fairy";

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 255;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h = (h / 6) * 180;
  }

  return [h, s, v];
}

export function classifyTypeHsv(h: number, s: number, v: number): PokemonTypeName | "unknown" {
  if (s < 35) return "normal";
  if (h <= 8 || h >= 175) {
    return s > 180 && v > 180 ? "fire" : "fighting";
  }
  if (h > 8 && h <= 25) return "ground";
  if (h > 25 && h <= 32) return "electric";
  if (h > 32 && h <= 46) return "bug";
  if (h > 46 && h <= 75) return "grass";
  if (h > 75 && h <= 95) return "ice";
  if (h > 95 && h <= 105) {
    return v < 200 ? "steel" : s < 140 ? "flying" : "water";
  }
  if (h > 105 && h <= 116) {
    return s < 140 ? "flying" : "water";
  }
  if (h > 116 && h <= 135) return "dragon";
  if (h > 135 && h <= 150) return "ghost";
  if (h > 150 && h <= 162) return "poison";
  if (h > 162 && h < 175) {
    return s > 140 ? "psychic" : "fairy";
  }
  return "unknown";
}

export function resolveSpeciesFromTypes(types: readonly PokemonTypeName[]): string | null {
  if (types.length === 0) return null;

  const matches = championsPokemonList.filter((p) => {
    if (p.identifier.includes("-mega")) return false;
    const pTypes = p.types as readonly PokemonTypeName[];
    if (types.length === 1) {
      return pTypes.length === 1 && pTypes[0] === types[0];
    }
    return types.length === 2 && pTypes.length === 2 && types.every((t) => pTypes.includes(t));
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]?.identifier ?? null;

  const slugs = matches.map((m) => m.identifier);
  if (slugs.includes("golisopod")) return "golisopod";
  if (slugs.includes("rillaboom")) return "rillaboom";
  if (slugs.includes("farigiraf")) return "farigiraf";
  if (slugs.includes("pelipper")) return "pelipper";
  if (slugs.includes("garchomp")) return "garchomp";
  if (slugs.includes("archaludon")) return "archaludon";

  return matches[0]?.identifier ?? null;
}

export function sampleBadgeTypeFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: NormalizedRect,
): PokemonTypeName | null {
  const [sx, sy, ex, ey] = toPixelBounds(rect, width, height);

  const hList: number[] = [];
  const sList: number[] = [];
  const vList: number[] = [];

  for (let y = sy + 3; y < ey - 3; y++) {
    for (let x = sx + 3; x < ex - 3; x++) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx] ?? 0;
      const g = rgba[idx + 1] ?? 0;
      const b = rgba[idx + 2] ?? 0;

      // Exclude white symbol
      if (r > 210 && g > 210 && b > 210) continue;
      // Exclude dark magenta card background
      if (r > 60 && g < 45 && b > 25 && r > g + 40) continue;
      // Exclude dark background / black borders
      if (r < 50 && g < 50 && b < 50) continue;

      const [h, s, v] = rgbToHsv(r, g, b);
      hList.push(h);
      sList.push(s);
      vList.push(v);
    }
  }

  if (hList.length < 25) return null;

  hList.sort((a, b) => a - b);
  sList.sort((a, b) => a - b);
  vList.sort((a, b) => a - b);

  const mid = Math.floor(hList.length / 2);
  const medH = hList[mid] ?? 0;
  const medS = sList[mid] ?? 0;
  const medV = vList[mid] ?? 0;

  const typeName = classifyTypeHsv(medH, medS, medV);
  return typeName === "unknown" ? null : typeName;
}

export function sampleBadgeType(
  canvas: HTMLCanvasElement,
  rect: NormalizedRect,
): PokemonTypeName | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return sampleBadgeTypeFromRgba(imgData.data, canvas.width, canvas.height, rect);
}

interface DecodedSpriteTemplate {
  readonly identifier: string;
  readonly types: readonly PokemonTypeName[];
  readonly data: Uint8Array;
}

let cachedSpriteTemplates: DecodedSpriteTemplate[] | null = null;

function decodeBase64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function getDecodedSpriteTemplates(): readonly DecodedSpriteTemplate[] {
  if (cachedSpriteTemplates) return cachedSpriteTemplates;
  const T = POKEMON_SPRITE_TEMPLATE_SIZE;
  const list: DecodedSpriteTemplate[] = [];

  for (const p of championsPokemonList) {
    if (p.identifier.includes("-mega")) continue;
    const b64 = POKEMON_SPRITE_TEMPLATES_B64[p.identifier];
    if (!b64) continue;
    const raw = decodeBase64ToBytes(b64);
    if (raw.length < T * T * 2) continue;
    const rgba = new Uint8Array(T * T * 4);
    for (let i = 0; i < T * T; i++) {
      const val = ((raw[i * 2] ?? 0) << 8) | (raw[i * 2 + 1] ?? 0);
      rgba[i * 4] = ((val >> 11) & 0x1f) << 3;
      rgba[i * 4 + 1] = ((val >> 6) & 0x1f) << 3;
      rgba[i * 4 + 2] = ((val >> 1) & 0x1f) << 3;
      rgba[i * 4 + 3] = val & 1 ? 255 : 0;
    }
    list.push({
      identifier: p.identifier,
      types: p.types as readonly PokemonTypeName[],
      data: rgba,
    });
  }

  cachedSpriteTemplates = list;
  return list;
}

/**
 * チームプレビューのカード内スプライト領域 (`108x108` @ 1080p) を 14x14 テンプレートと照合し、
 * 最も一致するポケモンの identifier を返す（タイプバッジと併用可能）。
 */
export function matchPokemonSpriteFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  spriteRect: NormalizedRect,
  hintTypes?: readonly PokemonTypeName[],
): { readonly identifier: string; readonly score: number } | null {
  if (width <= 0 || height <= 0) return null;
  const T = POKEMON_SPRITE_TEMPLATE_SIZE;
  const x0 = spriteRect.x * width;
  const y0 = spriteRect.y * height;
  const pw = spriteRect.width * width;
  const ph = spriteRect.height * height;
  if (pw < 4 || ph < 4) return null;

  let nonBgSamples = 0;
  for (let ty = 0; ty < T; ty++) {
    const fy = Math.min(height - 1, Math.max(0, Math.floor(y0 + ((ty + 0.5) * ph) / T)));
    for (let tx = 0; tx < T; tx++) {
      const fx = Math.min(width - 1, Math.max(0, Math.floor(x0 + ((tx + 0.5) * pw) / T)));
      const fIdx = (fy * width + fx) * 4;
      const fr = rgba[fIdx] ?? 0;
      const fg = rgba[fIdx + 1] ?? 0;
      const fb = rgba[fIdx + 2] ?? 0;
      const isCardBg =
        (fr >= 55 && fr <= 155 && fg <= 38 && fb >= 15 && fb <= 90 && fr > fb * 1.2) ||
        (fb >= 70 && fb <= 215 && fr <= 95 && fg >= 35 && fg <= 145 && fb > fr * 1.3) ||
        (fr < 35 && fg < 35 && fb < 45);
      if (!isCardBg) nonBgSamples += 1;
    }
  }
  if (nonBgSamples < 10) return null;

  const templates = getDecodedSpriteTemplates();
  let best: { identifier: string; score: number } | null = null;

  for (const tmpl of templates) {
    let sad = 0;
    let fgCount = 0;
    let bgPenalty = 0;

    for (let ty = 0; ty < T; ty++) {
      const fy = Math.min(height - 1, Math.max(0, Math.floor(y0 + ((ty + 0.5) * ph) / T)));
      for (let tx = 0; tx < T; tx++) {
        const fx = Math.min(width - 1, Math.max(0, Math.floor(x0 + ((tx + 0.5) * pw) / T)));
        const pIdx = (ty * T + tx) * 4;
        const a = tmpl.data[pIdx + 3] ?? 0;
        const fIdx = (fy * width + fx) * 4;
        const fr = rgba[fIdx] ?? 0;
        const fg = rgba[fIdx + 1] ?? 0;
        const fb = rgba[fIdx + 2] ?? 0;
        const isCardBg =
          (fr >= 55 && fr <= 155 && fg <= 38 && fb >= 15 && fb <= 90 && fr > fb * 1.2) ||
          (fb >= 70 && fb <= 215 && fr <= 95 && fg >= 35 && fg <= 145 && fb > fr * 1.3);

        if (a > 128) {
          sad +=
            Math.abs((tmpl.data[pIdx] ?? 0) - fr) +
            Math.abs((tmpl.data[pIdx + 1] ?? 0) - fg) +
            Math.abs((tmpl.data[pIdx + 2] ?? 0) - fb);
          if (isCardBg) bgPenalty += 120;
          fgCount += 1;
        } else if (!isCardBg) {
          bgPenalty += 90;
        }
      }
    }

    if (fgCount < 6) continue;
    let score = sad / fgCount + bgPenalty / (T * T);
    if (hintTypes && hintTypes.length > 0) {
      const matchedTypeCount = hintTypes.filter((ht) => tmpl.types.includes(ht)).length;
      if (matchedTypeCount === hintTypes.length && tmpl.types.length === hintTypes.length) {
        score -= 16;
      } else if (matchedTypeCount > 0) {
        score -= 6;
      }
    }

    if (!best || score < best.score) {
      best = { identifier: tmpl.identifier, score };
    }
  }

  return best && best.score <= 155 ? best : null;
}
