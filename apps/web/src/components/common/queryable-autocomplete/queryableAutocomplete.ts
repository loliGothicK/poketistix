/**
 * Framework-agnostic logic for the queryable autocomplete.
 *
 * The queryable autocomplete lets a user mix plain-text search with structured
 * field queries written as `@<key>:<value>` (e.g. `@type:fire`). The pieces here
 * are intentionally pure so they can be unit-tested without React or MUI:
 *
 * - {@link parseQueryInput} classifies what the *current, uncommitted* input is.
 * - {@link buildQuerySuggestions} produces the dropdown suggestions for that input.
 * - {@link toQueryTokenString} / {@link parseQueryToken} convert between the
 *   committed chip string (`@type:fire`) and a structured {@link QueryToken}.
 * - {@link matchesQueryTokens} applies committed tokens to a target as an AND filter.
 *
 * A key .design rule: partial input never filters results. `@type:fi` only shows
 * `fire`/`fighting` as *suggestions* to pick from; nothing is filtered until a
 * value is committed as a chip. Plain text is the one exception — it filters the
 * result set live, which is the expected behaviour for a name search.
 */

import { matchSearchText, normalizeForSearch } from "@/utils/text";

export const QUERY_PREFIX = "@";
export const QUERY_SEPARATOR = ":";

/** A queryable field, e.g. `type`, with a fixed set of allowed values. */
export interface QueryFieldDefinition {
  /** The key typed after `@`, e.g. `"type"` in `@type:fire`. */
  readonly key: string;
  /** Human-readable label for the key. Defaults to {@link key}. */
  readonly label?: string;
  /** The allowed values for this field. */
  readonly values: readonly QueryFieldValueDefinition[];
}

/** A single allowed value for a {@link QueryFieldDefinition}. */
export interface QueryFieldValueDefinition {
  /** The raw value, e.g. `"fire"`. */
  readonly value: string;
  /** Human-readable label. Defaults to {@link value}. */
  readonly label?: string;
}

/** A committed filter, either free text or a structured field query. */
export type QueryToken =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "field"; readonly key: string; readonly value: string };

/** What the current (uncommitted) input value represents. */
export type QueryInputMode =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "field-key"; readonly keyPrefix: string }
  | {
      readonly kind: "field-value";
      readonly field: QueryFieldDefinition;
      readonly valuePrefix: string;
    };

/** A single dropdown suggestion for the current input. */
export interface QuerySuggestion {
  /**
   * The string inserted into the input when picked. For a complete suggestion
   * this is also the committed chip string (e.g. `@type:fire`); for a partial
   * one it is the continuation to keep typing (e.g. `@type:`).
   */
  readonly insertValue: string;
  /** Primary label shown in the dropdown. */
  readonly label: string;
  /** Secondary caption (e.g. the field key) shown alongside the label. */
  readonly caption?: string;
  /**
   * `true`  — picking it commits a chip (a complete `@type:fire`).
   * `false` — picking it only continues the input (a partial `@type:`).
   */
  readonly committable: boolean;
}

const normalize = (value: string): string => normalizeForSearch(value);

const fieldValueString = (key: string, value: string): string =>
  `${QUERY_PREFIX}${key}${QUERY_SEPARATOR}${value}`;

/**
 * Classifies the current input value.
 *
 * - No leading `@` → `text` (plain search).
 * - `@` with no `:` yet → `field-key` (the user is choosing which field).
 * - `@<known-key>:` → `field-value` (the user is choosing a value).
 * - `@<unknown-key>:` → `field-key` (falls back so we can still suggest keys).
 */
export function parseQueryInput(
  inputValue: string,
  fields: readonly QueryFieldDefinition[],
): QueryInputMode {
  if (!inputValue.startsWith(QUERY_PREFIX)) {
    return { kind: "text", text: inputValue };
  }

  const body = inputValue.slice(QUERY_PREFIX.length);
  const separatorIndex = body.indexOf(QUERY_SEPARATOR);

  if (separatorIndex === -1) {
    return { kind: "field-key", keyPrefix: body };
  }

  const key = body.slice(0, separatorIndex);
  const valuePrefix = body.slice(separatorIndex + 1);
  const field = fields.find((candidate) => normalize(candidate.key) === normalize(key));

  if (!field) {
    return { kind: "field-key", keyPrefix: key };
  }

  return { kind: "field-value", field, valuePrefix };
}

/**
 * Builds the dropdown suggestions for the current input.
 *
 * Plain-text input produces no structured suggestions (the result set is
 * filtered live instead). `@` input suggests field keys; `@key:` input suggests
 * that field's values, prefix-filtered by whatever has been typed so far.
 */
export function buildQuerySuggestions(
  inputValue: string,
  fields: readonly QueryFieldDefinition[],
  limit = 20,
): readonly QuerySuggestion[] {
  const mode = parseQueryInput(inputValue, fields);

  if (mode.kind === "text") {
    return [];
  }

  const suggestions: QuerySuggestion[] = [];

  if (mode.kind === "field-key") {
    const prefix = normalize(mode.keyPrefix);

    for (const field of fields) {
      if (prefix.length > 0 && !normalize(field.key).startsWith(prefix)) {
        continue;
      }

      suggestions.push({
        insertValue: `${QUERY_PREFIX}${field.key}${QUERY_SEPARATOR}`,
        label: field.label ?? field.key,
        caption: `${QUERY_PREFIX}${field.key}`,
        committable: false,
      });

      if (suggestions.length >= limit) {
        break;
      }
    }

    return suggestions;
  }

  const prefix = normalize(mode.valuePrefix);
  const keyLabel = mode.field.label ?? mode.field.key;

  for (const value of mode.field.values) {
    if (prefix.length > 0 && !normalize(value.value).startsWith(prefix)) {
      continue;
    }

    suggestions.push({
      insertValue: fieldValueString(mode.field.key, value.value),
      label: value.label ?? value.value,
      caption: keyLabel,
      committable: true,
    });

    if (suggestions.length >= limit) {
      break;
    }
  }

  return suggestions;
}

/**
 * Whether the current input can be committed as a chip right now.
 *
 * Plain text commits when non-empty. A field query commits only when its value
 * exactly matches one of the field's allowed values — a partial value such as
 * `@type:fi` is not committable (the user must pick `fire` or `fighting`).
 */
export function isCommittableInput(
  inputValue: string,
  fields: readonly QueryFieldDefinition[],
): boolean {
  return toQueryTokenString(inputValue, fields) !== null;
}

/**
 * Normalises the current input into its canonical committed chip string, or
 * `null` when it cannot be committed. Field values are canonicalised to the
 * exact casing from the field definition (e.g. `@type:FIRE` → `@type:fire`).
 */
export function toQueryTokenString(
  inputValue: string,
  fields: readonly QueryFieldDefinition[],
): string | null {
  const mode = parseQueryInput(inputValue, fields);

  if (mode.kind === "text") {
    const trimmed = inputValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (mode.kind === "field-key") {
    return null;
  }

  const valuePrefix = normalize(mode.valuePrefix);
  const match = mode.field.values.find((value) => normalize(value.value) === valuePrefix);

  return match ? fieldValueString(mode.field.key, match.value) : null;
}

/** Parses a committed chip string back into a structured {@link QueryToken}. */
export function parseQueryToken(
  token: string,
  fields: readonly QueryFieldDefinition[],
): QueryToken {
  const mode = parseQueryInput(token, fields);

  if (mode.kind === "field-value") {
    const valuePrefix = normalize(mode.valuePrefix);
    const match = mode.field.values.find((value) => normalize(value.value) === valuePrefix);

    if (match) {
      return { kind: "field", key: mode.field.key, value: match.value };
    }
  }

  return { kind: "text", text: token };
}

/** The label shown on a committed chip (`type: fire`, or the raw text). */
export function queryTokenLabel(
  token: QueryToken,
  fields: readonly QueryFieldDefinition[],
): string {
  if (token.kind === "text") {
    return token.text;
  }

  const field = fields.find((candidate) => candidate.key === token.key);
  const keyLabel = field?.label ?? token.key;
  const valueLabel =
    field?.values.find((value) => value.value === token.value)?.label ?? token.value;

  return `${keyLabel}${QUERY_SEPARATOR} ${valueLabel}`;
}

/**
 * Resolves the *active* filter tokens from the committed chips plus the current
 * input. Committed chips always count; the current input counts only while it is
 * plain text, giving a responsive live name search without committing a chip.
 */
export function resolveActiveQueryTokens(
  committed: string[],
  inputValue: string,
  fields: readonly QueryFieldDefinition[],
): QueryToken[] {
  const tokens = committed.map((token) => parseQueryToken(token, fields));
  const mode = parseQueryInput(inputValue, fields);

  if (mode.kind === "text" && inputValue.trim().length > 0) {
    tokens.push({ kind: "text", text: inputValue.trim() });
  }

  return tokens;
}

/** The shape a consumer projects its items into so tokens can be matched. */
export interface QueryMatchTarget {
  /** Text that plain-text tokens are matched against (e.g. name + aliases). */
  readonly text: string;
  /** Field values keyed by field key, e.g. `{ type: ["fire", "flying"] }`. */
  readonly fields: Readonly<Record<string, readonly string[]>>;
}

export interface MatchesQueryTokensOptions {
  readonly isJapanese?: boolean;
}

/**
 * Applies the given tokens to a target as an AND filter: every token must match.
 * Text tokens match by case-insensitive substring (with optional Japanese Hiragana/Romaji support);
 * field tokens match when the target carries the exact value under that field key.
 */
export function matchesQueryTokens(
  target: QueryMatchTarget,
  tokens: readonly QueryToken[],
  options?: MatchesQueryTokensOptions,
): boolean {
  const isJapanese = options?.isJapanese ?? false;
  return tokens.every((token) => {
    if (token.kind === "text") {
      return matchSearchText(target.text, token.text, isJapanese);
    }

    const values = target.fields[token.key] ?? [];
    return values.some((value) => normalize(value) === normalize(token.value));
  });
}
