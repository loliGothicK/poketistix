import { describe, expect, it } from "vitest";
import { isIgnoredError, SENTRY_IGNORE_ERRORS } from "./sentry-filter";

describe("sentry-filter", () => {
  it("includes patterns for browser-injected firefox reader mode scripts", () => {
    expect(SENTRY_IGNORE_ERRORS).toBeDefined();
    expect(SENTRY_IGNORE_ERRORS.length).toBeGreaterThan(0);
  });

  it("filters out Firefox/Brave iOS reader script errors", () => {
    const error1 = "TypeError: undefined is not an object (evaluating 'window.__firefox__.reader')";
    const error2 = "ReferenceError: Can't find variable: __firefox__";
    const error3 = "TypeError: window.__firefox__.reader.getArticle is not a function";

    expect(isIgnoredError(error1)).toBe(true);
    expect(isIgnoredError(error2)).toBe(true);
    expect(isIgnoredError(error3)).toBe(true);
  });

  it("does not filter out legitimate application errors", () => {
    const error1 = "TypeError: Cannot read properties of undefined (reading 'species')";
    const error2 = "ReferenceError: activePokemon is not defined";
    const error3 = "Error: Failed to fetch battle record";

    expect(isIgnoredError(error1)).toBe(false);
    expect(isIgnoredError(error2)).toBe(false);
    expect(isIgnoredError(error3)).toBe(false);
  });
});
