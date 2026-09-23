/**
 * Patterns for errors that originate from external environments such as browser extensions,
 * mobile browser reader mode injected scripts (e.g. Firefox iOS / Brave reader mode),
 * and should be ignored by Sentry client reporting.
 */
export const SENTRY_IGNORE_ERRORS: (string | RegExp)[] = [
  // Mobile browser injected reader mode scripts (e.g. Firefox iOS / Brave reader mode)
  "window.__firefox__.reader",
  "Can't find variable: __firefox__",
  /__firefox__/i,
];

/**
 * Checks whether an error message or string representation matches any of the ignored error patterns.
 */
export function isIgnoredError(message: string): boolean {
  return SENTRY_IGNORE_ERRORS.some((pattern) => {
    if (typeof pattern === "string") {
      return message.includes(pattern);
    }
    return pattern.test(message);
  });
}
