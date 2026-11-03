---
description: "Rules for ensuring translation keys are consistent across localization files"
trigger: always_on
---
# i18n Translation Consistency

When adding new user-facing features, components, or widgets, you MUST ensure that all new translation keys are added to ALL localization files (e.g., public/locales/ja/translation.json and public/locales/en/translation.json). Never leave raw i18n keys exposed in the UI.

**No Fallback Strings in Code**: Do NOT use i18n fallback strings in your `t()` calls (e.g., `t("quiz.result.share", "結果をXでシェア")`). All translation strings must be defined exclusively inside the localization JSON files. The `t()` function must only take the translation key as its primary string argument.

## Validation & Dev Cache
- **Mandatory Zero-Error Validation**: Whenever you add, modify, or remove translation keys, you MUST run `pnpm run i18n:check` (or `pnpm --filter @poketistix/app run i18n:check`) before reporting your task as complete. Never assume your JSON modifications were successful without validating them. This script will ensure all keys match exactly between locales.
- **Cache Awareness**: Next.js statically caches JSON imports during development. If the JSON files are structurally sound but the UI continues to render English fallback texts for modified keys, the Next.js Webpack cache is stale. Do not debug nonexistent typos; inform the user they must restart their dev server (
pm run dev) to clear the cache.
